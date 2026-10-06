'use client';

import { useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './event-evaluation.module.css';
import EventEvaluationResults from './event-evaluation-results';

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
  return <ScopedEventEvaluationAdmin key={eventId} eventId={eventId} />;
}

function ScopedEventEvaluationAdmin({ eventId }: { eventId: string }) {
  const [management, setManagement] = useState<Management | null>(null);
  const [active, setActive] = useState(false);
  const [title, setTitle] = useState('Avaliação do evento');
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getToken()) { setStatus('Entre na sua conta para configurar a avaliação.'); return; }
    let current = true;
    api<Management>(`/events/${eventId}/evaluation`).then((result) => {
      if (!current) return;
      setManagement(result);
      if (result.config) {
        setActive(result.config.active); setTitle(result.config.title); setQuestions(result.config.questions);
      }
    }).catch(() => { if (current) setStatus('Não foi possível carregar a avaliação.'); });
    return () => { current = false; };
  }, [eventId]);

  const locked = (management?.responseCount ?? 0) > 0;
  const disabled = busy || !management;

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
      const quote = (value: unknown) => {
        const raw = String(value ?? '');
        const safe = /^[=+\-@]/u.test(raw) ? `'${raw}` : raw;
        return `"${safe.replaceAll('"', '""')}"`;
      };
      const csv = '\uFEFF' + [columns.map(quote).join(','), ...result.rows.map((row) => [row.submittedAt, ...result.questions.map((question) => row.answers?.[question.id] ?? '')].map(quote).join(','))].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `avaliacao-${eventId}.csv`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setStatus('Não foi possível exportar as respostas.'); }
  }

  return <main className={styles.page}>
    <section className={styles.card} aria-labelledby="evaluation-admin-title">
      <p className={styles.eyebrow}>PÓS-EVENTO</p>
      <h1 id="evaluation-admin-title">Avaliação do evento</h1>
      <p>Publique um questionário curto. A pessoa responde na área reservada depois de ter a inscrição confirmada.</p>
      <label className={styles.toggle}><input type="checkbox" disabled={disabled} checked={active} onChange={(event) => setActive(event.target.checked)} /> Avaliação aberta</label>
      <label>Título<input disabled={disabled || locked} minLength={2} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      {locked && <p>As perguntas estão preservadas porque já existem respostas. Você pode abrir ou fechar a avaliação.</p>}
      <div className={styles.questions}>{questions.map((question, index) => <fieldset key={question.id}>
        <legend>Pergunta {index + 1}</legend>
        <label>Texto<input disabled={disabled || locked} maxLength={160} value={question.label} onChange={(event) => update(index, { label: event.target.value })} /></label>
        <label>Tipo<select disabled={disabled || locked} value={question.kind} onChange={(event) => update(index, { kind: event.target.value as Question['kind'] })}><option value="RATING">Nota de 1 a 5</option><option value="TEXT">Texto</option></select></label>
        <label className={styles.toggle}><input type="checkbox" disabled={disabled || locked} checked={question.required} onChange={(event) => update(index, { required: event.target.checked })} /> Obrigatória</label>
        <button type="button" disabled={disabled || locked || questions.length === 1} onClick={() => setQuestions((current) => current.filter((_, i) => i !== index))}>Remover</button>
      </fieldset>)}</div>
      <div className={styles.actions}>
        <button type="button" disabled={disabled || locked || questions.length >= 20} onClick={() => setQuestions((current) => [...current, { id: `pergunta_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, label: 'Nova pergunta', kind: 'TEXT', required: false }])}>Adicionar pergunta</button>
        <button type="button" disabled={disabled} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar configuração'}</button>
        <button type="button" disabled={!management?.responseCount} onClick={() => void exportCsv()}>Exportar {management?.responseCount ?? 0} respostas</button>
      </div>
      {status && <p role="status">{status}</p>}
    </section>
    <EventEvaluationResults eventId={eventId} />
  </main>;
}
