'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import PublicEventCard, { type PublicEventCardItem } from './public-event-card';
import styles from './public-events-preview.module.css';

type PublicEventItem = PublicEventCardItem;

type PreviewState =
  | { status: 'loading' }
  | { status: 'ready'; events: PublicEventItem[] }
  | { status: 'error' };

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
    const params = new URLSearchParams({
      page: '1',
      pageSize: '6',
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
          <p>Encontre seu próximo evento. Explore experiências, confira as datas e conheça os detalhes.</p>
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
        <strong>Nenhum evento publicado foi encontrado agora.</strong>
        <span>Enquanto isso, conheça a Evolvia ou comece a organizar o seu evento.</span>
      </div>}

      {state.status === 'ready' && state.events.length > 0 && <div className={styles.grid}>
        {state.events.map((event) => <PublicEventCard key={event.slug} event={event} inProgress={isInProgress(event)} />)}
      </div>}
    </div>
  </section>;
}
