'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { stationCodeLabel, stationLabels, stationLanguage, stationWorkHeading, type StationLanguage } from '../lib/scientific-station-copy';
import ScientificStationBack from './scientific-station-back';
import ScientificStationQr from './scientific-station-qr';
import styles from './scientific-station.module.css';

type Field = 'TITLE' | 'AUTHOR' | 'AREA' | 'SUBAREA' | 'INSTITUTION' | 'CODE';
type Work = {
  code: number;
  formatCode: string | null;
  title: string;
  authors: string[];
  institutions: string[];
  area: string | null;
  subarea: string | null;
  showAbstract: boolean;
  showEposter: boolean;
};
type Payload = { event: { name: string }; total: number; works: Work[] };

const fields: Array<{ value: Field; label: keyof ReturnType<typeof stationLabels> }> = [
  { value: 'TITLE', label: 'fieldTitle' },
  { value: 'AUTHOR', label: 'fieldAuthor' },
  { value: 'AREA', label: 'area' },
  { value: 'SUBAREA', label: 'subarea' },
  { value: 'INSTITUTION', label: 'institution' },
  { value: 'CODE', label: 'fieldCode' },
];

async function readPayload(response: Response): Promise<Payload> {
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Não foi possível carregar a estação científica.');
  const record = value as { error?: { message?: string }; event?: { name?: string }; works?: Work[]; total?: number };
  if (!response.ok) throw new Error(record.error?.message ?? 'Estação científica indisponível.');
  if (!record.event?.name || !Array.isArray(record.works)) throw new Error('Não foi possível carregar a estação científica.');
  return { event: { name: record.event.name }, total: record.total ?? record.works.length, works: record.works };
}

export default function ScientificStationSearch() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = params.slug;
  const [field, setField] = useState<Field>('TITLE');
  const [text, setText] = useState('');
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [origin, setOrigin] = useState('');
  const language = stationLanguage(searchParams.get('idioma'));
  const copy = stationLabels(language);

  const queryKey = searchParams.toString();
  useEffect(() => {
    const query = new URLSearchParams(queryKey);
    const selected = fields.find((item) => item.value === query.get('campo'))?.value ?? 'TITLE';
    const current = query.get('q') ?? '';
    setField(selected);
    setText(current);
    setError('');
    setOrigin(window.location.origin);
    const search = new URLSearchParams();
    if (current) { search.set('field', selected); search.set('q', current); }
    fetch(`/api/public/events/${encodeURIComponent(slug)}/station?${search.toString()}`, { cache: 'no-store' })
      .then(readPayload)
      .then(setPayload)
      .catch((reason) => setError(reason instanceof Error ? reason.message : copy.unavailable));
  }, [slug, queryKey, copy.unavailable]);

  function languageHref(next: StationLanguage) {
    const query = new URLSearchParams(searchParams.toString());
    if (next === 'pt') query.delete('idioma');
    else query.set('idioma', next);
    const suffix = query.size ? `?${query.toString()}` : '';
    return `/evento/${encodeURIComponent(slug)}/estacao${suffix}`;
  }

  function withLanguage(search: URLSearchParams) {
    if (language !== 'pt') search.set('idioma', language);
    const suffix = search.size ? `?${search.toString()}` : '';
    return `/evento/${encodeURIComponent(slug)}/estacao${suffix}`;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const search = new URLSearchParams();
    if (text.trim()) { search.set('campo', field); search.set('q', text.trim()); }
    router.push(withLanguage(search));
  }

  function clearSelection() {
    setField('TITLE');
    setText('');
    router.push(withLanguage(new URLSearchParams()));
  }

  return <main className={styles.page}>
    <section className={styles.workspace}>
      <div className={styles.topbar}>
        <p className={styles.meta}>{copy.book}{payload ? ` — ${payload.event.name}` : ''}</p>
        <div className={styles.topActions}>
          <div className={styles.langs} role="group" aria-label={copy.book}>
            {(['pt', 'es', 'en'] as const).map((item) => <Link className={styles.lang} aria-pressed={language === item} href={languageHref(item)} hrefLang={item} key={item}>{item.toUpperCase()}</Link>)}
          </div>
          <ScientificStationBack fallback={`/evento/${encodeURIComponent(slug)}`} label={copy.back} />
        </div>
      </div>
      <section className={styles.card}>
        <span className={styles.eyebrow}>{copy.station.toLocaleUpperCase(language === 'pt' ? 'pt-BR' : language)}</span>
        <h1>{copy.listTitle}</h1>
        <p>{copy.listHelp}</p>
        <form onSubmit={submit}>
          <div className={styles.filters}>
            {fields.map((item) => <label key={item.value}><input type="radio" name="campo" value={item.value} checked={field === item.value} onChange={() => setField(item.value)} /> {copy[item.label]}</label>)}
            <button className={styles.clear} type="button" onClick={clearSelection}>{copy.clear}</button>
          </div>
          <div className={styles.form}>
            <label className={styles.field}>{copy.fieldQuery}<input value={text} maxLength={80} onChange={(event) => setText(event.target.value)} /></label>
            <button className={styles.primary} type="submit">{copy.search}</button>
          </div>
        </form>
      </section>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {payload && <p className={styles.meta}>
        {payload.total} {payload.total === 1 ? copy.publishedOne : copy.publishedMany}.
        {payload.total > payload.works.length ? ` ${copy.refine}` : ''}
      </p>}
      <div className={styles.list}>
        {payload?.works.map((work) => {
          const downloadPath = `/api/public/events/${encodeURIComponent(slug)}/station/${work.code}/eposter?download=1`;
          const downloadUrl = origin ? `${origin}${downloadPath}` : downloadPath;
          const langSuffix = language === 'pt' ? '' : `?idioma=${language}`;
          return <article className={styles.result} key={work.code}>
            <div className={styles.resultBody}>
              <div>
                <h2><span className={styles.mark} aria-hidden="true" />{stationWorkHeading(work.code, work.formatCode, work.title)}</h2>
                <p><strong>{copy.authorLine}:</strong> {work.authors.join(', ') || copy.missingAuthors}</p>
                <p><strong>{copy.institution}:</strong> {work.institutions.join('; ') || copy.missingInstitutions}</p>
                {work.area && <p><strong>{copy.area}:</strong> {work.area}</p>}
                {work.subarea && <p><strong>{copy.subarea}:</strong> {work.subarea}</p>}
              </div>
              {work.showEposter && origin && <div className={styles.qrWrap}>
                <ScientificStationQr value={downloadUrl} label={`${copy.qr} ${stationCodeLabel(work.code)}`} />
                <a className={`${styles.secondary} ${styles.download}`} href={downloadPath}>{copy.download}</a>
              </div>}
            </div>
            <div className={styles.actions}>
              {work.showAbstract && <Link className={styles.primary} href={`/evento/${encodeURIComponent(slug)}/estacao/${work.code}${langSuffix}`}>{copy.item}</Link>}
              {work.showEposter && <Link className={styles.secondary} href={`/evento/${encodeURIComponent(slug)}/estacao/${work.code}/eposter`}>{copy.eposter}</Link>}
            </div>
          </article>;
        })}
        {payload && payload.works.length === 0 && <p className={styles.meta}>{copy.noResults}</p>}
      </div>
    </section>
  </main>;
}
