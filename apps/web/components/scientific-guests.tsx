'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './scientific-guests.module.css';

type ParticipationType = 'SPEAKER' | 'GUEST' | 'MODERATOR' | 'DEBATER' | 'SESSION_CHAIR' | 'OTHER';
type InvitationStatus = 'DRAFT' | 'PREPARED' | 'SENT' | 'VIEWED' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED';

type Person = {
  id: string;
  name: string;
  email?: string | null;
  institution?: string | null;
  hasGuestProfile: boolean;
};

type Guest = {
  id: string;
  personId: string;
  participationType: ParticipationType;
  customRoleLabel?: string | null;
  roleLabel: string;
  displayName?: string | null;
  professionalTitle?: string | null;
  miniBio?: string | null;
  internalNotes?: string | null;
  accessibilityNotes?: string | null;
  technicalSupportNotes?: string | null;
  invitationStatus: InvitationStatus;
  invitationExpiresAt?: string | null;
  preparedAt?: string | null;
  sentAt?: string | null;
  viewedAt?: string | null;
  respondedAt?: string | null;
  person: {
    id: string;
    name: string;
    email?: string | null;
    institution?: string | null;
  };
};

type Payload = {
  event: { id: string; name: string; status: string; organization: { id: string; name: string } };
  summary: { total: number; confirmed: number; pending: number; declined: number };
  invitationTemplate: { subject: string; body: string; expiresInDays: number };
  people: Person[];
  guests: Guest[];
  preparedInvitation?: {
    guestId: string;
    token: string;
    path: string;
    expiresAt: string;
    subject: string;
    body: string;
  };
};

const participationLabels: Record<ParticipationType, string> = {
  SPEAKER: 'Palestrante',
  GUEST: 'Convidado',
  MODERATOR: 'Moderador',
  DEBATER: 'Debatedor',
  SESSION_CHAIR: 'Coordenador de sessão',
  OTHER: 'Outra função',
};

const invitationLabels: Record<InvitationStatus, string> = {
  DRAFT: 'Rascunho',
  PREPARED: 'Convite preparado',
  SENT: 'Enviado',
  VIEWED: 'Visualizado',
  CONFIRMED: 'Confirmado',
  DECLINED: 'Recusado',
  CANCELLED: 'Cancelado',
};

export default function ScientificGuests({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [prepared, setPrepared] = useState<Payload['preparedInvitation'] | null>(null);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [guest, setGuest] = useState({
    personId: '',
    name: '',
    email: '',
    institution: '',
    participationType: 'SPEAKER' as ParticipationType,
    customRoleLabel: '',
    professionalTitle: '',
    miniBio: '',
    accessibilityNotes: '',
    technicalSupportNotes: '',
  });
  const [template, setTemplate] = useState({ subject: '', body: '', expiresInDays: 14 });

  async function load() {
    const result = await api<Payload>(`/scientific-events/${eventId}/guests`);
    setPayload(result);
    setTemplate(result.invitationTemplate);
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    let active = true;
    api<Payload>(`/scientific-events/${eventId}/guests`)
      .then((result) => {
        if (!active) return;
        setPayload(result);
        setTemplate(result.invitationTemplate);
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : 'Não foi possível carregar palestrantes e convidados.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [eventId, router]);

  const reusablePeople = useMemo(() => payload?.people.filter((item) => !item.hasGuestProfile) ?? [], [payload]);

  async function mutate<T>(path: string, options: RequestInit, key: string): Promise<T | null> {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      return await api<T>(path, options);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível concluir esta operação.');
      return null;
    } finally {
      setBusy('');
    }
  }

  async function submitGuest(event: FormEvent) {
    event.preventDefault();
    const body = mode === 'existing'
      ? {
          personId: guest.personId,
          participationType: guest.participationType,
          customRoleLabel: guest.customRoleLabel || undefined,
          professionalTitle: guest.professionalTitle || undefined,
          miniBio: guest.miniBio || undefined,
          accessibilityNotes: guest.accessibilityNotes || undefined,
          technicalSupportNotes: guest.technicalSupportNotes || undefined,
        }
      : {
          name: guest.name,
          email: guest.email || undefined,
          institution: guest.institution || undefined,
          participationType: guest.participationType,
          customRoleLabel: guest.customRoleLabel || undefined,
          professionalTitle: guest.professionalTitle || undefined,
          miniBio: guest.miniBio || undefined,
          accessibilityNotes: guest.accessibilityNotes || undefined,
          technicalSupportNotes: guest.technicalSupportNotes || undefined,
        };

    if (mode === 'existing' && !guest.personId) return setError('Escolha uma pessoa da Estrutura científica.');
    if (mode === 'new' && !guest.name.trim()) return setError('Informe o nome da nova pessoa.');

    const result = await mutate<Payload>(`/scientific-events/${eventId}/guests`, {
      method: 'POST', body: JSON.stringify(body),
    }, 'guest');
    if (!result) return;
    setPayload(result);
    setNotice('Palestrante/convidado adicionado ao evento.');
    setGuest({
      personId: '', name: '', email: '', institution: '', participationType: 'SPEAKER', customRoleLabel: '',
      professionalTitle: '', miniBio: '', accessibilityNotes: '', technicalSupportNotes: '',
    });
  }

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    const result = await mutate<Payload>(`/scientific-events/${eventId}/guest-invitation-template`, {
      method: 'PUT', body: JSON.stringify(template),
    }, 'template');
    if (!result) return;
    setPayload(result);
    setTemplate(result.invitationTemplate);
    setNotice('Modelo de convite salvo.');
  }

  async function prepareInvitation(guestId: string) {
    const result = await mutate<Payload>(`/scientific-events/${eventId}/guests/${guestId}/prepare-invitation`, {
      method: 'POST', body: JSON.stringify({ expiresInDays: template.expiresInDays }),
    }, `prepare-${guestId}`);
    if (!result) return;
    setPayload(result);
    setPrepared(result.preparedInvitation ?? null);
    setNotice('Convite preparado com link individual e seguro.');
  }

  async function setInvitationStatus(guestId: string, status: 'SENT' | 'CANCELLED') {
    const result = await mutate<Payload>(`/scientific-events/${eventId}/guests/${guestId}/invitation-status`, {
      method: 'PATCH', body: JSON.stringify({ status }),
    }, `${status}-${guestId}`);
    if (!result) return;
    setPayload(result);
    setNotice(status === 'SENT' ? 'Envio registrado no histórico do convite.' : 'Convite cancelado.');
  }

  async function copyPreparedLink() {
    if (!prepared) return;
    const url = `${window.location.origin}${prepared.path}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Link do convite copiado. O envio continua sob controle do organizador.');
    } catch {
      setNotice(`Copie o link manualmente: ${url}`);
    }
  }

  if (loading) return <main className={styles.page}><div className={styles.loading}><strong>EVA</strong><p>Organizando palestrantes e convites...</p></div></main>;
  if (!payload) return <main className={styles.page}><section className={styles.container}><div className={styles.error}>{error || 'Não foi possível carregar o Gate A4.'}</div><Link href="/painel" className={styles.primary}>Voltar ao painel</Link></section></main>;

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/painel">EVOLVIA</Link>
      <div className={styles.topActions}>
        <Link href={`/eventos/${eventId}/cientifico`} className={styles.ghost}>Central científica</Link>
        <Link href={`/eventos/${eventId}/cientifico/estrutura`} className={styles.ghost}>Estrutura A3</Link>
      </div>
    </header>

    <section className={styles.container}>
      <div className={styles.hero}>
        <div><p className={styles.eyebrow}>GATE A4 · PALESTRANTES E CONVIDADOS</p><h1>{payload.event.name}</h1><p className={styles.lead}>Cadastre ou reutilize pessoas do A3, defina a função pública e acompanhe o convite até a confirmação ou recusa.</p></div>
        <aside className={styles.eva}><strong>EVA</strong><p>Convite não é presença. A confirmação fica registrada, mas a evidência para certificados virá da programação e da presença nos próximos Gates.</p></aside>
      </div>

      <div className={styles.metrics}>
        <div><strong>{payload.summary.total}</strong><span>Pessoas no A4</span></div>
        <div><strong>{payload.summary.confirmed}</strong><span>Confirmados</span></div>
        <div><strong>{payload.summary.pending}</strong><span>Pendentes</span></div>
        <div><strong>{payload.summary.declined}</strong><span>Recusados</span></div>
      </div>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}

      {prepared && <section className={styles.prepared}>
        <div><span>Convite preparado</span><strong>{prepared.subject}</strong><p>{prepared.body}</p><small>Validade: {new Date(prepared.expiresAt).toLocaleDateString('pt-BR')}</small></div>
        <button onClick={copyPreparedLink}>Copiar link seguro</button>
      </section>}

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardHead}><div><span>1</span><h2>Adicionar pessoa</h2></div><p>Reutilize o cadastro do A3 ou crie uma nova pessoa sem duplicar dados desnecessariamente.</p></div>
          <div className={styles.segmented}>
            <button type="button" className={mode === 'existing' ? styles.segmentActive : ''} onClick={() => setMode('existing')}>Usar pessoa do A3</button>
            <button type="button" className={mode === 'new' ? styles.segmentActive : ''} onClick={() => setMode('new')}>Nova pessoa</button>
          </div>
          <form className={styles.form} onSubmit={submitGuest}>
            {mode === 'existing' ? <label>Pessoa<select value={guest.personId} onChange={(e) => setGuest({ ...guest, personId: e.target.value })}><option value="">Selecione</option>{reusablePeople.map((item) => <option key={item.id} value={item.id}>{item.name}{item.institution ? ` · ${item.institution}` : ''}</option>)}</select></label> : <>
              <label>Nome<input value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} required /></label>
              <div className={styles.row}><label>E-mail<input type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} /></label><label>Instituição<input value={guest.institution} onChange={(e) => setGuest({ ...guest, institution: e.target.value })} /></label></div>
            </>}
            <div className={styles.row}>
              <label>Função<select value={guest.participationType} onChange={(e) => setGuest({ ...guest, participationType: e.target.value as ParticipationType })}>{Object.entries(participationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              {guest.participationType === 'OTHER' && <label>Nome da função<input value={guest.customRoleLabel} onChange={(e) => setGuest({ ...guest, customRoleLabel: e.target.value })} required /></label>}
            </div>
            <label>Cargo ou título profissional<input value={guest.professionalTitle} onChange={(e) => setGuest({ ...guest, professionalTitle: e.target.value })} /></label>
            <label>Mini bio<textarea value={guest.miniBio} onChange={(e) => setGuest({ ...guest, miniBio: e.target.value })} /></label>
            <div className={styles.row}><label>Acessibilidade <small>opcional</small><textarea value={guest.accessibilityNotes} onChange={(e) => setGuest({ ...guest, accessibilityNotes: e.target.value })} /></label><label>Apoio técnico <small>opcional</small><textarea value={guest.technicalSupportNotes} onChange={(e) => setGuest({ ...guest, technicalSupportNotes: e.target.value })} /></label></div>
            <button className={styles.primary} disabled={Boolean(busy)}>{busy === 'guest' ? 'Salvando…' : 'Adicionar ao A4'}</button>
          </form>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}><div><span>2</span><h2>Modelo de convite</h2></div><p>Personalize o texto antes de gerar links. Tags disponíveis: {'{NOME}'}, {'{EVENTO}'} e {'{FUNCAO}'}.</p></div>
          <form className={styles.form} onSubmit={saveTemplate}>
            <label>Assunto<input value={template.subject} onChange={(e) => setTemplate({ ...template, subject: e.target.value })} required /></label>
            <label>Mensagem<textarea className={styles.bigText} value={template.body} onChange={(e) => setTemplate({ ...template, body: e.target.value })} required /></label>
            <label>Validade do link em dias<input type="number" min={1} max={90} value={template.expiresInDays} onChange={(e) => setTemplate({ ...template, expiresInDays: Number(e.target.value) })} /></label>
            <button className={styles.primary} disabled={Boolean(busy)}>{busy === 'template' ? 'Salvando…' : 'Salvar modelo'}</button>
          </form>
        </section>
      </div>

      <section className={styles.peopleSection}>
        <div className={styles.sectionHead}><div><h2>Convites e confirmações</h2><p>O envio pode ser feito pelo canal escolhido pelo organizador. A Evolvia registra o link, o envio manual e a resposta pública.</p></div><span>{payload.guests.length} cadastrado(s)</span></div>
        {payload.guests.length === 0 ? <div className={styles.empty}>Nenhum palestrante ou convidado cadastrado ainda.</div> : <div className={styles.guestGrid}>{payload.guests.map((item) => <article className={styles.guestCard} key={item.id}>
          <div className={styles.guestHead}><div><strong>{item.displayName || item.person.name}</strong><span>{item.roleLabel}{item.person.institution ? ` · ${item.person.institution}` : ''}</span></div><span className={`${styles.status} ${styles[`status${item.invitationStatus}`]}`}>{invitationLabels[item.invitationStatus]}</span></div>
          {item.professionalTitle && <p className={styles.title}>{item.professionalTitle}</p>}
          {item.miniBio && <p className={styles.bio}>{item.miniBio}</p>}
          <div className={styles.meta}><span>{item.person.email || 'Sem e-mail cadastrado'}</span>{item.invitationExpiresAt && <span>Link válido até {new Date(item.invitationExpiresAt).toLocaleDateString('pt-BR')}</span>}</div>
          <div className={styles.guestActions}>
            {!['CONFIRMED', 'CANCELLED'].includes(item.invitationStatus) && <button onClick={() => prepareInvitation(item.id)} disabled={Boolean(busy)}>{busy === `prepare-${item.id}` ? 'Preparando…' : item.invitationStatus === 'DECLINED' ? 'Preparar novo convite' : 'Preparar convite'}</button>}
            {item.invitationStatus === 'PREPARED' && <button onClick={() => setInvitationStatus(item.id, 'SENT')} disabled={Boolean(busy)}>Registrar envio</button>}
            {!['CANCELLED', 'CONFIRMED', 'DECLINED'].includes(item.invitationStatus) && <button className={styles.danger} onClick={() => setInvitationStatus(item.id, 'CANCELLED')} disabled={Boolean(busy)}>Cancelar</button>}
          </div>
        </article>)}</div>}
      </section>

      <div className={styles.footerNote}><strong>A4 preparado para A5 e certificados</strong><p>Identidade, função, convite e confirmação ficam auditáveis. O A5 vinculará essas pessoas às atividades e horários; presença/carga horária serão evidências separadas.</p></div>
    </section>
  </main>;
}
