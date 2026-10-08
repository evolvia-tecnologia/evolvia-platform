'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken } from '../lib/api';
import { programActivityEditForm, programActivityEditPatch, type ProgramActivityEditForm } from '../lib/scientific-program-edit';
import ScientificEvaHelp from './scientific-eva-help';
import ScientificProgramAgenda from './scientific-program-agenda';
import { agendaStatusLabel } from '../lib/scientific-program-agenda';
import styles from './scientific-program.module.css';

type Space = {
  id: string;
  name: string;
  kind: 'ROOM' | 'AUDITORIUM' | 'STAGE' | 'VIRTUAL' | 'OTHER';
  capacity: number | null;
  location: string | null;
  active: boolean;
};

type Person = {
  id: string;
  name: string;
  institution: string | null;
  invitationStatus: string | null;
};

type Participant = {
  id: string;
  personId: string;
  participationType: string;
  customRoleLabel: string | null;
  person: { id: string; name: string; institution: string | null };
};

type ConfirmedWork = {
  id: string;
  title: string;
  status: string;
  stationPublicCode: number | null;
};

type Activity = {
  id: string;
  title: string;
  activityType: string;
  startAt: string;
  endAt: string;
  status: 'DRAFT' | 'READY_FOR_REVIEW' | 'PUBLISHED';
  spaceId: string | null;
  space: Space | null;
  participants: Participant[];
  submission?: ConfirmedWork | null;
};

type Conflict = {
  code: string;
  severity: 'BLOCKING' | 'WARNING';
  message: string;
  suggestion: string;
  entityIds?: string[];
};

type Taxonomy = {
  id: string;
  level: 'AREA' | 'SUBAREA' | 'TOPIC';
  name: string;
  parentId: string | null;
};

type ProgramPayload = {
  event: {
    id: string;
    name: string;
    status: string;
    startDate: string | null;
    endDate: string | null;
    timeZone?: string | null;
  };
  summary: {
    spaces: number;
    activities: number;
    readyForReview: number;
    published?: number;
    blockingConflicts: number;
    warnings: number;
  };
  spaces: Space[];
  activities: Activity[];
  people: Person[];
  taxonomy: Taxonomy[];
  acceptedWorks?: ConfirmedWork[];
  conflicts: Conflict[];
  nextAction: string;
};

const spaceKinds = [
  ['AUDITORIUM', 'Auditório'],
  ['ROOM', 'Sala'],
  ['STAGE', 'Palco'],
  ['VIRTUAL', 'Espaço virtual'],
  ['OTHER', 'Outro'],
] as const;

const participationTypes = [
  ['SPEAKER', 'Palestrante'],
  ['MODERATOR', 'Moderadora/Moderador'],
  ['DEBATER', 'Debatedora/Debatedor'],
  ['SESSION_CHAIR', 'Coordenadora/Coordenador de sessão'],
  ['GUEST', 'Convidada/Convidado'],
  ['OTHER', 'Outra função'],
] as const;

function dateTimeLabel(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

export default function ScientificProgram({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<ProgramPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ activity: Activity; form: ProgramActivityEditForm } | null>(null);
  const [editError, setEditError] = useState('');
  const [notice, setNotice] = useState('');
  const liveEventId = useRef(eventId);
  const editTitle = useRef<HTMLInputElement>(null);
  const editOpener = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (editing) editTitle.current?.focus();
    else editOpener.current?.focus();
  }, [editing?.activity.id]);

  function updateEditField(field: keyof ProgramActivityEditForm, value: string) {
    setEditing((current) => current ? { ...current, form: { ...current.form, [field]: value } } : null);
  }

  function closeEditor() {
    setEditing(null); setEditError('');
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing || saving) return;
    setEditError(''); setNotice('');
    try {
      const changes = programActivityEditPatch(editing.activity, editing.form);
      if (!Object.keys(changes).length) { closeEditor(); return; }
      setSaving(`edit:${editing.activity.id}`);
      const result = await api<ProgramPayload>(`/scientific-events/${eventId}/program/activities/${editing.activity.id}`, {
        method: 'PATCH', body: JSON.stringify(changes),
      });
      if (liveEventId.current !== eventId || result.event.id !== eventId) return;
      setPayload(result);
      closeEditor();
      setNotice('Alterações salvas. A atividade voltou a rascunho e precisa de nova revisão.');
    } catch (reason) {
      if (liveEventId.current === eventId) setEditError(reason instanceof Error ? reason.message : 'Não foi possível salvar as alterações.');
    } finally { if (liveEventId.current === eventId) setSaving(''); }
  }

  async function saveWork(event: FormEvent<HTMLFormElement>, activity: Activity) {
    event.preventDefault();
    if (saving) return;
    const field = event.currentTarget.elements.namedItem('submissionId');
    const selected = field && 'value' in field ? String(field.value) : '';
    const submissionId = selected || null;
    setError(''); setNotice('');
    setSaving(`work:${activity.id}`);
    try {
      const result = await api<ProgramPayload>(`/scientific-events/${eventId}/program/activities/${activity.id}/confirmed-work`, {
        method: 'PUT', body: JSON.stringify({ submissionId }),
      });
      if (liveEventId.current !== eventId || result.event.id !== eventId) return;
      setPayload(result);
      setNotice(submissionId
        ? 'Trabalho aceito vinculado. Ele aparece na página do evento quando esta atividade está publicada.'
        : 'O vínculo com o trabalho científico foi retirado.');
    } catch (reason) {
      if (liveEventId.current === eventId) setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o vínculo.');
    } finally { if (liveEventId.current === eventId) setSaving(''); }
  }
  const [spaceForm, setSpaceForm] = useState({ name: '', kind: 'AUDITORIUM', capacity: '', location: '' });
  const [activityForm, setActivityForm] = useState({
    title: '', activityType: 'Mesa-redonda', startAt: '', endAt: '', spaceId: '',
    description: '', taxonomyAreaId: '', taxonomySubareaId: '', taxonomyTopicId: '', operationalNotes: '',
  });
  const [participantForm, setParticipantForm] = useState({ activityId: '', personId: '', participationType: 'SPEAKER', customRoleLabel: '' });

  async function reload() {
    const result = await api<ProgramPayload>(`/scientific-events/${eventId}/program`);
    if (liveEventId.current !== eventId || result.event.id !== eventId) return;
    setPayload(result);
    if (!activityForm.spaceId && result.spaces.find((item) => item.active)) {
      setActivityForm((current) => ({ ...current, spaceId: result.spaces.find((item) => item.active)?.id ?? '' }));
    }
    if (!participantForm.activityId && result.activities[0]) {
      setParticipantForm((current) => ({ ...current, activityId: result.activities[0].id }));
    }
  }

  useEffect(() => {
    liveEventId.current = eventId;
    setLoading(true); setPayload(null); setError('');
    setEditing(null); setEditError(''); setNotice('');
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    reload()
      .catch((reason) => { if (liveEventId.current === eventId) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a programação.'); })
      .finally(() => { if (liveEventId.current === eventId) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, router]);

  const activeSpaces = useMemo(() => payload?.spaces.filter((item) => item.active) ?? [], [payload]);
  const areas = useMemo(() => payload?.taxonomy.filter((item) => item.level === 'AREA') ?? [], [payload]);
  const subareas = useMemo(() => payload?.taxonomy.filter((item) => item.level === 'SUBAREA' && (!activityForm.taxonomyAreaId || item.parentId === activityForm.taxonomyAreaId)) ?? [], [payload, activityForm.taxonomyAreaId]);
  const topics = useMemo(() => payload?.taxonomy.filter((item) => item.level === 'TOPIC' && (!activityForm.taxonomySubareaId || item.parentId === activityForm.taxonomySubareaId)) ?? [], [payload, activityForm.taxonomySubareaId]);

  async function submitSpace(event: FormEvent) {
    event.preventDefault();
    setSaving('space'); setError('');
    try {
      await api(`/scientific-events/${eventId}/program/spaces`, {
        method: 'POST',
        body: JSON.stringify({
          name: spaceForm.name,
          kind: spaceForm.kind,
          capacity: spaceForm.capacity ? Number(spaceForm.capacity) : undefined,
          location: spaceForm.location || undefined,
        }),
      });
      setSpaceForm({ name: '', kind: 'AUDITORIUM', capacity: '', location: '' });
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o espaço.');
    } finally { setSaving(''); }
  }

  async function submitActivity(event: FormEvent) {
    event.preventDefault();
    setError('');
    const startAt = new Date(activityForm.startAt);
    const endAt = new Date(activityForm.endAt);
    if (!activityForm.startAt || !activityForm.endAt || !Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime())) {
      setError('Informe datas e horários válidos para o início e o término da atividade.');
      return;
    }
    if (endAt <= startAt) {
      setError('O término da atividade deve ser posterior ao início.');
      return;
    }
    setSaving('activity');
    try {
      await api(`/scientific-events/${eventId}/program/activities`, {
        method: 'POST',
        body: JSON.stringify({
          title: activityForm.title,
          activityType: activityForm.activityType,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          spaceId: activityForm.spaceId || undefined,
          description: activityForm.description || undefined,
          taxonomyAreaId: activityForm.taxonomyAreaId || undefined,
          taxonomySubareaId: activityForm.taxonomySubareaId || undefined,
          taxonomyTopicId: activityForm.taxonomyTopicId || undefined,
          operationalNotes: activityForm.operationalNotes || undefined,
        }),
      });
      setActivityForm((current) => ({
        ...current, title: '', description: '', operationalNotes: '', taxonomyAreaId: '', taxonomySubareaId: '', taxonomyTopicId: '',
      }));
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a atividade.');
    } finally { setSaving(''); }
  }

  async function submitParticipant(event: FormEvent) {
    event.preventDefault();
    setSaving('participant'); setError('');
    try {
      await api(`/scientific-events/${eventId}/program/activities/${participantForm.activityId}/participants`, {
        method: 'POST',
        body: JSON.stringify({
          personId: participantForm.personId,
          participationType: participantForm.participationType,
          customRoleLabel: participantForm.participationType === 'OTHER' ? participantForm.customRoleLabel : undefined,
        }),
      });
      setParticipantForm((current) => ({ ...current, personId: '', customRoleLabel: '' }));
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível vincular o participante.');
    } finally { setSaving(''); }
  }

  async function markReady(activityId: string) {
    setSaving(`ready:${activityId}`); setError('');
    try {
      await api(`/scientific-events/${eventId}/program/activities/${activityId}/ready-for-review`, { method: 'POST' });
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'A atividade ainda possui pendências.');
    } finally { setSaving(''); }
  }

  async function changePublication(activity: Activity, publish: boolean) {
    setSaving(`publication:${activity.id}`); setError(''); setNotice('');
    try {
      const result = await api<ProgramPayload>(`/scientific-events/${eventId}/program/activities/${activity.id}/${publish ? 'publish' : 'unpublish'}`, { method: 'POST' });
      if (liveEventId.current !== eventId || result.event.id !== eventId) return;
      setPayload(result);
      setNotice(publish
        ? `“${activity.title}” aparece na programação da página do evento quando o evento estiver publicado. Só pessoas com convite confirmado são exibidas.`
        : `“${activity.title}” saiu da página do evento e continua revisada.`);
    } catch (reason) {
      if (liveEventId.current === eventId) setError(reason instanceof Error ? reason.message : 'Não foi possível alterar a publicação da atividade.');
    } finally { if (liveEventId.current === eventId) setSaving(''); }
  }

  if (loading) return <main className={styles.page}><div className={styles.loading}>A EVA está preparando a programação científica...</div></main>;
  if (!payload || payload.event.id !== eventId) return <main className={styles.page}><div className={styles.error}>{error || 'Programação não disponível.'}</div></main>;

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/painel">EVOLVIA</Link>
      <Link className={styles.back} href={`/eventos/${eventId}/cientifico/grade`}>Voltar à programação</Link>
    </header>

    <section className={styles.workspace}>
      <nav className={styles.flowReturn} aria-label="Retorno do fluxo">
        <Link href={`/eventos/${eventId}/cientifico/grade`}>Voltar à programação</Link>
        <Link href={`/eventos/${eventId}/painel`}>Voltar ao painel</Link>
      </nav>
      <div className={styles.hero}>
        <div><span className={styles.eyebrow}>GATE A5 · PROGRAMAÇÃO CIENTÍFICA</span><h1>{payload.event.name}</h1><p>Monte a programação em etapas curtas. Comece pelo essencial e acrescente detalhes depois.</p></div>
        <div className={styles.metrics}>
          <div><strong>{payload.summary.spaces}</strong><span>Espaços</span></div>
          <div><strong>{payload.summary.activities}</strong><span>Atividades</span></div>
          <div><strong>{payload.summary.blockingConflicts}</strong><span>Conflitos</span></div>
          <div><strong>{payload.summary.readyForReview}</strong><span>Prontas</span></div>
          <div><strong>{payload.summary.published ?? 0}</strong><span>Publicadas</span></div>
        </div>
      </div>

      <div className={styles.nextAction}><strong>Próxima ação recomendada</strong><p>{payload.nextAction}</p></div>
      {error && <div className={styles.error} role="alert">{error}</div>}
      <div role="status" aria-live="polite">{notice}</div>

      <ScientificProgramAgenda key={eventId} activities={payload.activities} timeZone={payload.event.timeZone} conflicts={payload.conflicts} disabled={Boolean(saving) || Boolean(editing)} onEdit={(id, opener) => {
        const activity = payload.activities.find((item) => item.id === id);
        if (!activity) return;
        editOpener.current = opener; setEditError(''); setNotice('');
        setEditing({ activity, form: programActivityEditForm(activity) });
      }} />

      <div className={styles.steps} aria-label="Etapas da programação">
        <span>1. Quando?</span><span>2. Onde?</span><span>3. O que?</span><span>4. Quem?</span><span>5. Opcionais</span><span>6. Conflitos</span>
      </div>

      <section className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardHead}><div><span className={styles.step}>ONDE ACONTECE?</span><h2>Cadastre um espaço</h2><p>Use para sala, auditório, palco ou ambiente virtual. Capacidade e localização são opcionais.</p></div></div>
          <form onSubmit={submitSpace} className={styles.form}>
            <label>Nome do espaço <small>Ex.: Auditório Principal</small><input required value={spaceForm.name} onChange={(e) => setSpaceForm({ ...spaceForm, name: e.target.value })} placeholder="Auditório Principal" /></label>
            <div className={styles.twoCols}>
              <label>Tipo <select value={spaceForm.kind} onChange={(e) => setSpaceForm({ ...spaceForm, kind: e.target.value })}>{spaceKinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Capacidade <small>Vagas da agenda do participante</small><input type="number" min="0" value={spaceForm.capacity} onChange={(e) => setSpaceForm({ ...spaceForm, capacity: e.target.value })} placeholder="300" /></label>
            </div>
            <label>Localização <small>Opcional · Ex.: 2º andar, ala norte</small><input value={spaceForm.location} onChange={(e) => setSpaceForm({ ...spaceForm, location: e.target.value })} /></label>
            <button className={styles.primary} disabled={Boolean(saving)}>{saving === 'space' ? 'Salvando…' : 'Salvar espaço'}</button>
          </form>
        </article>

        <article className={styles.cardWide}>
          <div className={styles.cardHead}><div><span className={styles.step}>QUANDO + O QUE ACONTECE?</span><h2>Crie uma atividade</h2><p>Informe primeiro título, tipo, data/horário e espaço. Os detalhes científicos podem ficar para depois.</p></div></div>
          <form onSubmit={submitActivity} className={styles.form}>
            <div className={styles.twoCols}>
              <label>Título da atividade <small>Ex.: Novas diretrizes em insuficiência cardíaca</small><input required value={activityForm.title} onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })} placeholder="Novas diretrizes em insuficiência cardíaca" /></label>
              <label>Tipo da atividade <small>Ex.: Mesa-redonda</small><input required value={activityForm.activityType} onChange={(e) => setActivityForm({ ...activityForm, activityType: e.target.value })} /></label>
            </div>
            <div className={styles.threeCols}>
              <label>Início <input required type="datetime-local" value={activityForm.startAt} onChange={(e) => { const value = e.currentTarget.value; setActivityForm((current) => ({ ...current, startAt: value })); }} /></label>
              <label>Término <input required type="datetime-local" value={activityForm.endAt} onChange={(e) => { const value = e.currentTarget.value; setActivityForm((current) => ({ ...current, endAt: value })); }} /></label>
              <label>Espaço <select value={activityForm.spaceId} onChange={(e) => setActivityForm({ ...activityForm, spaceId: e.target.value })}><option value="">Sem espaço definido</option>{activeSpaces.map((space) => <option key={space.id} value={space.id}>{space.name}{space.capacity !== null ? ` — ${space.capacity} lugares` : ''}</option>)}</select></label>
            </div>
            <details className={styles.optional}>
              <summary>Informações adicionais (opcional)</summary>
              <div className={styles.optionalBody}>
                <label>Descrição <textarea value={activityForm.description} onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })} placeholder="Contexto ou objetivo da sessão" /></label>
                <div className={styles.threeCols}>
                  <label>Área <select value={activityForm.taxonomyAreaId} onChange={(e) => setActivityForm({ ...activityForm, taxonomyAreaId: e.target.value, taxonomySubareaId: '', taxonomyTopicId: '' })}><option value="">Não definir agora</option>{areas.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label>Subárea <select value={activityForm.taxonomySubareaId} onChange={(e) => setActivityForm({ ...activityForm, taxonomySubareaId: e.target.value, taxonomyTopicId: '' })}><option value="">Não definir agora</option>{subareas.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label>Tema <select value={activityForm.taxonomyTopicId} onChange={(e) => setActivityForm({ ...activityForm, taxonomyTopicId: e.target.value })}><option value="">Não definir agora</option>{topics.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                </div>
                <label>Observações operacionais <textarea value={activityForm.operationalNotes} onChange={(e) => setActivityForm({ ...activityForm, operationalNotes: e.target.value })} placeholder="Ex.: microfone de lapela e retorno de palco" /></label>
              </div>
            </details>
            <button className={styles.primary} disabled={Boolean(saving)}>{saving === 'activity' ? 'Salvando…' : 'Salvar atividade'}</button>
          </form>
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardHead}><div><span className={styles.step}>QUEM PARTICIPA?</span><h2>Vincule pessoas da Grade científica</h2><p>Não criamos cadastro paralelo. A pessoa vem do A3/A4 e recebe uma função nesta atividade.</p></div></div>
          <form onSubmit={submitParticipant} className={styles.form}>
            <label>Atividade <select required value={participantForm.activityId} onChange={(e) => setParticipantForm({ ...participantForm, activityId: e.target.value })}><option value="">Selecione</option>{payload.activities.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <label>Nome do Membro da Programação Científica <select required value={participantForm.personId} onChange={(e) => setParticipantForm({ ...participantForm, personId: e.target.value })}><option value="">Selecione</option>{payload.people.map((person) => <option key={person.id} value={person.id}>{person.name}{person.institution ? ` — ${person.institution}` : ''}</option>)}</select></label>
            <label>Tipo de participação <select value={participantForm.participationType} onChange={(e) => setParticipantForm({ ...participantForm, participationType: e.target.value })}>{participationTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {participantForm.participationType === 'OTHER' && <label>Nome da função <input required value={participantForm.customRoleLabel} onChange={(e) => setParticipantForm({ ...participantForm, customRoleLabel: e.target.value })} placeholder="Ex.: Facilitadora" /></label>}
            <button className={styles.primary} disabled={Boolean(saving) || !payload.activities.length}>{saving === 'participant' ? 'Vinculando…' : 'Vincular participante'}</button>
          </form>
        </article>

        <article className={styles.cardWide}>
          <div className={styles.cardHead}><div><span className={styles.step}>REVISAR CONFLITOS</span><h2>Programação atual</h2><p>A EVA sinaliza conflitos, mas nunca troca horários, espaços ou pessoas silenciosamente.</p></div></div>
          {!payload.activities.length ? <div className={styles.empty}>Crie a primeira atividade para visualizar a grade.</div> : <div className={styles.activityList}>{payload.activities.map((activity) => {
            const related = payload.conflicts.filter((item) => item.entityIds?.includes(activity.id));
            return <article className={styles.activity} key={activity.id}>
              <div className={styles.activityMain}><span>{dateTimeLabel(activity.startAt)}–{new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(activity.endAt))}</span><h3>{activity.title}</h3><p>{activity.activityType} · {activity.space?.name ?? 'Espaço ainda não definido'}</p><p className={styles.confirmedWork}>{activity.submission ? <>Trabalho confirmado: {activity.submission.title}{activity.submission.stationPublicCode != null && <> · código {activity.submission.stationPublicCode}</>}</> : 'Nenhum trabalho científico vinculado.'}</p><div className={styles.people}>{activity.participants.map((participant) => <span key={participant.id}>{participant.person.name}</span>)}</div>
                <form key={`${activity.id}:${activity.submission?.id ?? 'none'}`} className={styles.workForm} aria-label={`Vínculo do trabalho científico de ${activity.title}`} onSubmit={(event) => saveWork(event, activity)}>
                  <label>Trabalho científico aceito
                    <select name="submissionId" defaultValue={activity.submission?.id ?? ''}>
                      <option value="">Nenhum trabalho</option>
                      {(payload.acceptedWorks ?? []).map((work) => <option key={work.id} value={work.id}>{work.title}{work.stationPublicCode != null ? ` · código ${work.stationPublicCode}` : ''}</option>)}
                      {activity.submission && !(payload.acceptedWorks ?? []).some((work) => work.id === activity.submission?.id) && <option value={activity.submission.id}>{activity.submission.title}</option>}
                    </select>
                  </label>
                  <button className={styles.secondary} type="submit" disabled={Boolean(saving) || Boolean(editing)}>{saving === `work:${activity.id}` ? 'Salvando…' : 'Salvar vínculo do trabalho'}</button>
                </form>
              </div>
              <div className={styles.activityStatus}>
                <span className={activity.status === 'DRAFT' ? styles.draft : styles.ready}>{agendaStatusLabel(activity.status)}</span>
                {related.map((conflict, index) => <span className={conflict.severity === 'BLOCKING' ? styles.blocking : styles.warning} key={`${conflict.code}-${index}`}>{conflict.message}</span>)}
                <button
                  id={`edit-program-${activity.id}`}
                  type="button"
                  className={styles.secondary}
                  disabled={Boolean(saving) || Boolean(editing)}
                  onClick={(event) => {
                    editOpener.current = event.currentTarget;
                    setEditError('');
                    setNotice('');
                    setEditing({ activity, form: programActivityEditForm(activity) });
                  }}
                >Editar ou reagendar<span className={styles.srOnly}> {activity.title}</span></button>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={Boolean(saving) || Boolean(editing) || activity.status !== 'DRAFT'}
                  onClick={() => markReady(activity.id)}
                >{saving === `ready:${activity.id}` ? 'Validando…' : 'Marcar como pronta'}</button>
                {activity.status !== 'DRAFT' && <button
                  type="button"
                  className={styles.secondary}
                  disabled={Boolean(saving) || Boolean(editing)}
                  onClick={() => changePublication(activity, activity.status !== 'PUBLISHED')}
                >{saving === `publication:${activity.id}` ? 'Salvando…' : activity.status === 'PUBLISHED' ? 'Retirar da página do evento' : 'Publicar na página do evento'}<span className={styles.srOnly}> {activity.title}</span></button>}
              </div>
              {editing?.activity.id === activity.id && <form onSubmit={saveEdit} className={`${styles.form} ${styles.editForm}`} aria-labelledby={`edit-heading-${activity.id}`}>
                <h4 id={`edit-heading-${activity.id}`}>Editar ou reagendar: {activity.title}</h4>
                <p>Horários no fuso deste navegador ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Ao salvar, a atividade volta a rascunho para nova revisão{activity.status === 'PUBLISHED' && ' e sai da página do evento até ser publicada de novo'}. Pessoas e detalhes científicos são preservados.</p>
                {editError && <div className={styles.error} role="alert">{editError}</div>}
                <fieldset disabled={Boolean(saving)} className={styles.editFields}>
                  <legend className={styles.srOnly}>Dados da atividade</legend>
                  <div className={styles.twoCols}>
                    <label>Título <input ref={editTitle} required maxLength={180} value={editing.form.title} onChange={(e) => updateEditField('title', e.target.value)} /></label>
                    <label>Tipo <input required maxLength={100} value={editing.form.activityType} onChange={(e) => updateEditField('activityType', e.target.value)} /></label>
                  </div>
                  <div className={styles.threeCols}>
                    <label>Início <input required type="datetime-local" step="1" value={editing.form.startAt} onChange={(e) => updateEditField('startAt', e.target.value.length === 16 ? `${e.target.value}:00` : e.target.value)} /></label>
                    <label>Término <input required type="datetime-local" step="1" value={editing.form.endAt} onChange={(e) => updateEditField('endAt', e.target.value.length === 16 ? `${e.target.value}:00` : e.target.value)} /></label>
                    <label>Espaço <select value={editing.form.spaceId} onChange={(e) => updateEditField('spaceId', e.target.value)}>
                      <option value="" disabled={Boolean(editing.activity.spaceId)}>Sem espaço definido</option>
                      {editing.activity.space && !editing.activity.space.active && <option value={editing.activity.space.id}>{editing.activity.space.name} (inativo — espaço atual)</option>}
                      {activeSpaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
                    </select></label>
                  </div>
                  <div><button className={styles.primary} type="submit">{saving === `edit:${activity.id}` ? 'Salvando…' : 'Salvar alterações'}</button> <button className={styles.secondary} type="button" onClick={closeEditor}>Cancelar</button></div>
                </fieldset>
              </form>}
            </article>;
          })}</div>}
        </article>
      </section>

      {payload.conflicts.length > 0 && <section className={styles.conflicts}><h2>Diagnóstico da programação</h2>{payload.conflicts.map((conflict, index) => <div className={conflict.severity === 'BLOCKING' ? styles.conflictBlocking : styles.conflictWarning} key={`${conflict.code}-${index}`}><strong>{conflict.severity === 'BLOCKING' ? 'Precisa corrigir' : 'Vale conferir'} · {conflict.message}</strong><p>{conflict.suggestion}</p></div>)}</section>}

      <ScientificEvaHelp
        context="Espaços e programação científica"
        intro="A EVA ajuda a montar a grade em etapas curtas e explica conflitos sem alterar decisões por conta própria."
        questions={[
          { question: 'Posso deixar a sala para depois?', answer: 'Sim. Você pode criar a atividade sem espaço e completar depois. Antes da revisão final, confira se atividades presenciais têm o local correto.' },
          { question: 'Atividades seguidas entram em conflito?', answer: 'Não. Uma atividade que termina às 11:00 e outra que começa às 11:00 podem usar a mesma sala ou pessoa sem conflito artificial.' },
          { question: 'Convite não confirmado bloqueia a grade?', answer: 'Não automaticamente. A EVA mostra um alerta contextual para você acompanhar a confirmação, preservando o planejamento.' },
          { question: 'Isso já vale como presença?', answer: 'Não. A capacidade do espaço abre vaga na agenda de quem está inscrito. A presença continua no credenciamento.' },
        ]}
      />
    </section>
  </main>;
}


