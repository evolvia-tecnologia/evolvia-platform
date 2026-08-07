'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';
import EventWizard from './event-wizard';

type WizardRouteProbe = {
  event: { profileCode?: string | null };
  session: { status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED' };
};

export default function EventConfigurationRouter({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function probe() {
      try {
        const payload = await api<WizardRouteProbe>(`/event-wizard/${eventId}`);
        if (!active) return;
        if (payload.event.profileCode === 'SCIENTIFIC_EVENT' && payload.session.status === 'COMPLETED') {
          router.replace(`/eventos/${eventId}/cientifico`);
          return;
        }
        setReady(true);
      } catch (reason) {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a configuração do evento.');
        setReady(true);
      }
    }

    probe();
    timer = setInterval(probe, 1500);

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [eventId, router]);

  if (!ready) {
    return <main className="shell"><div className="loading-screen"><div className="loading-mark">E</div><p>A EVA está abrindo a configuração do evento...</p></div></main>;
  }

  if (error) {
    return <main className="shell"><section className="container wizard-page"><div className="error">{error}</div></section></main>;
  }

  return <EventWizard eventId={eventId} />;
}
