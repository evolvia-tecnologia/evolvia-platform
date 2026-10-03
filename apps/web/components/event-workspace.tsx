'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, getToken } from '../lib/api';
import { buildEventFlow, type EventFlowSection } from '../lib/event-flow';
import styles from './event-admin-dashboard.module.css';

type WorkspacePayload = {
  event: {
    id: string;
    name: string;
    status: string;
    profileCode?: string | null;
    organization: { name: string };
  };
  session: { completionPercent: number };
  answers: {
    eventType?: string;
    capabilities?: string[];
  };
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

const sectionLabels: Record<EventFlowSection, string> = {
  overview: 'Visão geral',
  publication: 'Divulgação',
  integrations: 'Integrações',
  commercial: 'Categorias e lotes',
  form: 'Ficha de inscrição',
  benefits: 'Cupons e convites',
  registrations: 'Inscrições recebidas',
  'check-in': 'Credenciamento e check-in',
  financial: 'Responsável financeiro',
  scientific: 'Científico',
};

const flowStateLabels: Record<string, string> = {
  done: 'Concluída',
  current: 'Etapa atual',
  available: 'Disponível',
};

export default function EventWorkspace({
  eventId,
  section,
  payload: providedPayload,
  contentTag = 'main',
  children,
}: {
  eventId: string;
  section: EventFlowSection;
  payload?: WorkspacePayload | null;
  contentTag?: 'main' | 'div';
  children: ReactNode;
}) {
  const router = useRouter();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [payload, setPayload] = useState<WorkspacePayload | null>(providedPayload ?? null);
  const [loading, setLoading] = useState(!providedPayload);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavigation, setMobileNavigation] = useState(false);

  useEffect(() => {
    if (providedPayload) {
      setPayload(providedPayload);
      setLoading(false);
      return;
    }
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    let active = true;
    api<WorkspacePayload>(`/event-wizard/${eventId}`)
      .then((result) => { if (active) setPayload(result); })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o painel deste evento.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventId, providedPayload, router]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const syncViewport = () => {
      setMobileNavigation(media.matches);
      if (!media.matches) setMenuOpen(false);
    };
    syncViewport();
    media.addEventListener('change', syncViewport);
    return () => media.removeEventListener('change', syncViewport);
  }, []);

  useEffect(() => {
    if (!mobileNavigation || !menuOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [mobileNavigation, menuOpen]);

  if (loading) {
    return <main className={styles.loadingPage} aria-busy="true">
      <div className={styles.loadingMark} aria-hidden="true">E</div>
      <p>A EVA está organizando o painel do evento...</p>
    </main>;
  }

  if (!payload) {
    return <main className={styles.errorPage}>
      <div className={styles.error} role="alert">{error || 'Não foi possível carregar este evento.'}</div>
      <Link className={styles.secondaryButton} href="/painel">Voltar ao painel</Link>
    </main>;
  }

  const capabilities = payload.answers.capabilities ?? [];
  const isScientific = payload.event.profileCode === 'SCIENTIFIC_EVENT' || capabilities.includes('scientific_submission');
  const eventStatus = statusLabels[payload.event.status] ?? payload.event.status;
  const navigationHidden = mobileNavigation && !menuOpen;
  const navigationTabIndex = navigationHidden ? -1 : undefined;
  const closeMenu = () => setMenuOpen(false);
  const flow = buildEventFlow({
    eventId,
    status: payload.event.status,
    section,
    scientific: isScientific,
  });
  const Content = contentTag;

  function navClass(active: boolean) {
    return `${styles.navItem} ${active ? styles.navItemActive : ''}`;
  }

  return <div className={styles.page}>
    <a className={styles.skipLink} href="#event-admin-content">Pular para o conteúdo</a>
    <header className={styles.topbar}>
      <div className={styles.topbarIdentity}>
        <button
          ref={menuButtonRef}
          className={styles.menuButton}
          type="button"
          aria-expanded={menuOpen}
          aria-controls="event-admin-navigation"
          onClick={() => setMenuOpen((current) => !current)}
        >
          Menu
        </button>
        <Link className={styles.brand} href="/painel">EVOLVIA</Link>
        <div className={styles.eventIdentity}>
          <strong>{payload.event.name}</strong>
          <span>{payload.event.organization.name}</span>
        </div>
      </div>
      {section !== 'overview' && <Link className={styles.overviewLink} href={`/eventos/${eventId}/painel`}>Visão geral do evento</Link>}
      <div className={styles.topbarStatus}>
        <span className={styles.statusDot} aria-hidden="true" />
        <span>{eventStatus}</span>
      </div>
    </header>

    <div className={styles.workspace}>
      <button
        className={`${styles.backdrop} ${menuOpen ? styles.backdropVisible : ''}`}
        type="button"
        aria-label="Fechar menu"
        tabIndex={-1}
        onClick={closeMenu}
      />
      <aside
        id="event-admin-navigation"
        className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}
        aria-hidden={navigationHidden ? true : undefined}
      >
        <div className={styles.sidebarHeading}>
          <span>PAINEL DO EVENTO</span>
          <strong>{payload.event.name}</strong>
          <small>{payload.answers.eventType ?? 'Evento'}</small>
        </div>
        <nav className={styles.navigation} aria-label="Navegação do evento">
          <span className={styles.navGroupLabel}>Início</span>
          <Link className={navClass(section === 'overview')} aria-current={section === 'overview' ? 'page' : undefined} href={`/eventos/${eventId}/painel`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">⌂</span>
            <span><strong>Visão geral</strong><small>Caminho e pendências</small></span>
          </Link>
          <span className={styles.navGroupLabel}>Divulgação</span>
          <Link className={navClass(section === 'publication')} aria-current={section === 'publication' ? 'page' : undefined} href={`/eventos/${eventId}/painel/divulgacao`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">◫</span>
            <span><strong>Divulgação</strong><small>Página pública e publicação</small></span>
          </Link>
          <span className={styles.navGroupLabel}>Inscrições e vendas</span>
          <Link className={navClass(section === 'commercial')} aria-current={section === 'commercial' ? 'page' : undefined} href={`/eventos/${eventId}/painel/inscricoes/categorias-lotes`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">▦</span>
            <span><strong>Categorias e lotes</strong><small>Quem pode se inscrever</small></span>
          </Link>
          <Link className={navClass(section === 'form')} aria-current={section === 'form' ? 'page' : undefined} href={`/eventos/${eventId}/painel/inscricoes/ficha`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">▤</span>
            <span><strong>Ficha de inscrição</strong><small>Dados pedidos ao participante</small></span>
          </Link>
          <Link className={navClass(section === 'benefits')} aria-current={section === 'benefits' ? 'page' : undefined} href={`/eventos/${eventId}/painel/inscricoes/beneficios`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">%</span>
            <span><strong>Cupons e convites</strong><small>Benefícios comerciais</small></span>
          </Link>
          <Link className={navClass(section === 'registrations')} aria-current={section === 'registrations' ? 'page' : undefined} href={`/eventos/${eventId}/painel/inscricoes`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">☷</span>
            <span><strong>Inscrições recebidas</strong><small>Situação e presença</small></span>
          </Link>
          <span className={styles.navGroupLabel}>Operação</span>
          <Link className={navClass(section === 'check-in')} aria-current={section === 'check-in' ? 'page' : undefined} href={`/eventos/${eventId}/painel/check-in`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">▣</span>
            <span><strong>Credenciamento e check-in</strong><small>Entrada com a credencial</small></span>
          </Link>
          <Link className={navClass(section === 'financial')} aria-current={section === 'financial' ? 'page' : undefined} href={`/eventos/${eventId}/painel/financeiro`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">R$</span>
            <span><strong>Responsável financeiro</strong><small>Quem responde pela venda</small></span>
          </Link>
          <span className={styles.navGroupLabel}>Conexões</span>
          <Link className={navClass(section === 'integrations')} aria-current={section === 'integrations' ? 'page' : undefined} href={`/eventos/${eventId}/painel/integracoes`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">⬡</span>
            <span><strong>Integrações</strong><small>Catálogo explicativo</small></span>
          </Link>
          {isScientific && <>
            <span className={styles.navGroupLabel}>Conteúdo científico</span>
            <Link className={navClass(section === 'scientific')} aria-current={section === 'scientific' ? 'page' : undefined} href={`/eventos/${eventId}/cientifico`} tabIndex={navigationTabIndex} onClick={closeMenu}>
              <span aria-hidden="true">◇</span>
              <span><strong>Científico</strong><small>Grade, programação e trabalhos</small></span>
            </Link>
          </>}
        </nav>
        <div className={styles.sidebarFooter}>
          <span aria-hidden="true">◎</span>
          <p><strong>Ambiente de configuração</strong>Nada é publicado automaticamente.</p>
        </div>
      </aside>

      <Content id="event-admin-content" className={styles.content} tabIndex={-1}>
        <div className={styles.breadcrumb} aria-label="Você está em">
          <Link href="/painel">Eventos</Link>
          <span aria-hidden="true">/</span>
          {section === 'overview' ? <strong>{payload.event.name}</strong> : <>
            <Link href={`/eventos/${eventId}/painel`}>{payload.event.name}</Link>
            <span aria-hidden="true">/</span>
            <strong>{sectionLabels[section]}</strong>
          </>}
        </div>
        <nav className={styles.flow} aria-label="Caminho do evento">
          <ol>
            {flow.map((step, index) => <li key={step.id} data-state={step.state}>
              <Link href={step.href} aria-current={step.state === 'current' ? 'step' : undefined}>
                <span aria-hidden="true">{step.state === 'done' ? '✓' : index + 1}</span>
                <span>{step.label}</span>
                <small>{flowStateLabels[step.state]}</small>
              </Link>
            </li>)}
          </ol>
        </nav>
        {children}
      </Content>
    </div>
  </div>;
}
