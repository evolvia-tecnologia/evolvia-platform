'use client';

import { FormEvent, useEffect, useState } from 'react';
import styles from './event-evaluation.module.css';

type Question = { id: string; label: string; kind: 'RATING' | 'TEXT'; required: boolean };
type Questionnaire = { title: string; questions: Question[]; submittedAt: string | null };

export default function EventEvaluationForm(props: { slug: string; token: string }) {
  return <ScopedEventEvaluationForm key={JSON.stringify([props.slug, props.token])} {...props} />;
}

function ScopedEventEvaluationForm({ slug, token }: { slug: string; token: string }) {
  const [data, setData] = useState<Questionnaire | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/evaluation`, { headers: { authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (response.status === 403) { if (active) setUnavailable(true); return null; }
        if (!response.ok) throw new Error('Não foi possível carregar a avaliação.');
        return response.json() as Promise<Questionnaire>;
      })
      .then((payload) => { if (active && payload) setData(payload); })
      .catch(() => { if (active) setStatus('Não foi possível carregar a avaliação agora.'); });
    return () => { active = false; };
  }, [slug, token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setStatus('');
    try {
      const response = await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/evaluation`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'idempotency-key': typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `evaluation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
        },
        body: JSON.stringify(answers),
      });
      let payload: { submittedAt?: string; message?: string } | null = null;
      try { payload = await response.json() as { submittedAt?: string; message?: string } | null; } catch { /* Usar mensagem segura abaixo. */ }
      if (!response.ok) throw new Error(typeof payload?.message === 'string' ? payload.message : 'Não foi possível enviar a avaliação.');
      if (typeof payload?.submittedAt !== 'string' || !Number.isFinite(Date.parse(payload.submittedAt))) {
        throw new Error('Não foi possível confirmar o envio da avaliação. Atualize a página para conferir.');
      }
      const submittedAt = payload.submittedAt;
      setData((current) => current ? { ...current, submittedAt } : current);
      setStatus('Avaliação enviada. Obrigado pela participação.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Não foi possível enviar a avaliação.');
    } finally { setBusy(false); }
  }

  if (unavailable || !data) return status ? <p role="status">{status}</p> : null;
  if (data.submittedAt) return <section className={styles.card} aria-labelledby="evaluation-title">
    <h2 id="evaluation-title">{data.title}</h2>
    <p role="status">Sua avaliação foi enviada em <span suppressHydrationWarning>{new Date(data.submittedAt).toLocaleString('pt-BR')}</span>.</p>
  </section>;

  return <section className={styles.card} aria-labelledby="evaluation-title">
    <h2 id="evaluation-title">{data.title}</h2>
    <p>Conte como foi sua experiência. As respostas ficam restritas a este evento.</p>
    <form onSubmit={submit} className={styles.form}>
      {data.questions.map((question) => <fieldset key={question.id}>
        <legend id={`evaluation-question-${question.id}`}>{question.label}{question.required ? ' *' : ' (opcional)'}</legend>
        {question.kind === 'RATING'
          ? <div className={styles.rating}>{[1, 2, 3, 4, 5].map((value) => <label key={value}><input type="radio" disabled={busy} name={question.id} required={question.required} value={value} checked={answers[question.id] === value} onChange={() => setAnswers((current) => ({ ...current, [question.id]: value }))} />{value}</label>)}</div>
          : <textarea aria-labelledby={`evaluation-question-${question.id}`} disabled={busy} maxLength={1000} required={question.required} value={String(answers[question.id] ?? '')} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} />}
      </fieldset>)}
      <button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar avaliação'}</button>
      {status && <p role="status">{status}</p>}
    </form>
  </section>;
}
