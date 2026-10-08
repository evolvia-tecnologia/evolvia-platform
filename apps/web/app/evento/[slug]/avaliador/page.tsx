'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import PublicSiteHeader from '../../../../components/public-site-header';
import styles from '../../../../components/scientific-reviews.module.css';

type Criterion = { id: string; label: string; required: boolean; minScore: number; maxScore: number };
type Assignment = {
  id: string;
  status: string;
  conflictStatus: string;
  opinion: { recommendation: string | null; overallScore: number | null; authorComment: string; confidentialComment: string; scores: { criterionId: string; value: number }[] } | null;
  revisions: { versionNumber: number; submittedAt: string }[];
  submission: { title: string; abstractText: string | null; authors: string[] };
};
type Area = {
  reviewerName: string;
  coordinatorDecidesStatus: boolean;
  evaluationStyle: 'ANALYTIC' | 'SYNTHETIC';
  criteria: Criterion[];
  assignments: Assignment[];
};

export default function ReviewerPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const storageKey = `evolvia_reviewer_${slug}`;
  const [token, setToken] = useState('');
  const [area, setArea] = useState<Area | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conflicts, setConflicts] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setArea(null); setError(''); setNotice(''); setConflicts({});
    const hash = new URLSearchParams(window.location.hash.replace(/^#/u, '')).get('acesso');
    const saved = hash || window.sessionStorage.getItem(storageKey) || '';
    if (hash) window.sessionStorage.setItem(storageKey, hash);
    if (hash) window.history.replaceState(null, '', window.location.pathname);
    setToken(saved);
  }, [storageKey]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    fetch(`/api/public/events/${encodeURIComponent(slug)}/reviewer`, {
      cache: 'no-store',
      headers: { authorization: `Bearer ${token}` },
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error('Não foi possível abrir a área do avaliador.');
      const payload: unknown = await response.json();
      if (!controller.signal.aborted) setArea(payload as Area);
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Não foi possível abrir a área do avaliador.');
    });
    return () => controller.abort();
  }, [slug, token]);

  async function submit(event: FormEvent<HTMLFormElement>, assignmentId: string) {
    event.preventDefault();
    setError('');
    setNotice('');
    const form = new FormData(event.currentTarget);
    const conflict = form.get('conflict') === 'yes';
    const scores = area?.criteria.flatMap((criterion) => {
      const value = form.get(`score-${criterion.id}`);
      return value === null || value === '' ? [] : [{ criterionId: criterion.id, value: Number(value) }];
    }) ?? [];
    const response = await fetch(`/api/public/events/${encodeURIComponent(slug)}/reviewer/assignments/${encodeURIComponent(assignmentId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        conflictStatus: conflict ? 'CONFLICT' : 'CLEAR',
        conflictReason: String(form.get('reason') ?? ''),
        recommendation: area?.coordinatorDecidesStatus ? null : String(form.get('recommendation') ?? ''),
        authorComment: String(form.get('authorComment') ?? ''),
        confidentialComment: String(form.get('confidentialComment') ?? ''),
        scores: area?.evaluationStyle === 'SYNTHETIC' ? [] : scores,
        overallScore: area?.evaluationStyle === 'SYNTHETIC' ? Number(form.get('overallScore')) : null,
      }),
    });
    const payload: unknown = await response.json().catch(() => ({}));
    const message = payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
      ? payload.message
      : 'Não foi possível enviar o parecer.';
    if (!response.ok) {
      setError(message);
      return;
    }
    setNotice(conflict ? 'Conflito registrado. O parecer não foi enviado.' : 'Parecer enviado.');
    setArea(null);
    const refreshed = await fetch(`/api/public/events/${encodeURIComponent(slug)}/reviewer`, {
      cache: 'no-store',
      headers: { authorization: `Bearer ${token}` },
    });
    if (refreshed.ok) setArea(await refreshed.json() as Area);
  }

  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="evento" />
    <main id="main-content" className={styles.page} tabIndex={-1}>
      <section className={styles.workspace}>
        <div className={styles.card}>
          {slug && <Link href={`/evento/${encodeURIComponent(slug)}`}>← Voltar ao evento</Link>}
          <p className={styles.eyebrow}>ÁREA DO AVALIADOR</p>
          <h1>Área do avaliador</h1>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {notice && <p className={styles.success} role="status">{notice}</p>}
          {!token && <p>Abra o endereço recebido da organização. O acesso não usa senha.</p>}
          {token && !area && !error && <p role="status">Abrindo os trabalhos atribuídos…</p>}
          {area && <p>Olá, {area.reviewerName}. O parecer é seu; a organização não preenche nota nem conflito por você.</p>}
        </div>
        {area && <>
          {area.assignments.map((item) => <article className={styles.card} key={`${item.id}-${item.status}-${item.revisions?.length ?? 0}`}>
            <h2>{item.submission.title}</h2>
            {item.submission.abstractText && <p>{item.submission.abstractText}</p>}
            {item.submission.authors.length > 0 && <p>Autores: {item.submission.authors.join(', ')}</p>}
            {(item.revisions?.length ?? 0) > 0 && <div>
              <p>Versões do parecer</p>
              <ol>{item.revisions.map((revision) => <li key={revision.versionNumber}>Versão {revision.versionNumber} · {new Date(revision.submittedAt).toLocaleString('pt-BR')}</li>)}</ol>
            </div>}
            {item.status === 'SUBMITTED' ? <p>Parecer enviado.</p> : item.conflictStatus === 'CONFLICT' ? <p>Conflito de interesse registrado.</p> : <form className={styles.form} onSubmit={(event) => void submit(event, item.id)}>
              {item.opinion && <p>A banca permanece. As notas da versão anterior continuam neste formulário.</p>}
              <label className={styles.field}>Há conflito de interesse?<select name="conflict" defaultValue="no" onChange={(event) => setConflicts({ ...conflicts, [item.id]: event.target.value === 'yes' })}><option value="no">Não</option><option value="yes">Sim</option></select></label>
              <label className={styles.field}>Se houver conflito, descreva<textarea name="reason" required={conflicts[item.id]} minLength={conflicts[item.id] ? 3 : undefined} maxLength={500} /></label>
              {area.evaluationStyle === 'SYNTHETIC'
                ? <label className={styles.field}>Nota de 0 a 10<input name="overallScore" disabled={conflicts[item.id]} type="number" min={0} max={10} step="0.1" required defaultValue={item.opinion?.overallScore ?? ''} /></label>
                : area.criteria.map((criterion) => <label className={styles.field} key={criterion.id}>{criterion.label} ({criterion.minScore} a {criterion.maxScore})<input name={`score-${criterion.id}`} disabled={conflicts[item.id]} type="number" min={criterion.minScore} max={criterion.maxScore} step="0.1" required={criterion.required} defaultValue={item.opinion?.scores.find((score) => score.criterionId === criterion.id)?.value ?? ''} /></label>)}
              {!area.coordinatorDecidesStatus && <label className={styles.field}>Recomendação<select name="recommendation" disabled={conflicts[item.id]} required defaultValue={item.opinion?.recommendation ?? ''}><option value="">Selecione</option><option value="ACCEPT">Aceitar</option><option value="CHANGES">Alterações</option><option value="REJECT">Recusar</option></select></label>}
              {area.coordinatorDecidesStatus && <p>A decisão de aceite ou recusa fica com o coordenador. Informe a nota.</p>}
              <label className={styles.field}>Comentário ao autor<textarea name="authorComment" maxLength={4000} defaultValue={item.opinion?.authorComment ?? ''} /></label>
              <label className={styles.field}>Comentário à comissão<textarea name="confidentialComment" maxLength={4000} defaultValue={item.opinion?.confidentialComment ?? ''} /></label>
              <button className={styles.primary} type="submit">Enviar parecer</button>
            </form>}
          </article>)}
        </>}
      </section>
    </main>
  </>;
}
