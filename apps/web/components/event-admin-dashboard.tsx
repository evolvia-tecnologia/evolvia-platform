'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken } from '../lib/api';
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

const formatLabels: Record<string, string> = {
  IN_PERSON: 'Presencial',
  ONLINE: 'Online',
  HYBRID: 'Híbrido',
};

function formatDate(value?: string | null): string {
  if (!value) return 'A definir';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'A definir';
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function publicationStatus(status: string): string {
  if (status === 'PUBLISHED') return 'Publicado';
  if (status === 'READY_TO_PUBLISH') return 'Pronto para publicar';
  if (status === 'HOMOLOGATION') return 'Em homologação';
  return 'Em preparação';
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
        </> : <>
          <section className={styles.hero} aria-labelledby="publication-title">
            <div>
              <p className={styles.eyebrow}>FASE 1 · DIVULGAÇÃO</p>
              <h1 id="publication-title">Prepare a presença pública do evento</h1>
              <p>Esta primeira tela confirma o que já existe no evento antes de adicionarmos conteúdo editorial. Nada aqui cria um cadastro paralelo.</p>
            </div>
            <span className={styles.phaseBadge}>{publicationStatus(payload.event.status)}</span>
          </section>

          <div className={styles.twoColumns}>
            <section className={styles.card} aria-labelledby="base-data-title">
              <div className={styles.cardHeading}>
                <div><p className={styles.eyebrow}>REAPROVEITAMENTO</p><h2 id="base-data-title">Dados básicos do evento</h2></div>
                <strong>{completeCount}/{foundationChecks.length}</strong>
              </div>
              <dl className={styles.dataList}>
                <div><dt>Nome público base</dt><dd>{payload.event.name}</dd></div>
                <div><dt>URL base</dt><dd>/{payload.event.slug}</dd></div>
                <div><dt>Formato</dt><dd>{formatLabels[payload.answers.format ?? ''] ?? 'A definir'}</dd></div>
                <div><dt>Datas</dt><dd>{payload.answers.datesPending ? 'A definir' : `${formatDate(payload.answers.startDate)}${payload.answers.endDate ? ` a ${formatDate(payload.answers.endDate)}` : ''}`}</dd></div>
                <div><dt>{payload.answers.format === 'ONLINE' ? 'Referência online' : 'Local'}</dt><dd>{payload.answers.venuePending ? 'A definir' : payload.answers.venue || 'A definir'}</dd></div>
              </dl>
            </section>

            <section className={styles.card} aria-labelledby="checks-title">
              <div className={styles.cardHeading}><div><p className={styles.eyebrow}>FUNDAÇÃO</p><h2 id="checks-title">O que já pode ser aproveitado</h2></div></div>
              <ul className={styles.checkList}>
                {foundationChecks.map((item) => <li key={item.label} className={item.complete ? styles.checkComplete : styles.checkPending}>
                  <span aria-hidden="true">{item.complete ? '✓' : '!'}</span>
                  <div><strong>{item.label}</strong><small>{item.complete ? 'Informação disponível' : 'Precisa ser concluída antes do Go/No-Go'}</small></div>
                </li>)}
              </ul>
            </section>
          </div>

          <section className={styles.card} aria-labelledby="editorial-next-title">
            <div className={styles.cardHeading}>
              <div><p className={styles.eyebrow}>PRÓXIMO LOTE</p><h2 id="editorial-next-title">Conteúdo que será configurado na Divulgação</h2></div>
              <span className={styles.safeBadge}>Sem publicação automática</span>
            </div>
            <div className={styles.topicGrid}>
              <div><strong>Identidade e apresentação</strong><p>Logo, capa, descrição e identidade visual com validação de contraste.</p></div>
              <div><strong>Informações ao público</strong><p>Datas importantes, local, contatos, documentos e acessibilidade oferecida pelo evento.</p></div>
              <div><strong>Conteúdo conectado</strong><p>Palestrantes e programação serão referenciados das entidades canônicas quando estiverem liberados.</p></div>
              <div><strong>Preview e Go/No-Go</strong><p>Pré-visualização fiel, checklist, homologação e publicação somente com confirmação autorizada.</p></div>
            </div>
          </section>

          <section className={styles.evaCard} aria-labelledby="eva-publication-title">
            <div className={styles.evaMark} aria-hidden="true">EVA</div>
            <div>
              <h2 id="eva-publication-title">A EVA vai orientar a Divulgação sem tomar o controle</h2>
              <p>Nesta fase ela poderá apontar o que falta, explicar cada configuração e preparar sugestões. Publicar continuará sendo uma ação explícita do organizador autorizado.</p>
            </div>
          </section>
        </>}
      </main>
    </div>
  </div>;
}