'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, clearSession, getToken } from '../../lib/api';

type OrganizationMembership = {
  id: string;
  role: string;
  organization: { id: string; name: string; slug: string; status: string };
};

type User = {
  id: string;
  name: string;
  email: string;
  memberships: OrganizationMembership[];
};

type EventItem = {
  id: string;
  name: string;
  eventType: string;
  format: string;
  status: string;
  updatedAt: string;
  organizationId: string | null;
  organization?: { id: string; name: string; slug: string };
  wizard: null | {
    currentStep: string;
    completionPercent: number;
    status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
    lastSavedAt: string;
  };
  capabilityCodes: string[];
  operatorPermissions: string[];
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Rascunho',
  SETUP: 'Em configuração',
  HOMOLOGATION: 'Em homologação',
  READY_TO_PUBLISH: 'Pronto para publicar',
  PUBLISHED: 'Publicado',
  SUSPENDED: 'Suspenso',
  FINISHED: 'Finalizado',
  CANCELLED: 'Cancelado',
};

const formatLabels: Record<string, string> = {
  IN_PERSON: 'Presencial',
  ONLINE: 'Online',
  HYBRID: 'Híbrido',
};

const capabilityLabels: Record<string, string> = {
  registration: 'Inscrições',
  payment: 'Pagamentos',
  communication: 'Comunicação',
  credential: 'Credenciamento',
  access_control: 'Acessos',
  scientific_submission: 'Trabalhos',
  certificate: 'Certificados',
  exhibitor: 'Expositores',
  material_delivery: 'Materiais',
};

export default function PainelPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [organizationId, setOrganizationId] = useState('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }

    Promise.all([api<User>('/me'), api<EventItem[]>('/events')])
      .then(([me, list]) => {
        setUser(me);
        setEvents(list);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Erro ao carregar.'))
      .finally(() => setLoading(false));
  }, [router]);

  const filteredEvents = useMemo(
    () => organizationId === 'all'
      ? events
      : events.filter((event) => event.organizationId === organizationId),
    [events, organizationId],
  );

  const hasEditorRole = events.some((event) => event.organizationId === null)
    || (user?.memberships.some((membership) => ['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) ?? false);
  const canEdit = (item: EventItem) => item.organizationId === null || (user?.memberships.some((membership) =>
    membership.organization.id === item.organizationId && ['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role)) ?? false);
  const activeDrafts = events.filter((event) => event.wizard?.status === 'ACTIVE').length;
  const structuredEvents = events.filter((event) => (event.wizard?.completionPercent ?? 100) === 100).length;

  function logout() {
    clearSession();
    router.push('/');
  }

  return <main className="shell dashboard-shell">
    <header className="topbar dashboard-topbar">
      <Link className="brand" href="/painel">EVOLVIA</Link>
      <div className="nav-actions">
        <span className="topbar-user">{user?.email}</span>
        <Link className="btn btn-ghost-dark" href="/acesso">Trocar de área</Link>
        <button className="btn btn-ghost-dark" onClick={logout}>Sair</button>
      </div>
    </header>

    <section className="container dashboard-page premium-dashboard">
      <div className="dashboard-welcome">
        <div>
          <p className="eyebrow">{hasEditorRole ? 'PAINEL DO ORGANIZADOR' : 'ÁREA DE OPERAÇÃO'}</p>
          <h1>{user ? `Olá, ${user.name.split(' ')[0]}` : 'Preparando seu painel...'}</h1>
          <p className="dashboard-lead">{hasEditorRole ? 'Crie, configure e acompanhe seus eventos com a EVA.' : 'Acesse somente os eventos e as funções atribuídos à sua conta.'}</p>
        </div>
        {hasEditorRole && <Link className="btn btn-primary dashboard-create" href="/eventos/novo"><span>＋</span>Criar evento com a EVA</Link>}
      </div>

      {error && <div className="error">{error}</div>}

      {hasEditorRole && <div className="dashboard-metrics">
        <div className="metric-card"><span className="metric-icon">▦</span><div><strong>{events.length}</strong><small>Eventos no ambiente</small></div></div>
        <div className="metric-card"><span className="metric-icon">◔</span><div><strong>{activeDrafts}</strong><small>Rascunhos para continuar</small></div></div>
        <div className="metric-card"><span className="metric-icon">✓</span><div><strong>{structuredEvents}</strong><small>Fundações concluídas</small></div></div>
      </div>}

      {hasEditorRole && user && user.memberships.length > 0 && <section className="card" aria-labelledby="organizations-title" style={{ padding: '1.25rem', marginBottom: '2rem' }}>
        <h2 id="organizations-title">Suas organizações</h2>
        <p className="muted">Complete os dados da pessoa física ou jurídica responsável antes de configurar vendas.</p>
        <ul>{user.memberships.map((membership) => <li key={membership.organization.id}>
          <strong>{membership.organization.name}</strong>{' '}
          {(membership.role === 'OWNER' || membership.role === 'ADMIN') && <Link href={`/organizacoes/${membership.organization.id}/dados-fiscais`}>Editar dados legais</Link>}
        </li>)}</ul>
      </section>}

      <div className="events-section-head">
        <div><h2>Seus eventos</h2><p>{hasEditorRole ? 'Acompanhe o progresso e continue exatamente de onde parou.' : 'Selecione um evento atribuído para iniciar a operação.'}</p></div>
        {(user?.memberships?.length ?? 0) > 1 && <select className="select organization-filter" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}><option value="all">Todas as organizações</option>{user?.memberships.map((membership) => <option key={membership.organization.id} value={membership.organization.id}>{membership.organization.name}</option>)}</select>}
      </div>

      {loading ? <div className="events-skeleton"><div /><div /><div /></div> : filteredEvents.length === 0 ? <div className="empty-state premium-empty"><div className="empty-illustration"><span>EV</span><i /></div><div><p className="eyebrow">COMECE EM MINUTOS</p><h2>{hasEditorRole ? 'Seu primeiro evento começa com boas perguntas' : 'Nenhum posto atribuído'}</h2><p>{hasEditorRole ? 'A EVA identifica o perfil, sugere os recursos e salva cada etapa para você continuar quando quiser.' : 'Solicite ao organizador uma função para este evento.'}</p>{hasEditorRole && <Link className="btn btn-primary" href="/eventos/novo">Começar agora</Link>}</div></div> : <div className="events-grid premium-events-grid">{filteredEvents.map((item) => {
        const progress = item.wizard?.completionPercent ?? (item.status === 'DRAFT' ? 0 : 100);
        const canResume = item.wizard?.status === 'ACTIVE';
        return <article className="event-card" key={item.id}>
          <div className="event-card-head"><span className={`event-status status-${item.status.toLowerCase()}`}>{statusLabels[item.status] ?? item.status}</span><span className="event-format">{item.wizard?.status === 'ACTIVE' && item.wizard.completionPercent < 20 ? 'Formato a definir' : formatLabels[item.format] ?? item.format}</span></div>
          <div className="event-card-body"><small>{item.organization?.name ?? 'Evento pessoal'}</small><h3>{item.name}</h3><p>{item.eventType}</p></div>
          {canEdit(item) && <div className="event-progress"><div><span>Estrutura do evento</span><strong>{progress}%</strong></div><div className="progress-track compact"><div className="progress-value" style={{ width: `${progress}%` }} /></div></div>}
          {item.capabilityCodes.length > 0 && <div className="event-capabilities">{item.capabilityCodes.slice(0, 3).map((code) => <span key={code}>{capabilityLabels[code] ?? code}</span>)}{item.capabilityCodes.length > 3 && <span>+{item.capabilityCodes.length - 3}</span>}</div>}
          <div className="event-card-footer"><span>Atualizado {new Date(item.updatedAt).toLocaleDateString('pt-BR')}</span><Link className={`btn ${canEdit(item) && canResume ? 'btn-primary' : 'btn-secondary'} btn-card`} href={canEdit(item) ? `/eventos/${item.id}/painel` : `/eventos/${item.id}/operacao`}>{canEdit(item) ? 'Abrir painel' : 'Abrir operação'}<b>→</b></Link></div>
        </article>;
      })}</div>}
    </section>
  </main>;
}
