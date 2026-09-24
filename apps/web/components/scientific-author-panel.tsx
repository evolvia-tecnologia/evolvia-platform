'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import styles from './participant-area.module.css';

type AuthorArea = {
  available: boolean;
  reason: string | null;
  config: { requireArea: boolean; requireSubarea: boolean; requireAuthorInstitution: boolean; titleMaxLength: number; minKeywords: number; maxKeywords: number; maxSubmissionsPerAuthor: number } | null;
  modalities: { id: string; name: string; description: string | null }[];
  taxonomy: { id: string; name: string; parentId: string | null; level: 'AREA' | 'SUBAREA' }[];
  submissions: { id: string; title: string; status: string; submittedAt: string | null; modality: string; currentVersion: number }[];
};

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
}

export default function ScientificAuthorPanel({ slug, token }: { slug: string; token: string }) {
  const [area, setArea] = useState<AuthorArea | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [modalityId, setModalityId] = useState('');
  const [title, setTitle] = useState('');
  const [abstractText, setAbstractText] = useState('');
  const [keywords, setKeywords] = useState('');
  const [institution, setInstitution] = useState('');
  const [taxonomyAreaId, setTaxonomyAreaId] = useState('');
  const [taxonomySubareaId, setTaxonomySubareaId] = useState('');
  const requestKey = useRef<string | null>(null);
  const url = `/api/public/events/${encodeURIComponent(slug)}/participant/submissions`;

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { cache: 'no-store', headers: { authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async (response) => {
        const payload = await parseResponse(response);
        if (!response.ok) throw new Error(typeof payload.message === 'string' ? payload.message : 'Não foi possível carregar trabalhos.');
        if (!controller.signal.aborted) setArea(payload as unknown as AuthorArea);
      })
      .catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar trabalhos.'); });
    return () => controller.abort();
  }, [url, token]);

  function edited(setter: (value: string) => void, value: string) {
    requestKey.current = null;
    setter(value);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !area?.available) return;
    setBusy(true); setError('');
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'idempotency-key': requestKey.current },
        body: JSON.stringify({
          modalityId, title, abstractText, institution,
          keywords: keywords.split(',').map((word) => word.trim()).filter(Boolean),
          taxonomyAreaId: taxonomyAreaId || null, taxonomySubareaId: taxonomySubareaId || null,
        }),
      });
      const payload = await parseResponse(response);
      if (!response.ok) throw new Error(typeof payload.message === 'string' ? payload.message : 'Não foi possível enviar o trabalho.');
      if (typeof payload.id !== 'string' || typeof payload.status !== 'string') {
        throw new Error('Não foi possível confirmar a resposta do envio. Consulte seus trabalhos antes de tentar novamente.');
      }
      setArea((previous) => previous ? {
        ...previous,
        submissions: previous.submissions.some((item) => item.id === payload.id) ? previous.submissions : [
          { id: payload.id as string, title, status: payload.status as string,
            submittedAt: typeof payload.submittedAt === 'string' ? payload.submittedAt : null,
            modality: previous.modalities.find((item) => item.id === modalityId)?.name ?? '', currentVersion: 1 },
          ...previous.submissions,
        ],
      } : previous);
      requestKey.current = null;
      setModalityId(''); setTitle(''); setAbstractText(''); setKeywords(''); setInstitution('');
      setTaxonomyAreaId(''); setTaxonomySubareaId('');
      try {
        const refreshed = await fetch(url, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } });
        if (!refreshed.ok) throw new Error('Falha ao atualizar a lista.');
        const next = await parseResponse(refreshed);
        if (!Array.isArray(next.submissions)) throw new Error('Resposta de trabalhos inválida.');
        setArea(next as unknown as AuthorArea);
      } catch {
        setError('O trabalho foi recebido. A lista pode estar desatualizada; entre novamente para conferi-la.');
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível enviar o trabalho.'); }
    finally { setBusy(false); }
  }

  const areas = area?.taxonomy.filter((node) => node.level === 'AREA') ?? [];
  const subareas = area?.taxonomy.filter((node) => node.level === 'SUBAREA' && node.parentId === taxonomyAreaId) ?? [];

  return <section className={styles.scientific} aria-labelledby="author-title">
    <h2 id="author-title">Meus trabalhos científicos</h2>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!area && !error && <p>Carregando submissões…</p>}
    {area && <>
      {area.submissions.length > 0 ? <ul className={styles.submissions}>
        {area.submissions.map((item) => <li key={item.id}>
          <strong>{item.title}</strong><span>{item.modality} · {item.status === 'SUBMITTED' ? 'Submetido' : item.status} · versão {item.currentVersion}</span>
        </li>)}
      </ul> : <p>Você ainda não enviou trabalhos neste evento.</p>}
      {!area.available && <p role="status">{area.reason}</p>}
      {area.available && area.config && area.submissions.length >= area.config.maxSubmissionsPerAuthor && <p role="status">Você atingiu o limite de trabalhos deste evento.</p>}
      {area.available && area.config && area.submissions.length < area.config.maxSubmissionsPerAuthor && <form className={styles.form} onSubmit={submit}>
        <h3>Enviar um trabalho</h3>
        <p>O nome do autor vem da sua inscrição. O envio registra a primeira versão do trabalho.</p>
        <label>Modalidade<select required value={modalityId} onChange={(event) => edited(setModalityId, event.target.value)}>
          <option value="">Selecione</option>{area.modalities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>Título<input required minLength={5} maxLength={area.config.titleMaxLength} value={title} onChange={(event) => edited(setTitle, event.target.value)} /></label>
        <label>Resumo<textarea required minLength={30} maxLength={10000} rows={7} value={abstractText} onChange={(event) => edited(setAbstractText, event.target.value)} /></label>
        <label>Palavras-chave (separe por vírgula; {area.config.minKeywords} a {area.config.maxKeywords})
          <input required value={keywords} onChange={(event) => edited(setKeywords, event.target.value)} />
        </label>
        <label>Instituição<input required={area.config.requireAuthorInstitution} minLength={area.config.requireAuthorInstitution ? 2 : undefined} maxLength={160} value={institution} onChange={(event) => edited(setInstitution, event.target.value)} /></label>
        {(area.config.requireArea || areas.length > 0) && <label>Área científica<select required={area.config.requireArea} value={taxonomyAreaId} onChange={(event) => { edited(setTaxonomyAreaId, event.target.value); setTaxonomySubareaId(''); }}>
          <option value="">Selecione</option>{areas.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>}
        {(area.config.requireSubarea || subareas.length > 0) && <label>Subárea científica<select required={area.config.requireSubarea} disabled={!taxonomyAreaId} value={taxonomySubareaId} onChange={(event) => edited(setTaxonomySubareaId, event.target.value)}>
          <option value="">Selecione</option>{subareas.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>}
        <button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Submeter trabalho'}</button>
      </form>}
    </>}
  </section>;
}
