'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, ApiError, getToken } from '../lib/api';

type EventFormat = '' | 'IN_PERSON' | 'ONLINE' | 'HYBRID';
type RegistrationMode = '' | 'FREE' | 'PAID' | 'INVITATION';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type OrganizationMembership = {
  id: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER';
  organization: { id: string; name: string; slug: string; status: string };
};

type MeResponse = {
  id: string;
  name: string;
  email: string;
  memberships: OrganizationMembership[];
};

type WizardAnswers = {
  organizationId?: string;
  eventType?: string;
  format?: EventFormat;
  name?: string;
  startDate?: string | null;
  endDate?: string | null;
  timeZone?: string;
  datesPending?: boolean;
  estimatedAudience?: number | null;
  audiencePending?: boolean;
  venue?: string | null;
  venuePending?: boolean;
  registrationMode?: RegistrationMode;
  capabilities?: string[];
  capabilitiesCustomized?: boolean;
};

type Capability = {
  code: string;
  label: string;
  shortLabel: string;
  description: string;
  value: string;
  category: string;
  required?: boolean;
  selected: boolean;
  recommended: boolean;
};

type WizardPayload = {
  event: {
    id: string;
    name: string;
    slug: string;
    status: string;
    organizationId: string;
    organization: { id: string; name: string; slug: string };
    updatedAt: string;
  };
  session: {
    id: string;
    currentStep: string;
    completionPercent: number;
    status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
    revision: number;
    lastSavedAt: string;
  };
  answers: WizardAnswers;
  capabilityCatalog: Capability[];
};

type EventWizardProps = { eventId?: string };

const editorRoles = new Set(['OWNER', 'ADMIN', 'MANAGER']);

const profileGroups = [
  {
    id: 'scientific',
    label: 'Científicos e acadêmicos',
    description: 'Para eventos com conteúdo técnico, trabalhos, avaliações ou produção acadêmica.',
    options: [
      { value: 'Congresso ou evento científico', icon: '◫', title: 'Congresso', description: 'Congressos e encontros científicos de maior porte.' },
      { value: 'Simpósio científico', icon: '◫', title: 'Simpósio', description: 'Discussões temáticas, mesas e conteúdo especializado.' },
      { value: 'Jornada científica', icon: '◫', title: 'Jornada', description: 'Programação técnico-científica concentrada em uma área.' },
      { value: 'Conferência científica', icon: '◫', title: 'Conferência científica', description: 'Palestras, sessões e intercâmbio de conhecimento.' },
    ],
  },
  {
    id: 'corporate',
    label: 'Corporativos e capacitação',
    description: 'Para empresas, equipes, clientes, parceiros e jornadas de treinamento.',
    options: [
      { value: 'Evento corporativo ou treinamento', icon: '◇', title: 'Evento corporativo', description: 'Encontros empresariais, reuniões ampliadas e experiências de marca.' },
      { value: 'Convenção empresarial', icon: '◇', title: 'Convenção', description: 'Times, metas, lançamentos, canais e alinhamento estratégico.' },
      { value: 'Treinamento', icon: '◇', title: 'Treinamento', description: 'Capacitação com presença, materiais, atividades e certificados.' },
      { value: 'Workshop', icon: '◇', title: 'Workshop', description: 'Experiência prática, dinâmica e de menor duração.' },
    ],
  },
  {
    id: 'fair',
    label: 'Feiras e exposições',
    description: 'Para ambientes com expositores, visitantes, credenciais e operação de acesso.',
    options: [
      { value: 'Feira ou exposição', icon: '▦', title: 'Feira', description: 'Expositores, credenciais, serviços e fluxo de visitantes.' },
      { value: 'Exposição', icon: '▦', title: 'Exposição', description: 'Mostras, estandes e experiências abertas ou credenciadas.' },
    ],
  },
  {
    id: 'entertainment',
    label: 'Entretenimento',
    description: 'Para eventos orientados a ingressos, entrada e experiência do público.',
    options: [
      { value: 'Show ou entretenimento', icon: '▶', title: 'Show', description: 'Ingressos, operação de entrada e experiência ao vivo.' },
      { value: 'Festival', icon: '▶', title: 'Festival', description: 'Programação múltipla, público amplo e operação de acesso.' },
    ],
  },
  {
    id: 'other',
    label: 'Outros perfis',
    description: 'Quando o evento tem finalidade social, comunitária ou uma combinação diferente.',
    options: [
      { value: 'Evento social ou comunitário', icon: '◎', title: 'Social ou comunitário', description: 'Uma jornada simples para mobilizar e receber participantes.' },
      { value: 'Outro tipo de evento', icon: '+', title: 'Outro perfil', description: 'Comece com uma estrutura flexível e adapte depois.' },
    ],
  },
] as const;

const steps = [
  { id: 'profile', label: 'Perfil', title: 'Que tipo de evento você está criando?', subtitle: 'Escolha o tipo mais próximo da sua realidade. A EVA usa essa resposta para preparar uma configuração inicial inteligente.' },
  { id: 'format', label: 'Formato', title: 'Como as pessoas participarão?', subtitle: 'Escolha a experiência principal. Tudo poderá ser refinado antes da publicação.' },
  { id: 'identity', label: 'Identidade', title: 'Dê identidade ao seu evento', subtitle: 'Um nome claro, uma previsão de data e uma noção de público já ajudam a EVA a orientar a operação.' },
  { id: 'location', label: 'Local', title: 'Onde a experiência acontecerá?', subtitle: 'Informe o local ou siga com essa definição pendente.' },
  { id: 'registration', label: 'Inscrição', title: 'Como o público participará?', subtitle: 'Essa escolha orienta a jornada de cadastro e as capacidades financeiras.' },
  { id: 'capabilities', label: 'Recursos', title: 'Sua estrutura inicial está pronta', subtitle: 'A EVA recomendou os recursos mais úteis para este perfil. Ajuste apenas o necessário.' },
  { id: 'review', label: 'Revisão', title: 'Revise a fundação do evento', subtitle: 'Nada será publicado agora. Você seguirá para o ambiente seguro de configuração.' },
] as const;

const initialDraft: WizardAnswers = {
  organizationId: '',
  eventType: '',
  format: '',
  name: '',
  startDate: null,
  endDate: null,
  timeZone: '',
  datesPending: false,
  estimatedAudience: null,
  audiencePending: false,
  venue: null,
  venuePending: false,
  registrationMode: '',
  capabilities: [],
  capabilitiesCustomized: false,
};

const formatLabels: Record<string, string> = {
  IN_PERSON: 'Presencial',
  ONLINE: 'Online',
  HYBRID: 'Híbrido',
};

const timeZoneOptions = [
  ['America/Sao_Paulo', 'Brasília, São Paulo, Rio de Janeiro'],
  ['America/Manaus', 'Manaus'],
  ['America/Cuiaba', 'Cuiabá'],
  ['America/Rio_Branco', 'Rio Branco'],
  ['America/Noronha', 'Fernando de Noronha'],
  ['UTC', 'UTC — evento online internacional'],
] as const;

const timeZoneLabels = Object.fromEntries(timeZoneOptions);

const registrationLabels: Record<string, string> = {
  FREE: 'Gratuita',
  PAID: 'Paga',
  INVITATION: 'Somente convidados',
};

function toDateInput(value?: string | null): string {
  return value ? value.slice(0, 10) : '';
}

function toIsoDate(value: string): string | null {
  return value ? new Date(`${value}T12:00:00`).toISOString() : null;
}

function serialize(value: WizardAnswers): string {
  return JSON.stringify(value);
}

function formatAudience(value?: number | null): string {
  return value ? new Intl.NumberFormat('pt-BR').format(value) : 'Não informado';
}

export default function EventWizard({ eventId }: EventWizardProps) {
  const router = useRouter();
  const [currentEventId, setCurrentEventId] = useState(eventId ?? '');
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [draft, setDraft] = useState<WizardAnswers>(initialDraft);
  const [catalog, setCatalog] = useState<Capability[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [revision, setRevision] = useState(1);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState('');

  const draftRef = useRef(draft);
  const revisionRef = useRef(revision);
  const savedStepRef = useRef('profile');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { revisionRef.current = revision; }, [revision]);

  const editableMemberships = useMemo(
    () => memberships.filter((membership) => editorRoles.has(membership.role)),
    [memberships],
  );

  const applyPayload = useCallback((payload: WizardPayload, overwriteDraft = true) => {
    setCurrentEventId(payload.event.id);
    setCatalog(payload.capabilityCatalog);
    setProgress(payload.session.completionPercent);
    setRevision(payload.session.revision);
    revisionRef.current = payload.session.revision;
    savedStepRef.current = payload.session.currentStep;
    const index = steps.findIndex((step) => step.id === payload.session.currentStep);
    if (index >= 0) setStepIndex(index);
    if (overwriteDraft) {
      const normalized = { ...initialDraft, ...payload.answers };
      setDraft(normalized);
      draftRef.current = normalized;
      setDirty(false);
    }
    setCompleted(payload.session.status === 'COMPLETED');
    setSaveState('saved');
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }

    let active = true;
    async function load() {
      try {
        const me = await api<MeResponse>('/me');
        if (!active) return;
        setMemberships(me.memberships ?? []);

        if (eventId) {
          const payload = await api<WizardPayload>(`/event-wizard/${eventId}`);
          if (active) applyPayload(payload);
        } else {
          const saved = localStorage.getItem('evolvia_wizard_prestart_v2');
          const restored = saved ? { ...initialDraft, ...JSON.parse(saved) } : { ...initialDraft };
          if (!restored.organizationId) {
            const first = (me.memberships ?? []).find((item) => editorRoles.has(item.role));
            restored.organizationId = first?.organization.id ?? '';
          }
          if (active) {
            setDraft(restored);
            draftRef.current = restored;
          }
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o Wizard.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [applyPayload, eventId, router]);

  useEffect(() => {
    if (!currentEventId && !loading) {
      localStorage.setItem('evolvia_wizard_prestart_v2', serialize(draft));
    }
  }, [currentEventId, draft, loading]);

  const update = useCallback(<K extends keyof WizardAnswers,>(key: K, value: WizardAnswers[K]) => {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      draftRef.current = next;
      return next;
    });
    if (currentEventId) setDirty(true);
    setError('');
  }, [currentEventId]);

  const recoverLatest = useCallback(async () => {
    if (!currentEventId) return;
    const latest = await api<WizardPayload>(`/event-wizard/${currentEventId}`);
    applyPayload(latest);
    setError('O rascunho havia sido alterado em outra sessão. Carregamos a versão mais recente para evitar perda de dados.');
  }, [applyPayload, currentEventId]);

  const queueSave = useCallback((targetStep: string, snapshot = draftRef.current) => {
    if (!currentEventId) return Promise.resolve();
    const snapshotJson = serialize(snapshot);

    const operation = saveQueueRef.current.then(async () => {
      if (!dirty && savedStepRef.current === targetStep) return;
      setSaveState('saving');
      try {
        const payload = await api<WizardPayload>(`/event-wizard/${currentEventId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            currentStep: targetStep,
            answers: snapshot,
            revision: revisionRef.current,
          }),
        });
        const stillCurrent = serialize(draftRef.current) === snapshotJson;
        applyPayload(payload, stillCurrent);
        savedStepRef.current = targetStep;
        if (!stillCurrent) setDirty(true);
        setSaveState('saved');
      } catch (reason) {
        setSaveState('error');
        if (reason instanceof ApiError && reason.status === 409) {
          await recoverLatest();
          return;
        }
        throw reason;
      }
    });

    saveQueueRef.current = operation.catch(() => undefined);
    return operation;
  }, [applyPayload, currentEventId, dirty, recoverLatest]);

  useEffect(() => {
    if (!currentEventId || !dirty || loading || completed) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      queueSave(steps[stepIndex].id).catch((reason) => {
        setError(reason instanceof Error ? reason.message : 'Não foi possível salvar automaticamente.');
      });
    }, 900);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [completed, currentEventId, dirty, loading, queueSave, stepIndex]);

  function validationMessage(index: number): string {
    if (index === 0) {
      if (!draft.organizationId) return 'Selecione a organização responsável.';
      if (!draft.eventType) return 'Escolha o perfil do evento.';
    }
    if (index === 1 && !draft.format) return 'Escolha o formato do evento.';
    if (index === 2) {
      if (!draft.name || draft.name.trim().length < 3) return 'Informe um nome com pelo menos 3 caracteres.';
      if (!draft.startDate && !draft.datesPending) return 'Informe a data de início ou marque “Definir depois”.';
      if (!draft.timeZone) return 'Escolha o fuso horário do evento.';
      if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) return 'A data de término não pode ser anterior à data de início.';
    }
    if (index === 3 && !draft.venue && !draft.venuePending) {
      return draft.format === 'ONLINE'
        ? 'Informe a plataforma ou marque “Definir depois”.'
        : 'Informe o local ou marque “Definir depois”.';
    }
    if (index === 4 && !draft.registrationMode) return 'Escolha o modelo de inscrição.';
    if (index === 5 && !draft.capabilities?.includes('registration')) return 'Inscrições é um recurso obrigatório.';
    return '';
  }

  async function startWizard() {
    const message = validationMessage(0);
    if (message) { setError(message); return; }
    setStarting(true);
    setError('');
    try {
      const payload = await api<WizardPayload>('/event-wizard/start', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: draft.organizationId,
          eventType: draft.eventType,
        }),
      });
      localStorage.removeItem('evolvia_wizard_prestart_v2');
      applyPayload(payload);
      router.replace(`/eventos/${payload.event.id}/configuracao`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível iniciar o evento.');
    } finally {
      setStarting(false);
    }
  }

  async function goTo(index: number) {
    if (index > stepIndex) {
      const message = validationMessage(stepIndex);
      if (message) { setError(message); return; }
    }

    if (!currentEventId) {
      if (index > 0) await startWizard();
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    const target = steps[index].id;
    try {
      await queueSave(target);
      setStepIndex(index);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar esta etapa.');
    }
  }

  async function finish() {
    const message = validationMessage(5);
    if (message) { setError(message); return; }
    if (!currentEventId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setFinishing(true);
    setError('');
    try {
      await saveQueueRef.current;
      const payload = await api<WizardPayload>(`/event-wizard/${currentEventId}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          currentStep: 'review',
          answers: draftRef.current,
          revision: revisionRef.current,
        }),
      });
      applyPayload(payload);
      setCompleted(true);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) await recoverLatest();
      else setError(reason instanceof Error ? reason.message : 'Não foi possível concluir o evento.');
    } finally {
      setFinishing(false);
    }
  }

  async function saveAndExit() {
    if (currentEventId) {
      try { await queueSave(steps[stepIndex].id); } catch { return; }
    }
    router.push('/painel');
  }

  function toggleCapability(item: Capability) {
    if (item.required) return;
    const selected = new Set(draft.capabilities ?? []);
    if (selected.has(item.code)) selected.delete(item.code);
    else selected.add(item.code);
    selected.add('registration');
    update('capabilities', catalog.map((entry) => entry.code).filter((code) => selected.has(code)));
    update('capabilitiesCustomized', true);
  }

  function restoreRecommendations() {
    update('capabilities', catalog.filter((item) => item.recommended || item.required).map((item) => item.code));
    update('capabilitiesCustomized', false);
  }

  if (loading) {
    return <main className="shell"><div className="loading-screen"><div className="loading-mark">E</div><p>A EVA está preparando seu ambiente...</p></div></main>;
  }

  if (completed) {
    return <main className="shell"><header className="topbar"><Link className="brand" href="/painel">EVOLVIA</Link></header><section className="container completion-page"><div className="completion-card"><div className="completion-icon">✓</div><p className="eyebrow">FUNDAÇÃO CONCLUÍDA</p><h1>{draft.name}</h1><p className="completion-lead">Seu evento já tem uma estrutura inicial segura. Agora você poderá configurar detalhes, testar e homologar antes de publicar.</p><div className="completion-grid"><div><strong>{formatLabels[draft.format ?? '']}</strong><span>Formato</span></div><div><strong>{registrationLabels[draft.registrationMode ?? '']}</strong><span>Inscrição</span></div><div><strong>{draft.capabilities?.length ?? 0}</strong><span>Recursos ativados</span></div></div><div className="completion-actions"><Link className="btn btn-primary" href="/painel">Ir para o painel</Link><button className="btn btn-secondary" onClick={() => setCompleted(false)}>Revisar respostas</button></div></div></section></main>;
  }

  const current = steps[stepIndex];
  const selectedOrganization = editableMemberships.find((item) => item.organization.id === draft.organizationId);
  const saveLabel = saveState === 'saving' ? 'Salvando…' : saveState === 'error' ? 'Não salvo' : currentEventId ? 'Tudo salvo' : 'Rascunho local';

  return <main className="shell wizard-shell">
    <header className="topbar wizard-topbar">
      <Link className="brand" href="/painel">EVOLVIA</Link>
      <div className={`save-indicator ${saveState}`} aria-live="polite"><span className="save-dot" />{saveLabel}</div>
      <button className="btn btn-ghost-dark" onClick={saveAndExit}>Salvar e sair</button>
    </header>

    <section className="wizard-workspace">
      <aside className="wizard-sidebar">
        <div className="sidebar-event">
          <span className="eyebrow">CONFIGURAÇÃO ASSISTIDA</span>
          <strong>{draft.name || 'Novo evento'}</strong>
          <small>{selectedOrganization?.organization.name || 'Organização responsável'}</small>
        </div>
        <nav className="step-list" aria-label="Etapas do evento">
          {steps.map((item, index) => <button key={item.id} className={`step-item ${index === stepIndex ? 'active' : ''} ${index < stepIndex ? 'done' : ''}`} onClick={() => index <= stepIndex && goTo(index)} disabled={index > stepIndex}><span>{index < stepIndex ? '✓' : index + 1}</span><div><strong>{item.label}</strong><small>{index === stepIndex ? 'Em andamento' : index < stepIndex ? 'Concluída' : 'Próxima'}</small></div></button>)}
        </nav>
        <div className="sidebar-security"><span>◎</span><p><strong>Ambiente seguro</strong>Nada será publicado sem sua aprovação.</p></div>
      </aside>

      <div className="wizard-main">
        <div className="wizard-progress-head"><span>Etapa {stepIndex + 1} de {steps.length}</span><strong>{currentEventId ? progress : Math.round((stepIndex / 6) * 92)}% estruturado</strong></div>
        <div className="progress-track"><div className="progress-value" style={{ width: `${currentEventId ? progress : 8}%` }} /></div>

        <div className="wizard-content-grid">
          <section className="wizard-card premium-wizard-card">
            <p className="eyebrow">{current.label.toUpperCase()}</p>
            <h1>{current.title}</h1>
            <p className="wizard-subtitle">{current.subtitle}</p>
            {error && <div className="error" role="alert">{error}</div>}

            {stepIndex === 0 && <div className="wizard-section-stack">
              <div className="form-group"><label htmlFor="organization">Organização responsável</label><select id="organization" className="select" value={draft.organizationId ?? ''} disabled={Boolean(currentEventId)} onChange={(event) => update('organizationId', event.target.value)}><option value="">Selecione</option>{editableMemberships.map((membership) => <option key={membership.organization.id} value={membership.organization.id}>{membership.organization.name}</option>)}</select>{currentEventId && <span className="field-help">A organização fica bloqueada após o início para proteger o isolamento dos dados.</span>}</div>
              {profileGroups.map((group) => <div className="form-group" role="group" aria-labelledby={`profile-group-${group.id}`} key={group.id}><strong id={`profile-group-${group.id}`}>{group.label}</strong><span className="field-help">{group.description}</span><div className="profile-grid">{group.options.map((profile) => <button type="button" className={`profile-option ${draft.eventType === profile.value ? 'selected' : ''}`} aria-pressed={draft.eventType === profile.value} key={profile.value} onClick={() => update('eventType', profile.value)}><span className="profile-icon">{profile.icon}</span><div><strong>{profile.title}</strong><p>{profile.description}</p></div><span className="selection-mark">✓</span></button>)}</div></div>)}
            </div>}

            {stepIndex === 1 && <div className="choice-grid three-columns">{[
              ['IN_PERSON', 'Presencial', 'Recepção, credenciamento e experiência no local.', '⌂'],
              ['ONLINE', 'Online', 'Participação digital com acesso remoto.', '◉'],
              ['HYBRID', 'Híbrido', 'Público presencial e online no mesmo evento.', '⇄'],
            ].map(([value, title, description, icon]) => <button type="button" className={`choice-card ${draft.format === value ? 'selected' : ''}`} key={value} onClick={() => update('format', value as EventFormat)}><span className="choice-icon">{icon}</span><strong>{title}</strong><p>{description}</p><span className="selection-mark">✓</span></button>)}</div>}

            {stepIndex === 2 && <div className="wizard-section-stack">
              <div className="form-group"><label htmlFor="name">Nome do evento</label><input className="input input-large" id="name" value={draft.name ?? ''} maxLength={120} onChange={(event) => update('name', event.target.value)} placeholder="Ex.: Congresso Brasileiro de Inovação" /><span className="field-help">Use um nome que o participante reconheça facilmente.</span></div>
              <div className="form-row"><div className="form-group"><label htmlFor="startDate">Data de início</label><input className="input" id="startDate" type="date" value={toDateInput(draft.startDate)} disabled={draft.datesPending} onChange={(event) => update('startDate', toIsoDate(event.target.value))} /></div><div className="form-group"><label htmlFor="endDate">Data de término</label><input className="input" id="endDate" type="date" value={toDateInput(draft.endDate)} disabled={draft.datesPending} min={toDateInput(draft.startDate)} onChange={(event) => update('endDate', toIsoDate(event.target.value))} /></div></div>
              <div className="form-group"><label htmlFor="timeZone">Fuso horário do evento</label><select className="select" id="timeZone" value={draft.timeZone ?? ''} onChange={(event) => update('timeZone', event.target.value)}><option value="">Selecione e confirme</option>{timeZoneOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="field-help">Os horários ficam salvos como instantes UTC. Alterar este fuso depois muda apenas a apresentação e será auditado; datas já salvas não serão reinterpretadas silenciosamente.</span></div>
              <div className="form-group"><label htmlFor="estimatedAudience">Público estimado</label><input className="input" id="estimatedAudience" type="number" inputMode="numeric" min={1} max={1000000} step={1} value={draft.estimatedAudience ?? ''} disabled={draft.audiencePending} onChange={(event) => { const value = event.target.value; update('estimatedAudience', value ? Number.parseInt(value, 10) : null); if (value) update('audiencePending', false); }} placeholder="Ex.: 800" aria-describedby="estimatedAudience-help" /><span className="field-help" id="estimatedAudience-help">É apenas uma estimativa para a EVA orientar credenciamento, acesso e infraestrutura. Não define capacidade, estoque ou limite de inscrições.</span></div>
              <label className="pending-toggle"><input type="checkbox" checked={draft.audiencePending === true} onChange={(event) => { update('audiencePending', event.target.checked); if (event.target.checked) update('estimatedAudience', null); }} /><span><strong>Definir o público estimado depois</strong><small>Você poderá ajustar essa previsão sem afetar capacidade ou inscrições.</small></span></label>
              <label className="pending-toggle"><input type="checkbox" checked={draft.datesPending === true} onChange={(event) => { update('datesPending', event.target.checked); if (event.target.checked) { update('startDate', null); update('endDate', null); } }} /><span><strong>Definir as datas depois</strong><small>Você poderá continuar e completar essa informação na configuração.</small></span></label>
            </div>}

            {stepIndex === 3 && <div className="wizard-section-stack"><div className="form-group"><label htmlFor="venue">{draft.format === 'ONLINE' ? 'Plataforma ou endereço online' : draft.format === 'HYBRID' ? 'Local presencial e referência online' : 'Local do evento'}</label><input className="input input-large" id="venue" value={draft.venue ?? ''} disabled={draft.venuePending} onChange={(event) => update('venue', event.target.value)} placeholder={draft.format === 'ONLINE' ? 'Ex.: Plataforma própria ou link a definir' : 'Ex.: Centro de Convenções, São Paulo/SP'} /></div><label className="pending-toggle"><input type="checkbox" checked={draft.venuePending === true} onChange={(event) => { update('venuePending', event.target.checked); if (event.target.checked) update('venue', null); }} /><span><strong>Definir o local depois</strong><small>A EVA manterá essa pendência visível antes da homologação.</small></span></label></div>}

            {stepIndex === 4 && <div className="choice-grid three-columns">{[
              ['FREE', 'Inscrição gratuita', 'Ideal quando não existe cobrança para participar.', 'R$ 0'],
              ['PAID', 'Inscrição paga', 'Prepara o evento para categorias, valores e pagamentos.', 'R$'],
              ['INVITATION', 'Somente convidados', 'Controle por convite, lista ou liberação da organização.', '✉'],
            ].map(([value, title, description, icon]) => <button type="button" className={`choice-card ${draft.registrationMode === value ? 'selected' : ''}`} key={value} onClick={() => update('registrationMode', value as RegistrationMode)}><span className="choice-icon text-icon">{icon}</span><strong>{title}</strong><p>{description}</p><span className="selection-mark">✓</span></button>)}</div>}

            {stepIndex === 5 && <div className="wizard-section-stack"><div className="recommendation-banner"><div><span className="eva-mini">EVA</span><strong>Pré-configuração inteligente aplicada</strong><p>Você pode confirmar a recomendação ou personalizar agora. Recursos poderão ser refinados depois.</p></div><button className="btn btn-secondary btn-small" type="button" onClick={restoreRecommendations}>Restaurar sugestões</button></div><div className="capability-grid">{catalog.map((item) => { const selected = draft.capabilities?.includes(item.code) ?? false; return <button type="button" key={item.code} className={`capability-card ${selected ? 'selected' : ''}`} onClick={() => toggleCapability(item)} aria-pressed={selected}><div className="capability-head"><span className="capability-category">{item.category}</span>{item.recommended && <span className="recommended-badge">Recomendado</span>}</div><strong>{item.label}</strong><p>{item.description}</p><small>{item.value}</small><span className={`capability-toggle ${selected ? 'on' : ''}`}>{item.required ? 'Obrigatório' : selected ? 'Ativado' : 'Ativar'}</span></button>; })}</div></div>}

            {stepIndex === 6 && <div className="review-premium"><div className="review-hero"><span className="review-check">✓</span><div><strong>Pronto para seguir para a configuração</strong><p>A fundação está organizada. Publicação, pagamentos e acessos ainda dependerão de homologação.</p></div></div><div className="review-grid"><div className="review-block"><span>Evento</span><strong>{draft.name}</strong><p>{draft.eventType}</p></div><div className="review-block"><span>Responsável</span><strong>{selectedOrganization?.organization.name}</strong><p>{formatLabels[draft.format ?? '']} · Inscrição {registrationLabels[draft.registrationMode ?? '']?.toLowerCase()}</p></div><div className="review-block"><span>Data</span><strong>{draft.datesPending ? 'A definir' : toDateInput(draft.startDate) || 'A definir'}</strong><p>{draft.datesPending ? 'Pendência registrada' : draft.endDate ? `até ${toDateInput(draft.endDate)}` : 'Evento de um dia'} · {timeZoneLabels[draft.timeZone ?? ''] ?? draft.timeZone}</p></div><div className="review-block"><span>Público estimado</span><strong>{draft.audiencePending ? 'A definir' : formatAudience(draft.estimatedAudience)}</strong><p>{draft.audiencePending ? 'Pendência registrada' : draft.estimatedAudience ? 'Estimativa operacional, não capacidade' : 'Opcional nesta etapa'}</p></div><div className="review-block"><span>Local</span><strong>{draft.venuePending ? 'A definir' : draft.venue || (draft.format === 'ONLINE' ? 'Online' : 'A definir')}</strong><p>{draft.venuePending ? 'Pendência registrada' : 'Informação salva'}</p></div></div><div className="review-capabilities"><div className="review-section-title"><strong>Recursos iniciais</strong><span>{draft.capabilities?.length ?? 0} ativados</span></div><div className="chip-list">{catalog.filter((item) => draft.capabilities?.includes(item.code)).map((item) => <span key={item.code}>{item.shortLabel}</span>)}</div></div></div>}

            <div className="wizard-actions premium-actions"><button className="btn btn-secondary" type="button" onClick={() => stepIndex === 0 ? router.push('/painel') : goTo(stepIndex - 1)}>{stepIndex === 0 ? 'Cancelar' : 'Voltar'}</button>{stepIndex < steps.length - 1 ? <button className="btn btn-primary btn-next" type="button" disabled={starting || saveState === 'saving'} onClick={() => goTo(stepIndex + 1)}>{starting ? 'Criando ambiente…' : 'Continuar'}<span>→</span></button> : <button className="btn btn-primary btn-next" type="button" disabled={finishing || saveState === 'saving'} onClick={finish}>{finishing ? 'Concluindo…' : 'Concluir fundação'}<span>✓</span></button>}</div>
          </section>

          <aside className="eva-panel premium-eva-panel"><div className="eva-avatar">EVA</div><div className="eva-bubble"><strong>Estou com você nesta etapa</strong><p>{[
            'O tipo do evento evita que você comece de uma tela vazia. Eu transformo a escolha específica em uma base coerente com a operação real, sem engessar sua configuração.',
            'O formato influencia credenciamento, acesso, comunicação e o que precisa ser homologado.',
            'Você não precisa ter tudo decidido. Nome, datas e público estimado ajudam a antecipar necessidades sem transformar previsões em limites rígidos.',
            'Pendências ficam visíveis para que nada importante seja esquecido antes da publicação.',
            'A inscrição é a porta de entrada do participante e orienta várias regras do evento.',
            'Ative apenas o que gera valor. Menos complexidade agora significa implantação mais rápida.',
            'A partir daqui, o evento entra em configuração. Você continuará no controle de cada decisão.',
          ][stepIndex]}</p></div><div className="eva-insight"><span>✦</span><div><strong>Visão do organizador</strong><p>{[
            'Escolher o tipo mais próximo melhora as recomendações, mas você poderá refinar tudo depois.',
            'Você poderá combinar operação presencial e digital no modo híbrido.',
            'Público estimado orienta planejamento; capacidade real será configurada nas áreas próprias.',
            'O local pode ser completado quando a negociação estiver concluída.',
            'A cobrança ainda passará por configuração financeira e testes.',
            'As sugestões consideram experiência, operação e controle.',
            'Nenhuma configuração vai ao ar sem passar pelo Go/No-Go.',
          ][stepIndex]}</p></div></div></aside>
        </div>
      </div>
    </section>
  </main>;
}
