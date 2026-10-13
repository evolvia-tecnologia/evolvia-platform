'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import styles from './scientific-ranking.module.css';

type Phase = 'ELIMINATORY' | 'CLASSIFICATORY';
type Outcome = 'ELIMINATED' | 'CLASSIFIED' | 'INSUFFICIENT';

type RankingView = {
  configured: boolean;
  cutoff: number;
  limit: number;
  criteria: { id: string; code: string; label: string; phase: Phase }[];
  rows: {
    submissionId: string;
    title: string;
    status: string;
    outcome: Outcome;
    eliminatoryAverage: number | null;
    classificatoryAverage: number | null;
    reviewCount: number;
  }[];
  truncated: boolean;
};

const OUTCOME: Record<Outcome, string> = {
  ELIMINATED: 'Eliminado',
  CLASSIFIED: 'Classificado',
  INSUFFICIENT: 'Sem nota suficiente',
};

const STATUS: Record<string, string> = {
  DRAFT: 'Rascunho',
  INCOMPLETE: 'Incompleto',
  SUBMITTED: 'Enviado',
  UNDER_REVIEW: 'Em análise',
  ACCEPTED: 'Aceito',
  ACCEPTED_WITH_CHANGES: 'Aceito com alterações',
  REJECTED: 'Recusado',
};

function score(value: number | null) {
  if (value === null) return '—';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

export default function ScientificRanking({ eventId }: { eventId: string }) {
  const [view, setView] = useState<RankingView | null>(null);
  const [cutoff, setCutoff] = useState('6');
  const [phases, setPhases] = useState<Record<string, Phase>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api<RankingView>(`/scientific-events/${encodeURIComponent(eventId)}/ranking`)
      .then((result) => {
        if (!active) return;
        setView(result);
        setCutoff(String(result.cutoff));
        setPhases(Object.fromEntries(result.criteria.map((item) => [item.id, item.phase])));
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a classificação.');
      });
    return () => { active = false; };
  }, [eventId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<RankingView>(`/scientific-events/${encodeURIComponent(eventId)}/ranking`, {
        method: 'PUT',
        body: JSON.stringify({ cutoff: Number(cutoff), phases }),
      });
      setView(result);
      setCutoff(String(result.cutoff));
      setPhases(Object.fromEntries(result.criteria.map((item) => [item.id, item.phase])));
      setNotice('O corte foi gravado. A decisão do trabalho continua na comissão.');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível gravar o corte.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="scientific-ranking-title">
      <h2 id="scientific-ranking-title">Eliminatório e classificatório</h2>
      <p>
        A nota de corte vai de 0 a 10. Cada critério entra na média já convertido para essa escala.
        Abaixo do corte, o trabalho aparece como eliminado. Esta leitura não aceita nem recusa o trabalho.
      </p>
      {!view?.configured ? <p role="status">Ainda não há corte gravado. Enquanto isso, a lista só ordena pela nota classificatória.</p> : null}
      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.field}>
          Nota de corte
          <input value={cutoff} inputMode="decimal" min={0} max={10} step={0.01} required disabled={busy || !view} onChange={(event) => setCutoff(event.target.value)} />
        </label>
        <div className={styles.list}>
          {view?.criteria.map((criterion) => (
            <label className={styles.field} key={criterion.id}>
              {criterion.label}
              <select
                value={phases[criterion.id] ?? 'CLASSIFICATORY'}
                disabled={busy}
                onChange={(event) => setPhases((current) => ({ ...current, [criterion.id]: event.target.value as Phase }))}
              >
                <option value="ELIMINATORY">Eliminatório</option>
                <option value="CLASSIFICATORY">Classificatório</option>
              </select>
            </label>
          ))}
        </div>
        {view && view.criteria.length === 0 ? <p>Cadastre critérios na avaliação antes de separar eliminatório e classificatório.</p> : null}
        <button className={styles.primary} type="submit" disabled={busy || !view || view.criteria.length === 0}>
          {busy ? 'Gravando…' : 'Gravar corte'}
        </button>
      </form>
      {view && view.rows.length > 0 ? (
        <div className={styles.tableWrap}>
          <table>
            <caption>Leitura dos trabalhos deste evento, no máximo {view.limit}.</caption>
            <thead>
              <tr>
                <th scope="col">Trabalho</th>
                <th scope="col">Situação</th>
                <th scope="col">Eliminatória</th>
                <th scope="col">Classificatória</th>
                <th scope="col">Pareceres</th>
                <th scope="col">Leitura</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row) => (
                <tr key={row.submissionId}>
                  <td>{row.title}</td>
                  <td>{STATUS[row.status] ?? 'Outra situação'}</td>
                  <td>{score(row.eliminatoryAverage)}</td>
                  <td>{score(row.classificatoryAverage)}</td>
                  <td>{row.reviewCount}</td>
                  <td>{OUTCOME[row.outcome]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {view?.truncated ? <p>A lista mostra os primeiros {view.limit} trabalhos.</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
