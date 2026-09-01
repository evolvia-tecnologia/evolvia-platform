'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  DISCOVERY_CALENDAR_TIME_ZONE,
  formatCalendarDateKey,
  formatEventDate,
} from '../lib/event-time-zone';
import {
  formatEstimatedAudience,
  publicEventTypeLabel,
  type PublicEventProfileCode,
} from '../lib/public-event-profile';
import styles from './public-events-preview.module.css';

type PublicEventItem = {
  name: string;
  slug: string;
  eventType: string;
  profileCode: PublicEventProfileCode | null;
  estimatedAudience: number | null;
  format: 'IN_PERSON' | 'ONLINE' | 'HYBRID';
  startDate: string | null;
  endDate: string | null;
  timeZone: string | null;
  venue: string | null;
  shortDescription: string | null;
};

type PreviewState =
  | { status: 'loading' }
  | { status: 'ready'; events: PublicEventItem[] }
  | { status: 'error' };

function formatLabel(format: PublicEventItem['format']): string {
  if (format === 'ONLINE') return 'Online';
  if (format === 'HYBRID') return 'Híbrido';
  return 'Presencial';
}

function isInProgress(event: PublicEventItem): boolean {
  if (!event.startDate || !event.endDate) return false;
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  const now = new Date();
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= now && end >= now;
}

export default function PublicEventsPreview() {
  const [state, setState] = useState<PreviewState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    const today = formatCalendarDateKey(new Date(), DISCOVERY_CALENDAR_TIME_ZONE)
      ?? new Date().toISOString().slice(0, 10);
    const params = new URLSearchParams({
      from: today,
      page: '1',
      pageSize: '3',
    });

    fetch('/api/public/events?' + params.toString(), {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('public-events-unavailable');
        const payload = await response.json() as { items?: unknown };
        if (!Array.isArray(payload.items)) throw new Error('public-events-invalid');
        setState({ status: 'ready', events: (payload.items as PublicEventItem[]).slice(0, 3) });
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setState({ status: 'error' });
      });

    return () => controller.abort();
  }, []);

  return <section className={styles.section} aria-labelledby="public-events-title" aria-busy={state.status === 'loading'}>
    <div className={styles.inner}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>EVENTOS NA EVOLVIA</p>
          <h2 id="public-events-title">Descubra o que está acontecendo</h2>
          <p>Veja eventos publicados, em andamento ou com data futura.</p>
        </div>
        <Link className={styles.catalogLink} href="/eventos">Explorar todos os eventos</Link>
      </div>

      {state.status === 'loading' && <div className={styles.status} role="status">
        <strong>Buscando eventos publicados…</strong>
        <span>Esta atualização não interrompe sua navegação.</span>
      </div>}

      {state.status === 'error' && <div className={styles.status} role="status">
        <strong>A vitrine está temporariamente indisponível.</strong>
        <span>Você ainda pode abrir o catálogo completo e tentar novamente.</span>
        <Link href="/eventos">Abrir catálogo de eventos</Link>
      </div>}

      {state.status === 'ready' && state.events.length === 0 && <div className={styles.status} role="status">
        <strong>Novos eventos aparecerão aqui quando forem publicados.</strong>
        <span>Enquanto isso, conheça a Evolvia ou comece a organizar o seu evento.</span>
      </div>}

      {state.status === 'ready' && state.events.length > 0 && <div className={styles.grid}>
        {state.events.map((event) => {
          const startsAt = formatEventDate(event.startDate, event.timeZone, { dateStyle: 'medium' });
          return <article className={styles.card} key={event.slug}>
            <div className={styles.meta}>
              {isInProgress(event) && <span className={styles.live}>Em andamento</span>}
              <span>{publicEventTypeLabel(event.eventType, event.profileCode)}</span>
              <span>{formatLabel(event.format)}</span>
              {startsAt && <span>{startsAt}</span>}
            </div>
            <h3><Link href={'/evento/' + encodeURIComponent(event.slug)}>{event.name}</Link></h3>
            {event.shortDescription && <p>{event.shortDescription}</p>}
            {formatEstimatedAudience(event.estimatedAudience) && <p className={styles.venue}>
              Público estimado: {formatEstimatedAudience(event.estimatedAudience)} pessoas
            </p>}
            {event.venue && <p className={styles.venue}>{event.venue}</p>}
            <Link
              className={styles.cardAction}
              href={'/evento/' + encodeURIComponent(event.slug)}
              aria-label={'Ver informações de ' + event.name}
            >
              Ver informações
            </Link>
          </article>;
        })}
      </div>}
    </div>
  </section>;
}
