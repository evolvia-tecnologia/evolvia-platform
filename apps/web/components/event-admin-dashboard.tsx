'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, getToken } from '../lib/api';
import PublicationEditor from './publication-editor';
import IntegrationsHub from './integrations-hub';
import styles from './event-admin-dashboard.module.css';

type EventAdminSection = 'overview' | 'publication' | 'integrations';

type EventFormat = 'IN_PERSON' | 'ONLINE' | 'HYBRID' | '';

type EventAdminPayload = {
  event: {
    id: string;
    name: string;
    slug: string;
    status: string;
    profileCode?: string | null;
    organizationId: string;
    organization: { id: string; name: string; slug: string };
    updatedAt: string;
  };
  session: {
    currentStep: string;
    completionPercent: number;
    status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
    lastSavedAt: string;
  };
  answers: {
    eventType?: string;
    format?: EventFormat;
    startDate?: string | null;
    endDate?: string | null;
    datesPending?: boolean;
    venue?: string | null;
    venuePending?: boolean;
    registrationMode?: 'FREE' | 'PAID' | 'INVITATION' | '';
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

const eventJourney = [
  {
    phase: 1,
    title: 'Divulgação do evento',
    summary: 'Presença pública, conteúdo, identidade, preview, homologação e publicação.',
  },
  {
    phase: 2,
    title: 'Inscrição',
    summary: 'Categorias, lotes, formulários, pedidos e confirmação do participante.',
  },
  {
    phase: 3,
    title: 'Área reservada do inscrito',
    summary: 'Hub pessoal com dados, pagamentos, documentos, atividades e pendências.',
  },
  {
    phase: 4,
    title: 'Configuração de trabalhos científicos',
    summary: 'Regras, áreas temáticas, modalidades, critérios, prazos e documentos.',
    scientific: true,
  },
  {
    phase: 5,
    title: 'Submissão pelo autor',
    summary: 'Envio, coautoria, versões, comprovantes e acompanhamento pelo autor.',
    scientific: true,
  },
  {
    phase: 6,
    title: 'Avaliação científica',
    summary: 'Distribuição segura, pareceres, conflitos de interesse e rastreabilidade.',
    scientific: true,
  },
  {
    phase: 7,
    title: 'Decisão científica',
    summary: 'Deliberação, comunicação e histórico auditável das decisões.',
    scientific: true,
  },
  {
    phase: 8,
    title: 'Pós-aprovação e ePoster',
    summary: 'Arquivo final, correções, termos, ePoster e materiais aprovados.',
    scientific: true,
  },
  {
    phase: 9,
    title: 'Programação científica definitiva',
    summary: 'Sessões, espaços, horários, apresentadores e prevenção de conflitos.',
    scientific: true,
  },
  {
    phase: 10,
    title: 'Operação do evento',
    summary: 'Credenciamento, check-in, controle de acesso, presença e impressão.',
  },
  {
    phase: 11,
    title: 'Pós-evento',
    summary: 'Certificados, relatórios, anais, estação de ePoster e encerramento.',
  },
] as const;

function registrationFormHref(eventId: string) {
  return `/eventos/${eventId}/painel/inscricoes/ficha`;
}

function registrationCommercialHref(eventId: string) {
  return `/eventos/${eventId}/painel/inscricoes/categorias-lotes`;
}

function registrationBenefitsHref(eventId: string) {
  return `/eventos/${eventId}/painel/inscricoes/beneficios`;
}

function RegistrationFormDashboardAccess({ eventId }: { eventId: string }) {
  const href = registrationFormHref(eventId);
  const commercialHref = registrationCommercialHref(eventId);
  const benefitsHref = registrationBenefitsHref(eventId);

  return (
    <section
      className={styles.card}
      aria-labelledby="registration-form-dashboard-title"
      aria-describedby="registration-form-dashboard-lead"
    >
      <div className={styles.cardHeading}>
        <div>
          <p className={styles.eyebrow}>FICHA DE INSCRIÇÃO</p>
          <h2 id="registration-form-dashboard-title">Ficha de inscrição</h2>
        </div>
      </div>
      <p id="registration-form-dashboard-lead">
        Defina os dados pedidos ao participante. A ficha pode ser preparada sem abrir inscrições ao público.
      </p>
      <div className={styles.actionLinks}>
        <Link className={styles.primaryButton} href={commercialHref}>Categorias e lotes</Link>
        <Link className={styles.secondaryButton} href={href}>Editar ficha</Link>
        <Link className={styles.secondaryButton} href={benefitsHref}>Cupons e convites</Link>
      </div>
    </section>
  );
}

export default function EventAdminDashboard({ eventId, section }: { eventId: string; section: EventAdminSection }) {
  const router = useRouter();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [payload, setPayload] = useState<EventAdminPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavigation, setMobileNavigation] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }

    let active = true;
    api<EventAdminPayload>(`/event-wizard/${eventId}`)
      .then((result) => {
        if (active) setPayload(result);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o painel deste evento.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventId, router]);

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
          <Link
            className={`${styles.navItem} ${section === 'overview' ? styles.navItemActive : ''}`}
            aria-current={section === 'overview' ? 'page' : undefined}
            href={`/eventos/${eventId}/painel`}
            tabIndex={navigationTabIndex}
            onClick={closeMenu}
          >
            <span aria-hidden="true">⌂</span>
            <span><strong>Visão geral</strong><small>Próximos passos e pendências</small></span>
          </Link>
          <span className={styles.navGroupLabel}>Divulgação</span>
          <Link
            className={`${styles.navItem} ${section === 'publication' ? styles.navItemActive : ''}`}
            aria-current={section === 'publication' ? 'page' : undefined}
            href={`/eventos/${eventId}/painel/divulgacao`}
            tabIndex={navigationTabIndex}
            onClick={closeMenu}
          >
            <span aria-hidden="true">◫</span>
            <span><strong>Divulgação</strong><small>Fase 1 · presença pública</small></span>
          </Link>
          <span className={styles.navGroupLabel}>Inscrições e vendas</span>
          <Link className={styles.navItem} href={registrationCommercialHref(eventId)} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">▦</span>
            <span><strong>Categorias e lotes</strong><small>Fase 2 · estrutura comercial</small></span>
          </Link>
          <Link className={styles.navItem} href={registrationFormHref(eventId)} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">▤</span>
            <span><strong>Ficha de inscrição</strong><small>Fase 2 · preparar e testar</small></span>
          </Link>
          <Link className={styles.navItem} href={registrationBenefitsHref(eventId)} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">%</span>
            <span><strong>Cupons e convites</strong><small>Fase 2 · benefícios comerciais</small></span>
          </Link>
          <Link className={styles.navItem} href={`/eventos/${eventId}/painel/inscricoes`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">☷</span>
            <span><strong>Inscrições recebidas</strong><small>Fase 2 · situação e presença</small></span>
          </Link>
          <span className={styles.navGroupLabel}>Operação</span>
          <Link className={styles.navItem} href={`/eventos/${eventId}/painel/check-in`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">▣</span>
            <span><strong>Credenciamento e check-in</strong><small>Leitura de QR · operação</small></span>
          </Link>
          <Link className={styles.navItem} href={`/eventos/${eventId}/painel/show`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">▹</span>
            <span><strong>Acessos e catracas</strong><small>Ingressos, equipe e API</small></span>
          </Link>

          <span className={styles.navGroupLabel}>Conexões</span>
          <Link
            className={`${styles.navItem} ${section === 'integrations' ? styles.navItemActive : ''}`}
            aria-current={section === 'integrations' ? 'page' : undefined}
            href={`/eventos/${eventId}/painel/integracoes`}
            tabIndex={navigationTabIndex}
            onClick={closeMenu}
          >
            <span aria-hidden="true">⬡</span>
            <span><strong>Integrações</strong><small>Catálogo explicativo</small></span>
          </Link>

          {isScientific && <>
            <span className={styles.navGroupLabel}>Conteúdo científico</span>
            <Link className={styles.navItem} href={`/eventos/${eventId}/cientifico`} tabIndex={navigationTabIndex} onClick={closeMenu}>
              <span aria-hidden="true">◇</span>
              <span><strong>Científico</strong><small>Estrutura já construída</small></span>
            </Link>
          </>}
        </nav>

        <div className={styles.sidebarFooter}>
          <span aria-hidden="true">◎</span>
          <p><strong>Ambiente de configuração</strong>Nada é publicado automaticamente.</p>
        </div>
      </aside>

      <main id="event-admin-content" className={styles.content} tabIndex={-1}>
        <div className={styles.breadcrumb} aria-label="Você está em">
          <Link href="/painel">Eventos</Link>
          <span aria-hidden="true">/</span>
          {section === 'overview' ? <strong>{payload.event.name}</strong> : <>
            <Link href={`/eventos/${eventId}/painel`}>{payload.event.name}</Link>
            <span aria-hidden="true">/</span>
            <strong>{section === 'publication' ? 'Divulgação' : 'Integrações'}</strong>
          </>}
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}

        {section === 'overview' ? <>
          <section className={styles.hero} aria-labelledby="overview-title">
            <div>
              <p className={styles.eyebrow}>PAINEL DO EVENTO</p>
              <h1 id="overview-title">Visão geral</h1>
              <p>Escolha uma tarefa para continuar a configuração ou acompanhar a operação.</p>
            </div>
            <Link className={styles.primaryButton} href={`/eventos/${eventId}/painel/divulgacao`}>Editar divulgação</Link>
          </section>

          <section className={styles.metrics} aria-label="Resumo do evento">
            <article><span>Estado</span><strong>{eventStatus}</strong><small>Situação atual do evento</small></article>
            <article><span>Configuração</span><strong>{payload.session.completionPercent}%</strong><small>Dados básicos preenchidos</small></article>
            <article><span>Recursos ativos</span><strong>{capabilities.length}</strong><small>Funções escolhidas para o evento</small></article>
          </section>

          <section className={styles.dashboardSection} aria-labelledby="quick-actions-title">
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>O QUE VOCÊ PODE FAZER</p>
                <h2 id="quick-actions-title">Acessos rápidos</h2>
              </div>
              <span className={styles.safeBadge}>Configuração sem publicação automática</span>
            </div>
            <div className={styles.quickGrid}>
              <article className={styles.card}>
                <p className={styles.eyebrow}>DIVULGAÇÃO</p>
                <h3>Apresentar o evento</h3>
                <p>Revise a página pública, as informações e a identidade visual.</p>
                <Link className={styles.primaryButton} href={`/eventos/${eventId}/painel/divulgacao`}>Abrir divulgação</Link>
              </article>
              <RegistrationFormDashboardAccess eventId={eventId} />
              <article className={styles.card}>
                <p className={styles.eyebrow}>OPERAÇÃO</p>
                <h3>Inscrições e entrada</h3>
                <p>Consulte participantes e registre entradas confirmadas com o QR.</p>
                <div className={styles.actionLinks}>
                  <Link className={styles.primaryButton} href={`/eventos/${eventId}/painel/inscricoes`}>Ver inscrições</Link>
                  <Link className={styles.secondaryButton} href={`/eventos/${eventId}/painel/check-in`}>Abrir check-in</Link>
                  <Link className={styles.secondaryButton} href={`/eventos/${eventId}/painel/show`}>Acessos e catracas</Link>
                </div>
              </article>
            </div>
          </section>

          {payload.answers.registrationMode === 'PAID' && <section className={styles.card} aria-labelledby="financial-responsibility-title">
            <h2 id="financial-responsibility-title">Responsável financeiro</h2>
            <p>Confirme a pessoa ou empresa responsável pelas vendas do evento.</p>
            <Link className={styles.secondaryButton} href={`/eventos/${eventId}/painel/financeiro`}>Revisar responsável</Link>
          </section>}

          <section className={styles.evaCard} aria-labelledby="eva-overview-title">
            <div className={styles.evaMark} aria-hidden="true">EVA</div>
            <div>
              <h2 id="eva-overview-title">Precisa conectar outra ferramenta?</h2>
              <p>Explore as integrações previstas para o evento. O catálogo explica possibilidades e ainda não conecta contas nem envia dados.</p>
              <Link className={styles.journeyAction} href={`/eventos/${eventId}/painel/integracoes`}>Ver catálogo de integrações</Link>
            </div>
          </section>

          <details className={styles.journey}>
            <summary className={styles.journeyHeading}>
              <span className={styles.journeySummaryText}>
                <span className={styles.eyebrow}>JORNADA COMPLETA</span>
                <span className={styles.journeySummaryTitle}>As 11 fases do seu evento</span>
                <span>Abra para consultar a sequência completa e o que já está disponível.</span>
              </span>
              <span className={styles.journeyLegend}>11 etapas</span>
            </summary>

            <ol className={styles.journeyList}>
              {eventJourney.map((item) => {
                const notApplicable = 'scientific' in item && item.scientific === true && !isScientific;
                const current = item.phase === 1;
                const configurationAvailable = item.phase === 2;
                const checkInAvailable = item.phase === 10;
                const state = notApplicable
                  ? 'Não se aplica'
                  : current || configurationAvailable
                    ? 'Configuração disponível'
                    : checkInAvailable
                      ? 'Check-in disponível'
                      : 'Em desenvolvimento';

                return <li
                  key={item.phase}
                  className={`${styles.journeyItem} ${current ? styles.journeyItemCurrent : ''} ${notApplicable ? styles.journeyItemNotApplicable : ''}`}
                >
                  <span className={styles.journeyNumber} aria-hidden="true">{item.phase}</span>
                  <div>
                    <div className={styles.journeyItemHeading}>
                      <h3>{item.title}</h3>
                      <span className={current ? styles.journeyStateCurrent : styles.journeyState}>{state}</span>
                    </div>
                    <p>{item.summary}</p>
                    {configurationAvailable && <Link className={styles.secondaryButton} href={registrationFormHref(eventId)}>Configurar ficha de inscrição</Link>}
                    {checkInAvailable && <Link className={styles.secondaryButton} href={`/eventos/${eventId}/painel/check-in`}>Abrir check-in</Link>}
                  </div>
                </li>;
              })}
            </ol>

            <p className={styles.journeyNote}>A disponibilidade de cada recurso depende da configuração do evento. A publicação e a abertura de inscrições exigem etapas próprias de validação.</p>
          </details>
        </> : section === 'publication'
          ? <PublicationEditor eventId={eventId} embedded supportsScientificSources={isScientific} />
          : <IntegrationsHub eventId={eventId} />}
      </main>
    </div>
  </div>;
}
