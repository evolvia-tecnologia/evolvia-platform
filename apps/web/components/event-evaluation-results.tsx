'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken } from '../lib/api';
import { evaluationCommentPage, evaluationCommentsCsv, evaluationResults, evaluationSummaryCsv, type EvaluationResponses } from '../lib/event-evaluation-results';
import styles from './event-evaluation-results.module.css';

const count = (value: number) => new Intl.NumberFormat('pt-BR').format(value);
const average = (value: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
const filenameId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100) || 'evento';
export default function EventEvaluationResults({ eventId }: { eventId: string }) {
  return <ScopedResults key={eventId} eventId={eventId} />;
}
function ScopedResults({ eventId }: { eventId: string }) {
  const [data, setData] = useState<EvaluationResponses | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [field, setField] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const summary = useMemo(() => data ? evaluationResults(data) : null, [data]);
  const textQuestion = summary?.texts.find(question => question.id === field) ?? summary?.texts[0];
  const comments = evaluationCommentPage(textQuestion?.comments ?? [], query, page);

  async function load() {
    request.current?.abort();
    setData(null); setError(''); setNotice(''); setQuery(''); setPage(0); setField('');
    if (!getToken()) { setBusy(false); setError('Entre na sua conta para consultar os resultados.'); return; }
    const controller = new AbortController(); request.current = controller; setBusy(true);
    try {
      const result = await api<EvaluationResponses>(`/events/${encodeURIComponent(eventId)}/evaluation/responses`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!Array.isArray(result.questions) || !Array.isArray(result.rows)) throw new Error('invalid-payload');
      setData(result);
    } catch { if (!controller.signal.aborted) setError('Não foi possível carregar os resultados. Tente novamente.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  function exportSummary() {
    if (!data) return;
    try {
      const url = URL.createObjectURL(new Blob([evaluationSummaryCsv(data)], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `resumo-avaliacao-${filenameId(eventId)}.csv`;
      try { document.body.appendChild(link); link.click(); }
      finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
      setNotice('Resumo exportado com os dados desta consulta. Os comentários ficam na exportação de respostas.');
    } catch { setNotice('Não foi possível exportar o resumo. Tente novamente.'); }
  }
  function exportComments() {
    if (!data || !textQuestion || !comments.total) return;
    try {
      const url = URL.createObjectURL(new Blob([evaluationCommentsCsv(data, textQuestion.id, query)], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `comentarios-avaliacao-${filenameId(eventId)}.csv`;
      try { document.body.appendChild(link); link.click(); }
      finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
      setNotice(`${count(comments.total)} ${comments.total === 1 ? 'comentário exportado' : 'comentários exportados'} da pergunta selecionada, com a busca aplicada, incluindo todas as páginas desta consulta.`);
    } catch { setNotice('Não foi possível exportar os comentários. Tente novamente.'); }
  }
  return <section className={styles.panel} aria-labelledby="evaluation-results-title">
    <header className={styles.heading}><div><p className={styles.eyebrow}>ESCUTA DO PARTICIPANTE</p><h2 id="evaluation-results-title">Resultados da avaliação</h2><p>Conheça as notas e os comentários enviados neste evento.</p></div><div className={styles.actions}><button type="button" disabled={busy} onClick={() => void load()}>{busy ? 'Carregando…' : data ? 'Atualizar resultados' : 'Carregar resultados'}</button>{data && <button type="button" onClick={exportSummary}>Exportar resumo CSV</button>}</div></header>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <p role="status" aria-live="polite">{busy ? 'Consultando as respostas do evento…' : notice}</p>
    {!data && !busy && !error && <p className={styles.empty}>Carregue os resultados para consultar as respostas já registradas.</p>}
    {summary && <>
      <div className={styles.metrics}><article><span>Respostas na consulta</span><strong>{count(summary.total)}</strong><p>Cada inscrição pode responder uma vez.</p></article><article><span>Perguntas de nota</span><strong>{count(summary.ratings.length)}</strong><p>Médias calculadas por pergunta.</p></article><article><span>Perguntas de texto</span><strong>{count(summary.texts.length)}</strong><p>Comentários consultados abaixo.</p></article></div>
      {!summary.total && <p className={styles.empty}>Ainda não há respostas registradas. Os resultados aparecerão após o primeiro envio.</p>}
      {summary.total > 0 && <div className={styles.grid}>{summary.ratings.map(question => <article key={question.id} className={styles.question}>
        <h3>{question.label}</h3><div className={styles.score}><strong>{question.average === null ? '—' : average(question.average)}</strong><span>de 5 · {count(question.answered)} {question.answered === 1 ? 'nota válida' : 'notas válidas'}</span></div>
        <ul className={styles.bars} aria-label={`Distribuição das notas: ${question.label}`}>{question.distribution.map(bucket => <li key={bucket.value}><span>Nota {bucket.value}</span><div className={styles.track} aria-hidden="true"><span style={{ width: `${question.answered ? 100 * bucket.count / question.answered : 0}%` }} /></div><strong>{count(bucket.count)}</strong></li>)}</ul>
        <p className={styles.help}>{count(question.missing)} sem resposta{question.invalid > 0 && ` · ${count(question.invalid)} com valor inválido, fora da média`}</p>
      </article>)}</div>}
      {summary.total > 0 && summary.texts.length > 0 && <section className={styles.comments} aria-labelledby="evaluation-comments-title"><h3 id="evaluation-comments-title">Comentários dos participantes</h3><div className={styles.filters}><label>Pergunta de texto<select value={textQuestion?.id ?? ''} onChange={event => { setField(event.target.value); setPage(0); setQuery(''); }}>{summary.texts.map(question => <option key={question.id} value={question.id}>{question.label}</option>)}</select></label><label>Buscar nos comentários<input type="search" maxLength={180} value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Digite uma palavra" /></label></div><p className={styles.help}>{count(comments.total)} {comments.total === 1 ? 'comentário encontrado' : 'comentários encontrados'}. {count(textQuestion?.missing ?? 0)} sem resposta nesta pergunta{textQuestion?.invalid ? ` · ${count(textQuestion.invalid)} com valor inválido` : ''}.</p>
        <button type="button" disabled={!comments.total || busy} onClick={exportComments}>Exportar comentários filtrados CSV</button>
        <p className={styles.help}>A exportação inclui todas as páginas da pergunta e da busca selecionadas, sem identificadores dos participantes. Os comentários podem conter dados pessoais escritos por quem respondeu; compartilhe somente com a equipe autorizada.</p>
        {comments.rows.length ? <ul className={styles.commentList}>{comments.rows.map(comment => <li key={comment.id}><p>{comment.text}</p></li>)}</ul> : <p className={styles.empty}>{query ? 'Nenhum comentário corresponde à busca.' : 'Ainda não há comentários nesta pergunta.'}</p>}
        {comments.pages > 1 && <nav className={styles.pagination} aria-label="Páginas de comentários"><button type="button" disabled={comments.current === 0} onClick={() => setPage(comments.current - 1)}>Anterior</button><span role="status">Página {comments.current + 1} de {count(comments.pages)}</span><button type="button" disabled={comments.current + 1 >= comments.pages} onClick={() => setPage(comments.current + 1)}>Próxima</button></nav>}
      </section>}
      <p className={styles.help}>Cada média usa apenas as notas válidas daquela pergunta. Os resultados representam quem respondeu; não são NPS nem taxa de resposta de todos os inscritos. Comentários são textos fornecidos pelos participantes.</p>
    </>}
  </section>;
}
