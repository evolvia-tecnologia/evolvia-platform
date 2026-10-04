'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import styles from './scientific-station.module.css';

type Work = {
  code: number;
  title: string;
  authors: string[];
  institutions: string[];
  area: string | null;
  subarea: string | null;
  abstractText: string | null;
  keywords: string[];
  showAbstract: boolean;
  showEposter: boolean;
};

export default function ScientificStationAbstract() {
  const params = useParams<{ slug: string; code: string }>();
  const { slug, code } = params;
  const [eventName, setEventName] = useState('');
  const [work, setWork] = useState<Work | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/public/events/${encodeURIComponent(slug)}/station/${encodeURIComponent(code)}`, { cache: 'no-store' })
      .then(async (response) => {
        const value: unknown = await response.json();
        const record = value && typeof value === 'object' && !Array.isArray(value) ? value as { error?: { message?: string }; event?: { name?: string }; work?: Work } : {};
        if (!response.ok || !record.work?.showAbstract) throw new Error(record.error?.message ?? 'Resumo indisponível.');
        setEventName(record.event?.name ?? '');
        setWork(record.work);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Resumo indisponível.'));
  }, [slug, code]);

  return <main className={styles.page}>
    <section className={styles.workspace}>
      <Link className={styles.back} href={`/evento/${encodeURIComponent(slug)}/estacao`}>Voltar à estação científica</Link>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {work && <article className={styles.article}>
        <span className={styles.eyebrow}>{eventName} · ID {work.code}</span>
        <h1>{work.title}</h1>
        <p className={styles.meta}>Autor(es): {work.authors.join(', ')}</p>
        {work.institutions.length > 0 && <p className={styles.meta}>Instituição: {work.institutions.join('; ')}</p>}
        {work.area && <p className={styles.meta}>Área: {work.area}{work.subarea ? ` · Subárea: ${work.subarea}` : ''}</p>}
        <p>{work.abstractText || 'Este trabalho não tem resumo digitado.'}</p>
        {work.keywords.length > 0 && <p className={styles.meta}>Palavras-chave: {work.keywords.join(', ')}</p>}
        {work.showEposter && <div className={styles.actions}><Link className={styles.primary} href={`/evento/${encodeURIComponent(slug)}/estacao/${work.code}/eposter`}>E-poster</Link></div>}
      </article>}
    </section>
  </main>;
}
