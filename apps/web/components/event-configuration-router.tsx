'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError, api, getToken } from '../lib/api';
import EventWizard from './event-wizard';

type WizardSessionStatus = 'ACTIVE' | 'COMPLETED' | 'ABANDONED';

type WizardRouteProbe = {
  event: { profileCode?: string | null };
  session: { status: WizardSessionStatus };
};

const PUBLIC_CONFIGURATION_ERROR = 'Não foi possível abrir a configuração do evento.';

function registrationFormHref(eventId: string) {
  return `/eventos/${eventId}/painel/inscricoes/ficha`;
}

function registrationCommercialHref(eventId: string) {
  return `/eventos/${eventId}/painel/inscricoes/categorias-lotes`;
}

function RegistrationSetupAccess({
  eventId,
  variant,
  onReviewFoundation,
}: {
  eventId: string;
  variant: 'landing' | 'banner';
  onReviewFoundation?: () => void;
}) {
  const commercialHref = registrationCommercialHref(eventId);
  const formHref = registrationFormHref(eventId);

  if (variant === 'landing') {
    return (
      <main className="shell">
        <header className="topbar">
          <Link className="brand" href="/painel">EVOLVIA</Link>
        </header>
        <section className="container completion-page" aria-labelledby="registration-setup-title" aria-describedby="registration-setup-lead">
          <div className="completion-card">
            <p className="eyebrow">CONFIGURAÇÃO DO EVENTO</p>
            <h1 id="registration-setup-title">Próximos passos</h1>
            <p id="registration-setup-lead" className="completion-lead">
              A fundação do evento foi salva. Defina primeiro as categorias e os lotes; depois adapte a ficha para os públicos selecionados. Nada será publicado automaticamente.
            </p>
            <div className="completion-actions">
              <Link className="btn btn-primary" href={commercialHref}>Configurar categorias e lotes</Link>
              <Link className="btn btn-secondary" href={formHref}>Preparar ficha de inscrição</Link>
              <Link className="btn btn-secondary" href={`/eventos/${eventId}/painel`}>Abrir painel do evento</Link>
              {onReviewFoundation ? (
                <button type="button" className="btn btn-secondary" onClick={onReviewFoundation}>
                  Revisar fundação
                </button>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <aside className="container" aria-labelledby="registration-setup-banner-title" aria-describedby="registration-setup-banner-lead">
      <div className="recommendation-banner">
        <div>
          <span className="eva-mini">EVA</span>
          <strong id="registration-setup-banner-title">Próximos passos da inscrição</strong>
          <p id="registration-setup-banner-lead">Comece pelas categorias e lotes. Depois prepare a ficha, sem abrir inscrições ao público.</p>
        </div>
        <Link className="btn btn-secondary btn-small" href={commercialHref}>Configurar categorias e lotes</Link>
      </div>
    </aside>
  );
}

export default function EventConfigurationRouter({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [sessionStatus, setSessionStatus] = useState<WizardSessionStatus | ''>('');
  const [reviewFoundation, setReviewFoundation] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }

    let active = true;
    let inFlight = false;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    function stopPolling() {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    async function probe() {
      if (!active || stopped || inFlight) return;
      inFlight = true;
      try {
        const payload = await api<WizardRouteProbe>(`/event-wizard/${eventId}`);
        if (!active) return;
        if (payload.event.profileCode === 'SCIENTIFIC_EVENT' && payload.session.status === 'COMPLETED') {
          stopPolling();
          router.replace(`/eventos/${eventId}/painel`);
          return;
        }
        setSessionStatus(payload.session.status);
        setReady(true);
        if (payload.session.status === 'COMPLETED') {
          stopPolling();
        }
      } catch (caught) {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 401) {
          stopPolling();
          router.replace('/login');
          return;
        }
        const reason = new Error(PUBLIC_CONFIGURATION_ERROR);
        setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a configuração do evento.');
        setReady(true);
        stopPolling();
      } finally {
        inFlight = false;
      }
    }

    timer = setInterval(probe, 1500);
    probe();

    return () => {
      active = false;
      stopPolling();
    };
  }, [eventId, router]);

  if (!ready) {
    return <main className="shell"><div className="loading-screen"><div className="loading-mark">E</div><p>A EVA está abrindo a configuração do evento...</p></div></main>;
  }

  if (error) {
    return <main className="shell"><section className="container wizard-page"><div className="error">{error}</div></section></main>;
  }

  if (sessionStatus === 'COMPLETED' && !reviewFoundation) {
    return (
      <RegistrationSetupAccess
        eventId={eventId}
        variant="landing"
        onReviewFoundation={() => setReviewFoundation(true)}
      />
    );
  }

  return (
    <>
      {sessionStatus === 'COMPLETED' ? <RegistrationSetupAccess eventId={eventId} variant="banner" /> : null}
      <EventWizard eventId={eventId} />
    </>
  );
}
