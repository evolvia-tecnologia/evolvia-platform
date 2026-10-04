'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { formatStationTitle, stationCodeLabel, stationLabels, stationLanguage } from '../lib/scientific-station-copy';
import ScientificStationQr from './scientific-station-qr';
import styles from './scientific-station.module.css';

type Field = 'TITLE' | 'AUTHOR' | 'AREA' | 'SUBAREA' | 'INSTITUTION' | 'CODE';
type Work = {
  code: number;
  title: string;
  authors: string[];
  institutions: string[];
  area: string | null;
  subarea: string | null;
  showAbstract: boolean;
  showEposter: boolean;
};
type Payload = { event: { name: string }; total: number; works: Work[] };

const fields: Array<{ value: Field; label: string }> = [
  { value: 'TITLE', label: 'Título' },
  { value: 'AUTHOR', label: 'Autor' },
  { value: 'AREA', label: 'Área' },
  { value: 'SUBAREA', label: 'Subárea' },
  { value: 'INSTITUTION', label: 'Instituição' },
  { value: 'CODE', label: 'Id do resumo' },
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
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Estação científica indisponível.'));
  }, [slug, queryKey]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const search = new URLSearchParams();
    if (text.trim()) { search.set('campo', field); search.set('q', text.trim()); }
    router.push(`/evento/${encodeURIComponent(slug)}/estacao${search.size ? `?${search.toString()}` : ''}`);
  }

  return <main className={styles.page}>
    <section className={styles.workspace}>
      <section className={styles.card}>
        <span className={styles.eyebrow}>ESTAÇÃO CIENTÍFICA</span>
        <h1>{payload?.event.name ?? 'Trabalhos aprovados'}</h1>
        <p>Lista completa em ordem de título. Busque por parte do título, autor, área, subárea, instituição ou id do resumo.</p>
        <form onSubmit={submit}>
          <div className={styles.filters}>
            {fields.map((item) => <label key={item.value}><input type="radio" name="campo" value={item.value} checked={field === item.value} onChange={() => setField(item.value)} /> {item.label}</label>)}
          </div>
          <div className={styles.form}>
            <label className={styles.field}>Texto da busca<input value={text} maxLength={80} onChange={(event) => setText(event.target.value)} /></label>
            <button className={styles.primary} type="submit">Buscar</button>
            <button className={styles.secondary} type="button" onClick={() => router.push(`/evento/${encodeURIComponent(slug)}/estacao`)}>Limpar</button>
          </div>
        </form>
      </section>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {payload && <p className={styles.meta}>{payload.total} trabalho(s) publicado(s){payload.total > payload.works.length ? '. Refine a busca para ver o restante.' : '.'}</p>}
      <div className={styles.list}>
        {payload?.works.map((work) => {
          const downloadPath = `/api/public/events/${encodeURIComponent(slug)}/station/${work.code}/eposter?download=1`;
          const downloadUrl = origin ? `${origin}${downloadPath}` : downloadPath;
          const langSuffix = language === 'pt' ? '' : `?idioma=${language}`;
          return <article className={styles.result} key={work.code}>
            <div className={styles.resultBody}>
              <div>
                <span className={styles.code}>{copy.code}: {stationCodeLabel(work.code)}</span>
                <h2>{formatStationTitle(work.title)}</h2>
                <p>{copy.authors}: {work.authors.join(', ') || copy.missingAuthors}</p>
                <p>{copy.institutions}: {work.institutions.join('; ') || copy.missingInstitutions}</p>
                {work.area && <p>{copy.area}: {work.area}{work.subarea ? ` · ${work.subarea}` : ''}</p>}
              </div>
              {work.showEposter && origin && <div className={styles.qrWrap}>
                <ScientificStationQr value={downloadUrl} label={`${copy.qr} ${stationCodeLabel(work.code)}`} />
                <a className={`${styles.secondary} ${styles.download}`} href={downloadPath}>{copy.download}</a>
              </div>}
            </div>
            <div className={styles.actions}>
              {work.showAbstract && <Link className={styles.primary} href={`/evento/${encodeURIComponent(slug)}/estacao/${work.code}${langSuffix}`}>{copy.item}</Link>}
              {work.showEposter && <Link className={styles.secondary} href={`/evento/${encodeURIComponent(slug)}/estacao/${work.code}/eposter`}>E-poster</Link>}
            </div>
          </article>;
        })}
        {payload && payload.works.length === 0 && <p className={styles.meta}>Nenhum trabalho publicado corresponde a esta busca.</p>}
      </div>
    </section>
  </main>;
}
