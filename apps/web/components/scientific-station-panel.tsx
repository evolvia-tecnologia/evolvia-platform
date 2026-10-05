'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import styles from './scientific-submissions.module.css';

type Work = {
  id: string;
  code: number | null;
  title: string;
  authors: string[];
  showAbstract: boolean;
  showEposter: boolean;
  hasEposter: boolean;
};
type Station = {
  event: { slug: string; status: string };
  path: string;
  works: Work[];
};

export default function ScientificStationPanel({ eventId }: { eventId: string }) {
  const [station, setStation] = useState<Station | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState('');
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    api<Station>(`/scientific-events/${eventId}/station`).then(setStation).catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a estação científica.');
    });
  }, [eventId]);

  async function save(work: Work, showAbstract: boolean, showEposter: boolean) {
    setSaving(work.id); setError(''); setNotice('');
    try {
      setStation(await api<Station>(`/scientific-events/${eventId}/station/works/${encodeURIComponent(work.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ showAbstract, showEposter }),
      }));
      setNotice('Publicação da estação atualizada.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar a estação.');
    } finally { setSaving(''); }
  }

  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); setNotice('Link da estação copiado.'); setError(''); }
    catch { setNotice('Selecione o endereço exibido e copie.'); }
  }

  if (!station && !error) return null;
  const url = station ? `${origin}${station.path}` : '';
  return <section className={`${styles.card} ${styles.cardWide}`} id="estacao">
    <span className={styles.eyebrow}>ESTAÇÃO CIENTÍFICA</span>
    <h2>Anais e sessão e-poster</h2>
    <p>Os trabalhos aprovados entram nesta publicação quando você libera o resumo, o e-poster ou os dois. O mesmo link pode ser aberto no totem.</p>
    {station && <>
      <label className={styles.field}>Link da estação científica<input readOnly value={url} /></label>
      <div className={styles.inlineForm}>
        <button className={styles.primary} type="button" disabled={Boolean(saving)} onClick={() => void copy(url)}>Copiar link</button>
        {station.event.status === 'PUBLISHED' ? <a className={styles.secondary} href={station.path} target="_blank" rel="noopener noreferrer">Abrir estação</a> : <span>O link público abre quando o evento estiver publicado.</span>}
      </div>
      {station.works.length === 0 && <p>Ainda não há trabalho aprovado para publicar.</p>}
      <ul className={styles.formatList}>{station.works.map((work) => <li key={work.id}>
        <strong>{work.code ? `Id ${work.code} · ` : ''}{work.title}</strong>
        <span>{work.authors.join(', ')}</span>
        <label><input type="checkbox" checked={work.showAbstract} disabled={Boolean(saving)} onChange={(event) => void save(work, event.target.checked, work.showEposter)} /> Resumo</label>
        <label><input type="checkbox" checked={work.showEposter} disabled={Boolean(saving) || !work.hasEposter} onChange={(event) => void save(work, work.showAbstract, event.target.checked)} /> E-poster</label>
        {!work.hasEposter && <span>O e-poster aparece aqui depois que o autor envia o PDF.</span>}
      </li>)}</ul>
    </>}
    {notice && <p role="status">{notice}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}
