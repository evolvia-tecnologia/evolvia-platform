'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, getToken } from '../lib/api';
import ScientificEvaHelp from './scientific-eva-help';
import PublicationPlainTextField from './publication-plain-text-field';
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
  OTHER: 'Outro tipo',
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
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ParticipationType | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<InvitationStatus | 'ALL'>('ALL');
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
        setMode(result.people.some((item) => !item.hasGuestProfile) ? 'existing' : 'new');
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : 'Não foi possível carregar palestrantes e convidados.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [eventId, router]);

  const reusablePeople = useMemo(() => payload?.people.filter((item) => !item.hasGuestProfile) ?? [], [payload]);

  const filteredGuests = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    return payload?.guests.filter((item) => {
      const matchesType = typeFilter === 'ALL' || item.participationType === typeFilter;
      const matchesStatus = statusFilter === 'ALL' || item.invitationStatus === statusFilter;
      const searchable = [item.displayName, item.person.name, item.person.email, item.person.institution, item.roleLabel]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('pt-BR');
      const matchesSearch = !normalizedSearch || searchable.includes(normalizedSearch);
      return matchesType && matchesStatus && matchesSearch;
    }) ?? [];
  }, [payload, search, statusFilter, typeFilter]);

  const nextAction = useMemo(() => {
    if (!payload || payload.guests.length === 0) {
      return {
        title: 'Comece pelo primeiro membro da programação científica',
        detail: 'Reutilize alguém da Grade científica ou cadastre uma nova pessoa. Depois, defina o tipo de participação.',
        href: '#cadastro-a4',
        label: 'Adicionar primeiro membro',
      };
    }

    if (payload.guests.some((item) => item.invitationStatus === 'DRAFT')) {
      return {
        title: 'Próxima ação: preparar os convites ainda em rascunho',
        detail: 'Revise o modelo de convite e gere um link individual para cada membro que ainda está como rascunho.',
        href: '#convites-a4',
        label: 'Ir para convites',
      };
    }

    if (payload.guests.some((item) => item.invitationStatus === 'PREPARED')) {
      return {
        title: 'Próxima ação: enviar os convites preparados',
        detail: 'Copie o link seguro, envie pelo canal escolhido e depois registre o envio para manter o histórico correto.',
        href: '#convites-a4',
        label: 'Ver convites preparados',
      };
    }

    if (payload.guests.some((item) => ['SENT', 'VIEWED'].includes(item.invitationStatus))) {
      return {
        title: 'Próxima ação: acompanhar confirmações pendentes',
        detail: 'Os convites já foram enviados. A resposta do membro atualizará automaticamente o status para confirmado ou recusado.',
        href: '#convites-a4',
        label: 'Acompanhar respostas',
      };
    }

    if (payload.summary.declined > 0) {
      return {
        title: 'Revise os convites recusados antes de seguir',
        detail: 'Você pode preparar um novo convite quando fizer sentido ou manter a recusa registrada para preservar o histórico.',
        href: '#convites-a4',
        label: 'Revisar recusas',
      };
    }

    return {
      title: 'A4 organizado: prepare-se para montar a programação',
      detail: 'Os membros e confirmações estão estruturados. O próximo passo desta grade é vincular essas pessoas às atividades, locais, dias e horários.',
      href: `/eventos/${eventId}/cientifico/programacao`,
      label: 'Abrir locais, dias e horários',
    };
  }, [eventId, payload]);

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

    if (mode === 'existing' && !guest.personId) return setError('Escolha um membro da Grade científica.');
    if (mode === 'new' && !guest.name.trim()) return setError('Informe o Nome do Membro da Programação Científica.');

    const result = await mutate<Payload>(`/scientific-events/${eventId}/guests`, {
      method: 'POST', body: JSON.stringify(body),
    }, 'guest');
    if (!result) return;
    setPayload(result);
    setNotice('Membro adicionado à programação científica.');
    setGuest({
      personId: '', name: '', email: '', institution: '', participationType: 'SPEAKER', customRoleLabel: '',
      professionalTitle: '', miniBio: '', accessibilityNotes: '', technicalSupportNotes: '',
    });
    setMode(result.people.some((item) => !item.hasGuestProfile) ? 'existing' : 'new');
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
  if (!payload) return <main className={styles.page}><section className={styles.container}><div className={styles.error}>{error || 'Não foi possível carregar o Gate A4.'}</div><Link href={`/eventos/${eventId}/painel`} className={styles.primary}>Voltar ao menu do evento</Link></section></main>;

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/painel">EVOLVIA</Link>
      <div className={styles.topActions}>
        <Link href={`/eventos/${eventId}/cientifico/grade`} className={styles.ghost}>Programação científica</Link>
        <Link href={`/eventos/${eventId}/cientifico/estrutura`} className={styles.ghost}>Grade científica A3</Link>
      </div>
    </header>

    <section className={styles.container}>
      <nav className={styles.flowReturn} aria-label="Retorno do fluxo">
        <Link href={`/eventos/${eventId}/cientifico/grade`}>Voltar à programação</Link>
        <Link href={`/eventos/${eventId}/painel`}>Voltar ao painel</Link>
      </nav>
      <div className={styles.hero}>
        <div><p className={styles.eyebrow}>GATE A4 · PALESTRANTES E CONVIDADOS</p><h1>{payload.event.name}</h1><p className={styles.lead}>Reutilize membros cadastrados na Grade científica ou adicione um novo membro, defina o tipo de participação e acompanhe o convite até a confirmação ou recusa.</p></div>
        <aside className={styles.eva}><strong>EVA</strong><p>Você não precisa preencher tudo. Comece pelo nome e tipo de participação; detalhes profissionais e necessidades especiais ficam em uma seção opcional.</p></aside>
      </div>

      <div className={styles.metrics}>
        <div><strong>{payload.summary.total}</strong><span>Membros no A4</span></div>
        <div><strong>{payload.summary.confirmed}</strong><span>Confirmados</span></div>
        <div><strong>{payload.summary.pending}</strong><span>Pendentes</span></div>
        <div><strong>{payload.summary.declined}</strong><span>Recusados</span></div>
      </div>

      <section className={styles.nextAction} aria-label="Próxima ação recomendada">
        <div><span>PRÓXIMA AÇÃO RECOMENDADA</span><strong>{nextAction.title}</strong><p>{nextAction.detail}</p></div>
        <a href={nextAction.href}>{nextAction.label}</a>
      </section>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {notice && <div className={styles.notice}>{notice}</div>}

      {prepared && <section className={styles.prepared}>
        <div><span>Convite preparado</span><strong>{prepared.subject}</strong><p>{prepared.body}</p><small>Validade: {new Date(prepared.expiresAt).toLocaleDateString('pt-BR')}</small></div>
        <button onClick={copyPreparedLink}>Copiar link seguro</button>
      </section>}

      <div className={styles.grid}>
        <section className={styles.card} id="cadastro-a4">
          <div className={styles.cardHead}><div><span>1</span><h2>Adicionar membro da programação científica</h2></div><p>Use um membro já cadastrado na Grade científica para evitar duplicidade. Cadastre um novo somente quando ele ainda não existir no A3.</p></div>
          <div className={styles.segmented}>
            <button type="button" className={mode === 'existing' ? styles.segmentActive : ''} onClick={() => setMode('existing')} disabled={reusablePeople.length === 0}>Usar membro da Grade científica</button>
            <button type="button" className={mode === 'new' ? styles.segmentActive : ''} onClick={() => setMode('new')}>Novo membro</button>
          </div>
          {reusablePeople.length === 0 && <p className={styles.inlineTip}>Não há membros disponíveis para reutilizar agora. Por isso, a opção “Novo membro” foi priorizada.</p>}
          <form className={styles.form} onSubmit={submitGuest}>
            {mode === 'existing' ? <label>Nome do Membro da Programação Científica
              <span className={styles.fieldHelp}>Escolha alguém já cadastrado no A3. Ex.: Dra. Ana Paula Ribeiro · Universidade Federal de Minas Gerais.</span>
              <select value={guest.personId} onChange={(e) => setGuest({ ...guest, personId: e.target.value })}><option value="">Selecione o membro</option>{reusablePeople.map((item) => <option key={item.id} value={item.id}>{item.name}{item.institution ? ` · ${item.institution}` : ''}</option>)}</select>
            </label> : <>
              <label>Nome do Membro da Programação Científica
                <span className={styles.fieldHelp}>Informe o nome que será usado nos convites e na programação. Ex.: Prof. Dr. Carlos Eduardo Silva.</span>
                <input placeholder="Ex.: Prof. Dr. Carlos Eduardo Silva" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} required />
              </label>
              <div className={styles.row}>
                <label>E-mail <small>recomendado para convite</small>
                  <span className={styles.fieldHelp}>Use para contato e convite digital. Ex.: carlos.silva@hospital.org.br.</span>
                  <input type="email" placeholder="Ex.: carlos.silva@hospital.org.br" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
                </label>
                <label>Instituição <small>opcional</small>
                  <span className={styles.fieldHelp}>Informe a instituição que deve acompanhar o nome na comunicação. Ex.: Hospital das Clínicas da USP.</span>
                  <input placeholder="Ex.: Hospital das Clínicas da USP" value={guest.institution} onChange={(e) => setGuest({ ...guest, institution: e.target.value })} />
                </label>
              </div>
            </>}
            <div className={styles.row}>
              <label>Tipo de participação
                <span className={styles.fieldHelp}>Escolha como o membro participará da programação. Ex.: Palestrante para quem fará uma apresentação; Moderador para quem conduzirá uma mesa.</span>
                <select value={guest.participationType} onChange={(e) => setGuest({ ...guest, participationType: e.target.value as ParticipationType })}>{Object.entries(participationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              </label>
              {guest.participationType === 'OTHER' && <label>Nome do tipo de participação
                <span className={styles.fieldHelp}>Use quando nenhum tipo padrão representar a atuação. Ex.: Homenageado, Facilitador de workshop ou Mestre de cerimônias.</span>
                <input placeholder="Ex.: Facilitador de workshop" value={guest.customRoleLabel} onChange={(e) => setGuest({ ...guest, customRoleLabel: e.target.value })} required />
              </label>}
            </div>

            <details className={styles.optionalGroup}>
              <summary>Informações adicionais <span>opcional</span></summary>
              <p>Abra somente se precisar enriquecer o perfil público ou registrar necessidades operacionais.</p>
              <div className={styles.optionalFields}>
                <label>Cargo ou título profissional <small>opcional</small>
                  <span className={styles.fieldHelp}>Use quando essa informação deve aparecer no perfil ou ajudar a identificar o convidado. Ex.: Professora Titular de Cardiologia.</span>
                  <input placeholder="Ex.: Professora Titular de Cardiologia" value={guest.professionalTitle} onChange={(e) => setGuest({ ...guest, professionalTitle: e.target.value })} />
                </label>
                <PublicationPlainTextField
                  id="guest-mini-bio"
                  label="Minibiografia"
                  value={guest.miniBio}
                  onChange={value => setGuest(current => ({ ...current, miniBio: value }))}
                  help="Use para apresentar o membro ao público. Prefira 2 a 4 frases objetivas. Ex.: Cardiologista, pesquisadora em insuficiência cardíaca e professora da UFMG."
                  placeholder="Ex.: Cardiologista, pesquisadora em insuficiência cardíaca e professora da UFMG."
                  rows={3}
                  optional
                />
                <div className={styles.row}>
                  <PublicationPlainTextField
                    id="guest-accessibility-notes"
                    label="Acessibilidade"
                    value={guest.accessibilityNotes}
                    onChange={value => setGuest(current => ({ ...current, accessibilityNotes: value }))}
                    help="Preencha somente quando houver uma necessidade operacional. Ex.: acesso sem escadas, intérprete de Libras ou assento adaptado."
                    placeholder="Ex.: Necessita acesso sem escadas e assento adaptado."
                    rows={3}
                    optional
                  />
                  <PublicationPlainTextField
                    id="guest-technical-notes"
                    label="Apoio técnico"
                    value={guest.technicalSupportNotes}
                    onChange={value => setGuest(current => ({ ...current, technicalSupportNotes: value }))}
                    help="Use para necessidades de apresentação ou palco. Ex.: notebook próprio, entrada HDMI, microfone de lapela e retorno de vídeo."
                    placeholder="Ex.: Notebook próprio, HDMI e microfone de lapela."
                    rows={3}
                    optional
                  />
                </div>
              </div>
            </details>

            <button className={styles.primary} disabled={Boolean(busy)}>{busy === 'guest' ? 'Salvando…' : 'Adicionar membro à programação'}</button>
          </form>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}><div><span>2</span><h2>Modelo de convite</h2></div><p>Defina um texto-base uma única vez. Depois, a Evolvia reaproveita o modelo para cada convite individual.</p></div>
          <form className={styles.form} onSubmit={saveTemplate}>
            <PublicationPlainTextField
              id="guest-invitation-subject"
              label="Assunto"
              value={template.subject}
              onChange={value => setTemplate(current => ({ ...current, subject: value }))}
              help="É o título do convite que o organizador usará no envio. Ex.: Convite para participar do Congresso Brasileiro de Cardiologia 2026."
              placeholder="Ex.: Convite para participar do Congresso Brasileiro de Cardiologia 2026"
              required
            />
            <PublicationPlainTextField
              id="guest-invitation-body"
              label="Mensagem"
              value={template.body}
              onChange={value => setTemplate(current => ({ ...current, body: value }))}
              help="Use as tags para não digitar os dados de cada convidado: {NOME}, {EVENTO} e {FUNCAO}. Ex.: Olá {NOME}, convidamos você para participar do {EVENTO} como {FUNCAO}."
              placeholder="Ex.: Olá {NOME}, convidamos você para participar do {EVENTO} como {FUNCAO}. Acesse o link para confirmar."
              rows={7}
              required
            />
            <label>Validade do link em dias
              <span className={styles.fieldHelp}>Define por quantos dias o link de confirmação ficará válido. Ex.: 14 dias para dar duas semanas de prazo ao convidado.</span>
              <input type="number" min={1} max={90} value={template.expiresInDays} onChange={(e) => setTemplate({ ...template, expiresInDays: Number(e.target.value) })} />
            </label>
            <button className={styles.primary} disabled={Boolean(busy)}>{busy === 'template' ? 'Salvando…' : 'Salvar modelo'}</button>
          </form>
        </section>
      </div>

      <section className={styles.peopleSection} id="convites-a4">
        <div className={styles.sectionHead}><div><h2>Convites e confirmações</h2><p>Prepare o link individual, envie pelo canal escolhido e registre o envio. A confirmação ou recusa fica registrada quando o convidado responde.</p></div><span>{payload.guests.length} cadastrado(s)</span></div>

        {payload.guests.length > 0 && <div className={styles.filters}>
          <label>Buscar membro
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ex.: Ana, UFMG ou cardiologia" />
          </label>
          <label>Tipo de participação
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as ParticipationType | 'ALL')}>
              <option value="ALL">Todos os tipos</option>
              {Object.entries(participationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Status do convite
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as InvitationStatus | 'ALL')}>
              <option value="ALL">Todos os status</option>
              {Object.entries(invitationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>}

        {payload.guests.length === 0 ? <div className={styles.empty}>Nenhum palestrante ou convidado cadastrado ainda. Comece pelo bloco “Adicionar membro da programação científica”.</div> : filteredGuests.length === 0 ? <div className={styles.empty}>Nenhum membro corresponde aos filtros atuais. Limpe a busca ou escolha “Todos”.</div> : <div className={styles.guestGrid}>{filteredGuests.map((item) => <article className={styles.guestCard} key={item.id}>
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

      <div className={styles.footerNote}><strong>A4 preparado para A5 e certificados</strong><p>Identidade, tipo de participação, convite e confirmação ficam auditáveis. O A5 vinculará esses membros às atividades e horários; presença e carga horária serão evidências separadas.</p></div>
    </section>

    <ScientificEvaHelp
      context="Palestrantes, convidados e convites — A4"
      intro="Estou acompanhando esta etapa. Posso explicar o tipo de participação, ajudar a decidir quais dados opcionais realmente valem a pena e orientar o próximo passo do convite."
      questions={[
        {
          question: 'Qual tipo de participação devo escolher?',
          answer: 'Use Palestrante para quem apresentará um conteúdo, Moderador para quem conduzirá uma mesa ou debate, Debatedor para quem comentará e discutirá o conteúdo, Coordenador de sessão para quem responderá pela sessão e Convidado quando a participação não se encaixar nessas funções. Use Outro tipo somente quando necessário.',
        },
        {
          question: 'Preciso preencher mini bio, acessibilidade e apoio técnico?',
          answer: 'Não. Esses dados são opcionais. Mini bio é útil quando o perfil será mostrado ao público. Acessibilidade e apoio técnico devem ser preenchidos apenas quando houver uma necessidade operacional real.',
        },
        {
          question: 'Quando devo preparar e enviar o convite?',
          answer: 'Cadastre o membro e confirme o tipo de participação primeiro. Depois revise o modelo de convite, prepare o link individual, envie pelo canal escolhido e registre o envio. Assim o histórico fica completo e a resposta do convidado pode ser acompanhada.',
        },
        {
          question: 'A confirmação já gera direito a certificado?',
          answer: 'Não. Confirmação de convite comprova apenas que a pessoa aceitou participar. O certificado dependerá do vínculo com a programação e das evidências de participação ou presença definidas nos próximos Gates.',
        },
      ]}
    />
  </main>;
}
