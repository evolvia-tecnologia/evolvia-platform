'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { abstractParagraphs, formatStationTitle, stationCodeLabel, stationLabels, stationLanguage, type StationLanguage } from '../lib/scientific-station-copy';
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

const languages: StationLanguage[] = ['pt', 'es', 'en'];

export default function ScientificStationAbstract() {
  const params = useParams<{ slug: string; code: string }>();
  const searchParams = useSearchParams();
  const { slug, code } = params;
  const language = stationLanguage(searchParams.get('idioma'));
  const copy = stationLabels(language);
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

  function href(next: StationLanguage) {
    const query = new URLSearchParams(searchParams.toString());
    if (next === 'pt') query.delete('idioma');
    else query.set('idioma', next);
    const suffix = query.size ? `?${query.toString()}` : '';
    return `/evento/${encodeURIComponent(slug)}/estacao/${encodeURIComponent(code)}${suffix}`;
  }

  const paragraphs = work ? abstractParagraphs(work.abstractText || copy.missingAbstract) : [];

  return <main className={styles.page}>
    <section className={styles.workspace}>
      <div className={styles.crumb}>
        <p className={styles.meta}>{copy.book} / {copy.item}</p>
        <div className={styles.langs} role="group" aria-label={copy.book}>
          {languages.map((item) => <Link className={styles.lang} aria-pressed={language === item} href={href(item)} hrefLang={item} key={item}>{item.toUpperCase()}</Link>)}
        </div>
      </div>
      <Link className={styles.back} href={`/evento/${encodeURIComponent(slug)}/estacao${language === 'pt' ? '' : `?idioma=${language}`}`}>{copy.back}</Link>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {work && <article className={styles.article}>
        <div className={styles.banner}>
          <strong>{eventName}</strong>
          <span>{copy.code}: {stationCodeLabel(work.code)}</span>
        </div>
        <h1>{stationCodeLabel(work.code)} — {formatStationTitle(work.title)}</h1>
        <div className={styles.sheet}>
          <div className={styles.sheetRow}><strong>{copy.authors}:</strong><p>{work.authors.join(', ') || copy.missingAuthors}</p></div>
          <div className={styles.sheetRow}><strong>{copy.institutions}:</strong><p>{work.institutions.join('; ') || copy.missingInstitutions}</p></div>
          {(work.area || work.subarea) && <div className={styles.sheetRow}><strong>{copy.area}:</strong><p>{[work.area, work.subarea].filter(Boolean).join(' · ')}</p></div>}
        </div>
        <div className={styles.abstractBody}>
          <strong>{copy.abstract}:</strong>
          {paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>)}
        </div>
        <p className={styles.keywords}><strong>{copy.keywords}:</strong> {work.keywords.join(', ') || copy.missingKeywords}</p>
        {work.showEposter && <div className={styles.actions}><Link className={styles.primary} href={`/evento/${encodeURIComponent(slug)}/estacao/${work.code}/eposter`}>E-poster</Link></div>}
      </article>}
    </section>
  </main>;
}
