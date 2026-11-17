'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import OrganizerEventCard from '../../components/organizer-event-card';
import { api, clearSession, getToken } from '../../lib/api';
import { countCompletedFoundations, countDraftsToContinue } from '../../lib/organizer-event-card';

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
  organizationId?: string;
  organization?: { id: string; name: string; slug: string };
  wizard: null | {
    currentStep: string;
    completionPercent: number;
    status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
    lastSavedAt: string;
  };
  capabilityCodes: string[];
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

  const activeDrafts = countDraftsToContinue(events);
  const structuredEvents = countCompletedFoundations(events);

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
          <p className="eyebrow">PAINEL DO ORGANIZADOR</p>
          <h1>{user ? `Olá, ${user.name.split(' ')[0]}` : 'Preparando seu painel...'}</h1>
          <p className="dashboard-lead">Crie, configure e acompanhe seus eventos com a EVA — sem começar de uma tela vazia.</p>
        </div>
        <Link className="btn btn-primary dashboard-create" href="/eventos/novo"><span>＋</span>Criar evento com a EVA</Link>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="dashboard-metrics">
        <div className="metric-card"><span className="metric-icon">▦</span><div><strong>{events.length}</strong><small>Eventos no ambiente</small></div></div>
        <div className="metric-card"><span className="metric-icon">◔</span><div><strong>{activeDrafts}</strong><small>Rascunhos para continuar</small></div></div>
        <div className="metric-card"><span className="metric-icon">✓</span><div><strong>{structuredEvents}</strong><small>Fundações concluídas</small></div></div>
      </div>

      {user && user.memberships.length > 0 && <section className="card" aria-labelledby="organizations-title" style={{ padding: '1.25rem', marginBottom: '2rem' }}>
        <h2 id="organizations-title">Suas organizações</h2>
        <p className="muted">Complete os dados da pessoa física ou jurídica responsável antes de configurar vendas.</p>
        <ul>{user.memberships.map((membership) => <li key={membership.organization.id}>
          <strong>{membership.organization.name}</strong>{' '}
          {(membership.role === 'OWNER' || membership.role === 'ADMIN') && <Link href={`/organizacoes/${membership.organization.id}/dados-fiscais`}>Editar dados legais</Link>}
        </li>)}</ul>
      </section>}

      <div className="events-section-head">
        <div><h2>Seus eventos</h2><p>Acompanhe o progresso e continue exatamente de onde parou.</p></div>
        {(user?.memberships?.length ?? 0) > 1 && <select className="select organization-filter" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}><option value="all">Todas as organizações</option>{user?.memberships.map((membership) => <option key={membership.organization.id} value={membership.organization.id}>{membership.organization.name}</option>)}</select>}
      </div>

      {loading ? <div className="events-skeleton"><div /><div /><div /></div> : filteredEvents.length === 0 ? <div className="empty-state premium-empty"><div className="empty-illustration"><span>EV</span><i /></div><div><p className="eyebrow">COMECE EM MINUTOS</p><h2>Seu primeiro evento começa com boas perguntas</h2><p>A EVA identifica o perfil, sugere os recursos e salva cada etapa para você continuar quando quiser.</p><Link className="btn btn-primary" href="/eventos/novo">Começar agora</Link></div></div> : <div className="events-grid premium-events-grid">{filteredEvents.map((item) => <OrganizerEventCard key={item.id} item={item} />)}</div>}
    </section>
  </main>;
}
