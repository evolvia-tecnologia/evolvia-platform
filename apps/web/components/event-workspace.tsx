'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, api, getToken } from '../lib/api';
import {
  acceptWorkspacePayload,
  buildEventFlow,
  initialWorkspaceView,
  rejectWorkspaceLoad,
  replaceWorkspaceEvent,
  showsScientificNavigation,
  showsExhibitorNavigation,
  showsEntertainmentNavigation,
  showsTransmissionNavigation,
  visibleWorkspacePayload,
  workspaceShell,
  type EventFlowSection,
} from '../lib/event-flow';
import styles from './event-admin-dashboard.module.css';
import AccessibilityPanel from './accessibility-panel';

type WorkspacePayload = {
  event: {
    id: string;
    name: string;
    status: string;
    profileCode?: string | null;
    format?: string | null;
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
  reports: 'Relatórios',
  publication: 'Divulgação',
  communication: 'Comunicação',
  integrations: 'Integrações',
  commercial: 'Categorias e lotes',
  form: 'Ficha de inscrição',
  benefits: 'Cupons e convites',
  registrations: 'Inscrições recebidas',
  'check-in': 'Credenciamento',
  show: 'Acessos e catracas',
  transmission: 'Transmissão',
  certificates: 'Certificados',
  financial: 'Responsável financeiro',
  scientific: 'Científico',
  exhibitors: 'Expositor e serviços',
  caex: 'CAEX',
};

const flowStateLabels: Record<string, string> = {
  done: 'Concluída',
  current: 'Etapa atual',
  available: 'Disponível',
};

function worksPath(pathname: string) {
  return /\/cientifico\/(trabalhos|submissoes|avaliacao)(?:\/|$)/u.test(pathname);
}

function programPath(pathname: string) {
  return /\/cientifico\/(grade|estrutura|palestrantes|programacao)(?:\/|$)/u.test(pathname);
}

function scientificCrumb(pathname: string, eventId: string, fallback: string) {
  const worksChild = pathname.match(/\/cientifico\/(submissoes|avaliacao)(?:\/|$)/u);
  const programChild = pathname.match(/\/cientifico\/(estrutura|palestrantes|programacao)(?:\/|$)/u);
  const pageLabels: Record<string, string> = {
    submissoes: 'Configuração da submissão',
    avaliacao: 'Avaliação e decisão',
    estrutura: 'Grade científica',
    palestrantes: 'Palestrantes',
    programacao: 'Locais, dias e horários',
  };
  if (worksChild) {
    return <>
      <Link href={`/eventos/${eventId}/cientifico/trabalhos`}>Trabalhos científicos</Link>
      <span aria-hidden="true">/</span>
      <strong>{pageLabels[worksChild[1]]}</strong>
    </>;
  }
  if (programChild) {
    return <>
      <Link href={`/eventos/${eventId}/cientifico/grade`}>Programação científica</Link>
      <span aria-hidden="true">/</span>
      <strong>{pageLabels[programChild[1]]}</strong>
    </>;
  }
  if (worksPath(pathname)) return <strong>Trabalhos científicos</strong>;
  if (programPath(pathname)) return <strong>Programação científica</strong>;
  return <strong>{fallback}</strong>;
}

function LoadingPanel() {
  return <main className={styles.loadingPage} aria-busy="true">
    <div className={styles.loadingMark} aria-hidden="true">E</div>
    <p>A EVA está organizando o painel do evento...</p>
  </main>;
}

function ClosedPanel({ message }: { message: string }) {
  return <main className={styles.errorPage}>
    <div className={styles.error} role="alert">{message || 'Não foi possível carregar este evento.'}</div>
    <Link className={styles.secondaryButton} href="/painel">Voltar ao painel</Link>
  </main>;
}

function OperationalEventFrame({ section, children }: { section: EventFlowSection; children: ReactNode }) {
  return <div className={styles.page} data-shell="operation">
    <a className={styles.skipLink} href="#event-admin-content">Pular para o conteúdo</a>
    <header className={styles.operationBar}>
      <Link className={styles.brand} href="/painel">EVOLVIA</Link>
      <strong>{sectionLabels[section]}</strong>
      <Link className={styles.secondaryButton} href="/painel">Voltar ao painel</Link>
    </header>
    <p className={styles.operationNote}>A configuração do evento não faz parte deste acesso. A operação continua disponível.</p>
    <div id="event-admin-content" className={styles.operationContent} tabIndex={-1}>
      {children}
    </div>
  </div>;
}

export default function EventWorkspace({
  eventId: requestedEventId,
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
  const pathname = usePathname() ?? '';
  const eventId = requestedEventId || '';
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [view, setView] = useState(() => {
    if (providedPayload?.event.id === eventId && eventId) {
      return acceptWorkspacePayload(initialWorkspaceView<WorkspacePayload>(eventId), eventId, providedPayload);
    }
    return initialWorkspaceView<WorkspacePayload>(eventId);
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavigation, setMobileNavigation] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (view.eventId !== eventId) {
    const next = providedPayload?.event.id === eventId && eventId
      ? acceptWorkspacePayload(replaceWorkspaceEvent<WorkspacePayload>(eventId), eventId, providedPayload)
      : replaceWorkspaceEvent<WorkspacePayload>(eventId);
    setView(next);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!eventId) return;
    if (providedPayload !== undefined) {
      if (providedPayload?.event.id !== eventId) {
        setView(replaceWorkspaceEvent<WorkspacePayload>(eventId));
        return;
      }
      setView((current) => acceptWorkspacePayload(
        current.eventId === eventId ? current : replaceWorkspaceEvent(eventId),
        eventId,
        providedPayload,
      ));
      return;
    }
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    let active = true;
    api<WorkspacePayload>(`/event-wizard/${eventId}`)
      .then((result) => {
        if (active) setView((current) => acceptWorkspacePayload(current, eventId, result));
      })
      .catch((reason) => {
        if (!active) return;
        if (reason instanceof ApiError && reason.status === 401) {
          router.replace('/login');
          return;
        }
        const message = reason instanceof Error ? reason.message : 'Não foi possível abrir o painel deste evento.';
        setView((current) => rejectWorkspaceLoad(current, eventId, message));
      });
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

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const payload = visibleWorkspacePayload(view, eventId);
  const shell = workspaceShell({
    section,
    eventId: eventId,
    phase: view.eventId === eventId ? view.phase : 'loading',
    payloadEventId: payload?.event.id ?? null,
  });

  useEffect(() => {
    const header = headerRef.current;
    if (!header || typeof ResizeObserver === 'undefined') return;
    const syncHeight = () => header.closest<HTMLElement>('[data-shell="panel"]')?.style.setProperty(
      '--event-header-height', `${header.getBoundingClientRect().height}px`,
    );
    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(header);
    return () => observer.disconnect();
  }, [shell]);

  if (shell === 'loading') return <LoadingPanel />;
  if (shell === 'operation') {
    return <OperationalEventFrame section={section}><div key={eventId}>{children}</div></OperationalEventFrame>;
  }
  if (shell === 'error' || !payload) {
    return <ClosedPanel message={view.eventId === eventId ? view.error : ''} />;
  }

  const isScientific = showsScientificNavigation(payload.event.profileCode, payload.answers.capabilities);
  const hasExhibitors = showsExhibitorNavigation(payload.answers.capabilities);
  const isShow = showsEntertainmentNavigation(payload.event.profileCode, payload.answers.eventType);
  const hasTransmission = showsTransmissionNavigation(payload.event.format);
  const eventStatus = statusLabels[payload.event.status] ?? payload.event.status;
  const desktopNavigationHidden = !mobileNavigation && sidebarCollapsed;
  const navigationHidden = desktopNavigationHidden || (mobileNavigation && !menuOpen);
  const navigationTabIndex = navigationHidden ? -1 : undefined;
  const closeMenu = () => setMenuOpen(false);
  const flow = buildEventFlow({
    eventId: eventId,
    status: payload.event.status,
    section,
    scientific: isScientific,
  });
  const Content = contentTag;

  function navClass(active: boolean) {
    return `${styles.navItem} ${active ? styles.navItemActive : ''}`;
  }

  return <div className={styles.page} data-shell="panel">
    <a className={styles.skipLink} href="#event-admin-content">Pular para o conteúdo</a>
    <header ref={headerRef} className={styles.topbar}>
      <div className={styles.topbarIdentity}>
        
        <Link className={styles.brand} href="/painel">EVOLVIA</Link>
        <div className={styles.eventIdentity}>
          <strong>{payload.event.name}</strong>
          <span>{payload.event.organization.name}</span>
        </div>
      </div>
      {section !== 'overview' && <Link className={styles.overviewLink} href={`/eventos/${eventId}/painel`}>Visão geral do evento</Link>}
      <AccessibilityPanel inline />
      <div className={styles.topbarStatus}>
        <span className={styles.statusDot} aria-hidden="true" />
        <span>{eventStatus}</span>
      </div>
    </header>

    <div className={`${styles.workspace} ${desktopNavigationHidden ? styles.workspaceCollapsed : ''}`}>
      <div className={styles.navigationControls}>
        <button
          ref={menuButtonRef}
          className={styles.navigationToggle}
          type="button"
          aria-label={navigationHidden ? 'Mostrar menu lateral' : 'Ocultar menu lateral'}
          aria-expanded={!navigationHidden}
          aria-controls="event-admin-navigation"
          onClick={() => {
            if (mobileNavigation) setMenuOpen((current) => !current);
            else setSidebarCollapsed((current) => !current);
          }}
        ><span aria-hidden="true">{navigationHidden ? '☰' : '‹'}</span>{navigationHidden ? 'Mostrar menu' : 'Ocultar menu'}</button>
      </div>
      <button
        className={`${styles.backdrop} ${menuOpen ? styles.backdropVisible : ''}`}
        type="button"
        aria-label="Fechar menu"
        tabIndex={-1}
        onClick={closeMenu}
      />
      <aside
        id="event-admin-navigation"
        hidden={desktopNavigationHidden}
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
          <Link className={navClass(section === 'communication')} aria-current={section === 'communication' ? 'page' : undefined} href={`/eventos/${eventId}/painel/comunicacao`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">✉</span>
            <span><strong>Comunicação</strong><small>Mensagens e rascunhos</small></span>
          </Link>
          <span className={styles.navGroupLabel}>{isShow ? 'Ingressos e vendas' : 'Inscrições e vendas'}</span>
          <Link className={navClass(section === 'commercial')} aria-current={section === 'commercial' ? 'page' : undefined} href={`/eventos/${eventId}/painel/inscricoes/categorias-lotes`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">▦</span>
            <span><strong>Categorias e lotes</strong><small>{isShow ? 'Quem pode comprar' : 'Quem pode se inscrever'}</small></span>
          </Link>
          <Link className={navClass(section === 'form')} aria-current={section === 'form' ? 'page' : undefined} href={`/eventos/${eventId}/painel/inscricoes/ficha`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">▤</span>
            <span><strong>Ficha de inscrição</strong><small>Dados pedidos ao participante</small></span>
          </Link>
          <Link className={navClass(section === 'benefits')} aria-current={section === 'benefits' ? 'page' : undefined} href={`/eventos/${eventId}/painel/inscricoes/beneficios`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">%</span>
            <span><strong>Cupons e convites</strong><small>Benefícios comerciais</small></span>
          </Link>
          <Link className={navClass(section === 'financial')} aria-current={section === 'financial' ? 'page' : undefined} href={`/eventos/${eventId}/painel/financeiro`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">R$</span>
            <span><strong>Responsável financeiro</strong><small>Quem responde pela venda</small></span>
          </Link>
          {isScientific && <>
            <div className={styles.navigationGroup} role="group" aria-label="Trabalhos científicos">
            <span className={styles.navGroupLabel}>Trabalhos científicos</span>
            <Link className={navClass(worksPath(pathname))} aria-current={worksPath(pathname) ? 'page' : undefined} href={`/eventos/${eventId}/cientifico/trabalhos`} tabIndex={navigationTabIndex} onClick={closeMenu}>
              <span aria-hidden="true">◇</span>
              <span><strong>Trabalhos científicos</strong><small>Submissão, avaliação e decisão</small></span>
            </Link>
            <Link className={navClass(false)} href={`/eventos/${eventId}/cientifico/submissoes#estacao`} tabIndex={navigationTabIndex} onClick={closeMenu}>
              <span aria-hidden="true">▤</span>
              <span><strong>Estação científica</strong><small>Resumos, e-pôsteres e link do totem</small></span>
            </Link>
            </div>
            <div className={styles.navigationGroup} role="group" aria-label="Programação científica">
            <span className={styles.navGroupLabel}>Programação científica</span>
            <Link className={navClass(programPath(pathname))} aria-current={programPath(pathname) ? 'page' : undefined} href={`/eventos/${eventId}/cientifico/grade`} tabIndex={navigationTabIndex} onClick={closeMenu}>
              <span aria-hidden="true">▦</span>
              <span><strong>Programação científica</strong><small>Palestrantes, atividades, locais, dias e horários</small></span>
            </Link>
            </div>
          </>}
          <span className={styles.navGroupLabel}>Operação</span>
          <Link className={navClass(section === 'registrations')} aria-current={section === 'registrations' ? 'page' : undefined} href={`/eventos/${eventId}/painel/inscricoes`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">☷</span>
            <span><strong>{isShow ? 'Ingressos vendidos' : 'Inscrições recebidas'}</strong><small>Situação e presença</small></span>
          </Link>
          <div className={styles.navigationGroup} role="group" aria-label="Secretaria e credenciamento">
          <Link className={navClass(section === 'check-in')} aria-current={section === 'check-in' ? 'page' : undefined} href={`/eventos/${eventId}/painel/check-in`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">▣</span>
            <span><strong>Credenciamento</strong><small>Secretaria: consulta, ficha, etiqueta e check-in</small></span>
          </Link>
          </div>
          {isShow && <Link className={navClass(section === 'show')} aria-current={section === 'show' ? 'page' : undefined} href={`/eventos/${eventId}/painel/show`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">▣</span>
            <span><strong>Acessos e catracas</strong><small>Relatórios e token da portaria</small></span>
          </Link>}
          {hasTransmission && <Link className={navClass(section === 'transmission')} aria-current={section === 'transmission' ? 'page' : undefined} href={`/eventos/${eventId}/painel/transmissao`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">▷</span>
            <span><strong>Transmissão</strong><small>Link para quem está inscrito</small></span>
          </Link>}
          <Link className={navClass(section === 'certificates')} aria-current={section === 'certificates' ? 'page' : undefined} href={`/eventos/${eventId}/painel/certificados`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">✎</span>
            <span><strong>Certificados</strong><small>Participação, sem taxa</small></span>
          </Link>
          {hasExhibitors && <div className={styles.navigationGroup} role="group" aria-labelledby="exhibitor-navigation-title">
            <span id="exhibitor-navigation-title" className={styles.navGroupLabel}>Expositor e serviços</span>
            <Link className={navClass(section === 'exhibitors')} aria-current={section === 'exhibitors' ? 'page' : undefined} href={`/eventos/${eventId}/painel/expositores`} tabIndex={navigationTabIndex} onClick={closeMenu}>
              <span aria-hidden="true">▦</span>
              <span><strong>Expositor e serviços</strong><small>Empresas, cotas, formulários e pedidos</small></span>
            </Link>
            <Link className={navClass(section === 'caex')} aria-current={section === 'caex' ? 'page' : undefined} href={`/eventos/${eventId}/painel/caex`} tabIndex={navigationTabIndex} onClick={closeMenu}>
              <span aria-hidden="true">▣</span>
              <span><strong>CAEX</strong><small>Credenciamento de expositor e prestador</small></span>
            </Link>
          </div>}
          <span className={styles.navGroupLabel}>Resultados</span>
          <Link className={navClass(section === 'reports')} aria-current={section === 'reports' ? 'page' : undefined} href={`/eventos/${eventId}/painel/relatorios`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">▥</span>
            <span><strong>Relatórios</strong><small>Inscrições, operação, financeiro e resultados</small></span>
          </Link>
          <span className={styles.navGroupLabel}>Conexões</span>
          <Link className={navClass(section === 'integrations')} aria-current={section === 'integrations' ? 'page' : undefined} href={`/eventos/${eventId}/painel/integracoes`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">⬡</span>
            <span><strong>Integrações</strong><small>Catálogo explicativo</small></span>
          </Link>

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
            {scientificCrumb(pathname, eventId, sectionLabels[section])}
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
        <div key={eventId}>{section === 'transmission' && !hasTransmission ? (
          <section role="alert" aria-label="Transmissão indisponível">
            <h2>Transmissão indisponível neste evento</h2>
            <p>Transmissão está disponível somente para eventos online ou híbridos. Confira o formato na Fundação do evento.</p>
            <Link href={`/eventos/${eventId}/configuracao?review=foundation`}>Ver Fundação do evento</Link>
          </section>
        ) : children}</div>
      </Content>
    </div>
  </div>;
}


