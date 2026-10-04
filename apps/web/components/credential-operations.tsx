'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import styles from './event-desk.module.css';

type Item = {
  reservationId: string;
  protocol: string;
  name: string;
  category: string;
  status: string;
  checkedInAt: string | null;
  materialDeliveredAt: string | null;
};
type Draw = { at: string; protocol: string; name: string; scope: string };
type Report = {
  counts: { registrations: number; confirmed: number; checkedIn: number; materialDelivered: number };
  truncated: boolean;
  items: Item[];
  draws: Draw[];
};
type Winner = { reservationId: string; protocol: string; name: string; category: string };

const statusLabels: Record<string, string> = {
  CONFIRMED: 'Confirmada',
  PENDING_PAYMENT: 'Aguardando pagamento',
  EXPIRED: 'Expirada',
  CANCELLED: 'Cancelada',
};

export default function CredentialOperations({
  eventId, mode, categories, activities, published, onPrintBadge, onPrintList,
}: {
  eventId: string;
  mode: 'labels' | 'report' | 'print' | 'raffle';
  categories: Array<{ id: string; name: string }>;
  activities: Array<{ id: string; title: string }>;
  published: boolean;
  onPrintBadge: (reservationId: string) => void;
  onPrintList: (title: string, lines: string[]) => void;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [scope, setScope] = useState<'ALL' | 'CATEGORY' | 'ACTIVITY'>('ALL');
  const [categoryId, setCategoryId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [allowRepeat, setAllowRepeat] = useState(false);
  const [winner, setWinner] = useState<Winner | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api<Report>(`/events/${encodeURIComponent(eventId)}/desk/report`)
      .then((result) => { if (active) setReport(result); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o credenciamento.');
      });
    return () => { active = false; };
  }, [eventId, mode]);

  const confirmed = (report?.items ?? []).filter((item) => item.status === 'CONFIRMED');

  function printLines(title: string, rows: Item[]) {
    onPrintList(title, rows.map((item) => `${item.name} · ${item.protocol} · ${item.category} · ${item.checkedInAt ? 'credenciado' : 'sem entrada'}`));
  }

  async function draw(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await api<{ winner: Winner }>(`/events/${encodeURIComponent(eventId)}/desk/raffle`, {
        method: 'POST',
        body: JSON.stringify({
          scope,
          allowRepeat,
          ...(scope === 'CATEGORY' ? { categoryId } : {}),
          ...(scope === 'ACTIVITY' ? { activityId } : {}),
        }),
      });
      setWinner(result.winner);
      const next = await api<Report>(`/events/${encodeURIComponent(eventId)}/desk/report`);
      setReport(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível sortear.');
    } finally { setBusy(false); }
  }

  if (!report && !error) return <p role="status">Carregando credenciamento…</p>;

  return <div className={styles.workspace}>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {report && (mode === 'report' || mode === 'print') && <>
      <h3>{mode === 'print' ? 'Impressão' : 'Relatório de credenciamento'}</h3>
      <p>{report.counts.registrations} inscrições · {report.counts.confirmed} confirmadas · {report.counts.checkedIn} credenciadas · {report.counts.materialDelivered} com material retirado.</p>
      {report.truncated && <p>A lista mostra as 500 inscrições mais recentes deste evento. Os números acima contam todas.</p>}
      <ul className={styles.results}>
        {report.items.map((item) => <li key={item.reservationId}>
          <strong>{item.name}</strong>
          <span>{item.category} · {statusLabels[item.status] ?? item.status} · {item.protocol} · {item.checkedInAt ? 'credenciado' : 'sem entrada'} · {item.materialDeliveredAt ? 'material retirado' : 'material pendente'}</span>
        </li>)}
      </ul>
      <button type="button" onClick={() => printLines(mode === 'print' ? 'Lista para impressão' : 'Relatório de credenciamento', report.items)}>Imprimir lista</button>
    </>}
    {report && mode === 'labels' && <>
      <h3>Lista de etiquetas</h3>
      <p>Cada etiqueta é de uma inscrição confirmada deste evento.</p>
      {confirmed.length === 0 && <p>Ainda não há inscrição confirmada para imprimir.</p>}
      <ul className={styles.results}>
        {confirmed.map((item) => <li key={item.reservationId}>
          <strong>{item.name}</strong>
          <span>{item.category} · {item.protocol}</span>
          <button type="button" disabled={!published} onClick={() => onPrintBadge(item.reservationId)}>Imprimir etiqueta</button>
        </li>)}
      </ul>
    </>}
    {mode === 'raffle' && <>
      <h3>Sorteio</h3>
      <p>O sorteio usa só inscrições confirmadas deste evento. O resultado fica com a equipe e não é publicado.</p>
      <form className={styles.register} onSubmit={(event) => void draw(event)}>
        <label>Sortear entre
          <select value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}>
            <option value="ALL">Todos os confirmados</option>
            <option value="CATEGORY">Uma categoria</option>
            <option value="ACTIVITY">Quem entrou numa atividade</option>
          </select>
        </label>
        {scope === 'CATEGORY' && <label>Categoria
          <select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">Selecione</option>
            {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>}
        {scope === 'ACTIVITY' && <label>Atividade
          <select required value={activityId} onChange={(event) => setActivityId(event.target.value)}>
            <option value="">Selecione</option>
            {activities.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>}
        <label className={styles.choices}>
          <input type="checkbox" checked={allowRepeat} onChange={(event) => setAllowRepeat(event.target.checked)} />
          Permitir repetir quem já foi sorteado
        </label>
        <button type="submit" disabled={!published || busy}>{busy ? 'Sorteando…' : 'Sortear'}</button>
      </form>
      {!published && <p>O sorteio abre quando o evento está publicado.</p>}
      {winner && <p role="status">Sorteado: {winner.name} · {winner.category} · {winner.protocol}</p>}
      {(report?.draws.length ?? 0) > 0 && <ul className={styles.results}>
        {report?.draws.map((draw) => <li key={`${draw.at}-${draw.protocol}`}>
          <strong>{draw.name}</strong>
          <span>{draw.protocol} · {new Date(draw.at).toLocaleString('pt-BR')}</span>
        </li>)}
      </ul>}
    </>}
  </div>;
}
