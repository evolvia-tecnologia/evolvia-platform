'use client';

import { useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './event-evaluation.module.css';

type Question = { id: string; label: string; kind: 'RATING' | 'TEXT'; required: boolean };
type Management = {
  event: { id: string; name: string };
  config: { active: boolean; title: string; questions: Question[]; revision: number } | null;
  responseCount: number;
};
type Responses = { title: string | null; questions: Question[]; rows: { id: string; answers: Record<string, number | string>; submittedAt: string }[] };

const initialQuestions: Question[] = [
  { id: 'nota_geral', label: 'Qual sua nota geral para o evento?', kind: 'RATING', required: true },
  { id: 'comentario', label: 'O que podemos melhorar?', kind: 'TEXT', required: false },
];

export default function EventEvaluationAdmin({ eventId }: { eventId: string }) {
  const [management, setManagement] = useState<Management | null>(null);
  const [active, setActive] = useState(false);
  const [title, setTitle] = useState('Avaliação do evento');
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getToken()) return;
    api<Management>(`/events/${eventId}/evaluation`).then((result) => {
      setManagement(result);
      if (result.config) {
        setActive(result.config.active); setTitle(result.config.title); setQuestions(result.config.questions);
      }
    }).catch(() => setStatus('Não foi possível carregar a avaliação.'));
  }, [eventId]);

  function update(index: number, patch: Partial<Question>) {
    setQuestions((current) => current.map((question, currentIndex) => currentIndex === index ? { ...question, ...patch } : question));
  }

  async function save() {
    setBusy(true); setStatus('');
    try {
      const result = await api<Management>(`/events/${eventId}/evaluation`, {
        method: 'PUT',
        body: JSON.stringify({ active, title, questions }),
      });
      setManagement(result); setStatus('Configuração salva.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }

  async function exportCsv() {
    try {
      const result = await api<Responses>(`/events/${eventId}/evaluation/responses`);
      const columns = ['enviada_em', ...result.questions.map((question) => question.id)];
      const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
      const csv = [columns.map(quote).join(','), ...result.rows.map((row) => [row.submittedAt, ...result.questions.map((question) => row.answers[question.id] ?? '')].map(quote).join(','))].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `avaliacao-${eventId}.csv`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setStatus('Não foi possível exportar as respostas.'); }
  }

  return <main className={styles.page}>
    <section className={styles.card} aria-labelledby="evaluation-admin-title">
      <p className={styles.eyebrow}>GATE 11 · PÓS-EVENTO</p>
      <h1 id="evaluation-admin-title">{management?.event.name ?? 'Avaliação do evento'}</h1>
      <p>Publique um questionário curto. A pessoa responde na área reservada depois de ter a inscrição confirmada.</p>
      <label className={styles.toggle}><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Avaliação aberta</label>
      <label>Título<input minLength={2} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <div className={styles.questions}>{questions.map((question, index) => <fieldset key={question.id}>
        <legend>Pergunta {index + 1}</legend>
        <label>Texto<input maxLength={160} value={question.label} onChange={(event) => update(index, { label: event.target.value })} /></label>
        <label>Tipo<select value={question.kind} onChange={(event) => update(index, { kind: event.target.value as Question['kind'] })}><option value="RATING">Nota de 1 a 5</option><option value="TEXT">Texto</option></select></label>
        <label className={styles.toggle}><input type="checkbox" checked={question.required} onChange={(event) => update(index, { required: event.target.checked })} /> Obrigatória</label>
        <button type="button" disabled={questions.length === 1} onClick={() => setQuestions((current) => current.filter((_, i) => i !== index))}>Remover</button>
      </fieldset>)}</div>
      <div className={styles.actions}>
        <button type="button" disabled={questions.length >= 20} onClick={() => setQuestions((current) => [...current, { id: `pergunta_${Date.now()}`, label: 'Nova pergunta', kind: 'TEXT', required: false }])}>Adicionar pergunta</button>
        <button type="button" disabled={busy} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar configuração'}</button>
        <button type="button" disabled={!management?.responseCount} onClick={() => void exportCsv()}>Exportar {management?.responseCount ?? 0} respostas</button>
      </div>
      {status && <p role="status">{status}</p>}
    </section>
  </main>;
}
