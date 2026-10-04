'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { stationLabels } from '../lib/scientific-station-copy';
import ScientificStationBack from './scientific-station-back';
import styles from './scientific-station.module.css';

export default function ScientificStationEposter() {
  const params = useParams<{ slug: string; code: string }>();
  const { slug, code } = params;
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const file = `/api/public/events/${encodeURIComponent(slug)}/station/${encodeURIComponent(code)}/eposter`;

  useEffect(() => {
    fetch(`/api/public/events/${encodeURIComponent(slug)}/station/${encodeURIComponent(code)}`, { cache: 'no-store' })
      .then(async (response) => {
        const value: unknown = await response.json();
        const record = value && typeof value === 'object' && !Array.isArray(value) ? value as { error?: { message?: string }; work?: { title?: string; showEposter?: boolean } } : {};
        if (!response.ok || !record.work?.showEposter) throw new Error(record.error?.message ?? 'E-poster indisponível.');
        setTitle(record.work.title ?? 'E-poster');
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'E-poster indisponível.'));
  }, [slug, code]);

  return <main className={styles.page}>
    <section className={styles.workspace}>
      <div className={styles.topbar}>
        <p className={styles.meta}>{title || 'E-poster'}</p>
        <ScientificStationBack fallback={`/evento/${encodeURIComponent(slug)}/estacao`} label={stationLabels('pt').back} />
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {title && <article className={styles.article}>
        <h1>{title}</h1>
        <div className={styles.actions}><a className={styles.primary} href={file} target="_blank" rel="noopener noreferrer">Abrir o e-poster</a></div>
        <object className={styles.viewer} data={file} type="application/pdf" aria-label={`E-poster: ${title}`}>
          <a href={file}>Abrir o e-poster</a>
        </object>
      </article>}
    </section>
  </main>;
}
