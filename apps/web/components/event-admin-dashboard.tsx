'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken } from '../lib/api';
import PublicationEditor from './publication-editor';
import styles from './event-admin-dashboard.module.css';

type EventAdminSection = 'overview' | 'publication';

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

function publicationStatus(status: string): string {
  if (status === 'PUBLISHED') return 'Publicado';
  if (status === 'READY_TO_PUBLISH') return 'Pronto para publicar';
  if (status === 'HOMOLOGATION') return 'Em homologação';
  return 'Em preparação';
}

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
        Preparar e versionar a ficha não abre inscrições ao público. Esta configuração está disponível para todos os perfis de evento.
      </p>
      <Link className={styles.primaryButton} href={href}>Configurar ficha de inscrição</Link>
      <Link className={styles.secondaryButton} href={commercialHref}>Configurar categorias e lotes</Link>
      <Link className={styles.secondaryButton} href={benefitsHref}>Configurar cupons, convites e cortesias</Link>
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

  const foundationChecks = useMemo(() => {
    if (!payload) return [];
    const answers = payload.answers;
    return [
      { label: 'Nome do evento', complete: payload.event.name.trim().length >= 3 },
      { label: 'Formato', complete: Boolean(answers.format) },
      { label: 'Datas', complete: Boolean(answers.startDate) && answers.datesPending !== true },
      {
        label: answers.format === 'ONLINE' ? 'Referência online' : 'Local',
        complete: Boolean(answers.venue) && answers.venuePending !== true,
      },
    ];
  }, [payload]);

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
  const completeCount = foundationChecks.filter((item) => item.complete).length;
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
          <span className={styles.navGroupLabel}>Jornada do evento</span>
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
          <Link className={styles.navItem} href={registrationFormHref(eventId)} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">▤</span>
            <span><strong>Ficha de inscrição</strong><small>Fase 2 · preparar e testar</small></span>
          </Link>
          <Link className={styles.navItem} href={registrationCommercialHref(eventId)} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">▦</span>
            <span><strong>Categorias e lotes</strong><small>Fase 2 · estrutura comercial</small></span>
          </Link>
          <Link className={styles.navItem} href={registrationBenefitsHref(eventId)} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">%</span>
            <span><strong>Cupons e convites</strong><small>Fase 2 · benefícios comerciais</small></span>
          </Link>
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

          <Link className={styles.navItem} href={`/eventos/${eventId}/painel/check-in`} tabIndex={navigationTabIndex} onClick={closeMenu}>
            <span aria-hidden="true">▣</span>
            <span><strong>Credenciamento</strong><small>Operação · QR e check-in</small></span>
          </Link>

          {isScientific && <>
            <span className={styles.navGroupLabel}>Jornadas já existentes</span>
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
          <span>{payload.event.name}</span>
          <span aria-hidden="true">/</span>
          <strong>{section === 'overview' ? 'Visão geral' : 'Divulgação'}</strong>
        </div>

        {error && <div className={styles.error} role="alert">{error}</div>}

        {section === 'overview' ? <>
          <section className={styles.hero} aria-labelledby="overview-title">
            <div>
              <p className={styles.eyebrow}>VISÃO GERAL</p>
              <h1 id="overview-title">Seu evento, organizado pela jornada real</h1>
              <p>Começamos pela divulgação. As próximas áreas entram no menu somente quando a fase correspondente estiver pronta para uso.</p>
            </div>
            <Link className={styles.primaryButton} href={`/eventos/${eventId}/painel/divulgacao`}>Preparar divulgação</Link>
          </section>

          <section className={styles.metrics} aria-label="Resumo do evento">
            <article><span>Status</span><strong>{eventStatus}</strong><small>Estado administrativo atual</small></article>
            <article><span>Fundação</span><strong>{payload.session.completionPercent}%</strong><small>Wizard do evento</small></article>
            <article><span>Recursos</span><strong>{capabilities.length}</strong><small>Capabilities ativadas</small></article>
          </section>

          <section className={styles.evaCard} aria-labelledby="eva-overview-title">
            <div className={styles.evaMark} aria-hidden="true">EVA</div>
            <div>
              <h2 id="eva-overview-title">Orientação para este momento</h2>
              <p>Sua fundação está preservada. O próximo passo cronológico é preparar o que o público verá sobre o evento antes de abrir inscrições, áreas reservadas ou jornadas científicas para participantes.</p>
              <small>A conversa inteligente da EVA será conectada por capability própria; esta orientação não executa nenhuma alteração silenciosa.</small>
            </div>
          </section>

          <RegistrationFormDashboardAccess eventId={eventId} />
          <section className={styles.card} aria-labelledby="check-in-access-title">
            <h2 id="check-in-access-title">Credenciamento do evento</h2>
            <p>Registre a entrada de participantes confirmados usando o QR da área reservada.</p>
            <Link className={styles.primaryButton} href={`/eventos/${eventId}/painel/check-in`}>Abrir check-in</Link>
          </section>

          <section className={styles.nextStep} aria-labelledby="next-step-title">
            <div>
              <p className={styles.eyebrow}>PRÓXIMO PASSO</p>
              <h2 id="next-step-title">1. Divulgação do evento</h2>
              <p>Vamos aproveitar os dados que você já informou e completar apenas o que pertence à presença pública: apresentação, identidade visual, informações úteis, acessibilidade, preview e homologação.</p>
            </div>
            <div className={styles.nextStepStatus}>
              <span>{publicationStatus(payload.event.status)}</span>
              <strong>{completeCount} de {foundationChecks.length}</strong>
              <small>dados básicos já aproveitáveis</small>
            </div>
          </section>

          <section className={styles.journey} aria-labelledby="event-journey-title" aria-describedby="registration-form-dashboard-note">
            <div className={styles.journeyHeading}>
              <div>
                <p className={styles.eyebrow}>JORNADA COMPLETA</p>
                <h2 id="event-journey-title">As 11 fases do seu evento</h2>
                <p>Você enxerga o caminho inteiro desde agora. Somente fases prontas e autorizadas ganham ações; as demais permanecem informativas até o Gate anterior ser aprovado.</p>
              </div>
              <span className={styles.journeyLegend}>1 fase ativa · ficha da Fase 2 em preparação</span>
            </div>

            <ol className={styles.journeyList}>
              {eventJourney.map((item) => {
                const notApplicable = 'scientific' in item && item.scientific === true && !isScientific;
                const current = item.phase === 1;
                const configurationAvailable = item.phase === 2;
                const state = current
                  ? 'Disponível agora'
                  : configurationAvailable
                    ? 'Configuração disponível'
                  : notApplicable
                    ? 'Não se aplica ao perfil atual'
                    : 'Bloqueada pelo Gate anterior';

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
                  </div>
                </li>;
              })}
            </ol>

            <p id="registration-form-dashboard-note" className={styles.journeyNote}>Preparar e versionar a ficha não abre inscrições ao público. Esta configuração está disponível para todos os perfis de evento. A ativação da Fase 2 continuará dependendo de implementação, testes, segurança, acessibilidade e Go/No-Go próprios.</p>
          </section>
        </> : <PublicationEditor eventId={eventId} embedded supportsScientificSources={isScientific} />}
      </main>
    </div>
  </div>;
}
