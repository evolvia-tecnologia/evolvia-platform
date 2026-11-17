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
type KitSizeStock = { id: string; label: string; forecast: number; delivered: number; available: number };
type Report = {
  counts: { registrations: number; confirmed: number; checkedIn: number; materialDelivered: number };
  kit?: { name: string; shirtsEnabled: boolean; sizes: KitSizeStock[] };
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
  eventId, mode, categories, activities, published, canMarkPresence, canPrintBadge, onPrintBadge, onPrintList,
}: {
  eventId: string;
  mode: 'report' | 'print' | 'raffle';
  categories: Array<{ id: string; name: string }>;
  activities: Array<{ id: string; title: string }>;
  published: boolean;
  canMarkPresence: boolean;
  canPrintBadge: boolean;
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
  const [presenceBusyId, setPresenceBusyId] = useState('');
  const [reversingId, setReversingId] = useState('');
  const [reverseReason, setReverseReason] = useState('');
  const [notice, setNotice] = useState('');

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

  async function changePresence(reservationId: string, reverse: boolean, reason = '') {
    if (presenceBusyId || busy) return;
    setPresenceBusyId(reservationId);
    setError(''); setNotice('');
    try {
      await api(`/events/${encodeURIComponent(eventId)}/desk/${reverse ? 'check-in/reverse' : 'check-in'}`, {
        method: 'POST', body: JSON.stringify({ reservationId, ...(reverse ? { reason } : {}) }),
      });
      const fresh = await api<Report>(`/events/${encodeURIComponent(eventId)}/desk/report`);
      setReport(fresh);
      setNotice(reverse ? 'Presença retirada com motivo auditado, sem impressão.' : 'Presença registrada sem imprimir etiqueta.');
      setReversingId(''); setReverseReason('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível alterar a presença.');
    } finally { setPresenceBusyId(''); }
  }

  if (!report && !error) return <p role="status">Carregando credenciamento…</p>;

  return <div className={styles.workspace}>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {report && (mode === 'report' || mode === 'print') && <>
      <h3>{mode === 'print' ? 'Impressão' : 'Relatório de credenciamento'}</h3>
      <p>{report.counts.registrations} inscrições · {report.counts.confirmed} confirmadas · {report.counts.checkedIn} credenciadas · {report.counts.materialDelivered} com material retirado.</p>
      {report.kit && report.kit.sizes.length > 0 && <table className={styles.kitTable}>
        <caption>Estoque de camisas por tamanho{report.kit.name ? ` · ${report.kit.name}` : ''}</caption>
        <thead><tr><th scope="col">Tamanho</th><th scope="col">Previsto</th><th scope="col">Disponível</th><th scope="col">Entregue</th></tr></thead>
        <tbody>{report.kit.sizes.map((size) => <tr key={size.id}><th scope="row">{size.label}</th><td>{size.forecast}</td><td>{size.available}</td><td>{size.delivered}</td></tr>)}</tbody>
      </table>}
      {report.truncated && <p>A lista mostra as 500 inscrições mais recentes deste evento. Os números acima contam todas.</p>}
      <div className={styles.participantTableScroll}><table className={styles.kitTable}>
        <caption>Conferência de participantes: nome e código da inscrição</caption>
        <thead><tr><th scope="col">Nome do participante</th><th scope="col">Código da inscrição</th>
          <th scope="col">Categoria</th><th scope="col">Presença</th><th scope="col">Ações</th></tr></thead>
        {report.items.map((item) => <tbody key={item.reservationId}>
          <tr><th scope="row">{item.name}</th><td>{item.protocol}</td><td>{item.category}</td>
            <td>{item.checkedInAt ? 'Presença registrada' : item.status === 'CONFIRMED' ? 'Sem presença' : (statusLabels[item.status] ?? item.status)}</td>
            <td><div className={styles.kitActions}>
              {canPrintBadge && <button type="button" disabled={!published || item.status !== 'CONFIRMED' || Boolean(presenceBusyId)}
                onClick={() => onPrintBadge(item.reservationId)}>Imprimir etiqueta</button>}
              {canMarkPresence && !item.checkedInAt && <button type="button" disabled={!published || item.status !== 'CONFIRMED' || Boolean(presenceBusyId)}
                onClick={() => void changePresence(item.reservationId, false)}>Marcar presença</button>}
              {canMarkPresence && item.checkedInAt && <button type="button" disabled={!published || Boolean(presenceBusyId)}
                onClick={() => { setReversingId(item.reservationId); setReverseReason(''); }}>Retirar presença</button>}
            </div></td>
          </tr>
          {reversingId === item.reservationId && <tr><td colSpan={5}><div className={styles.kitActions}>
            <label>Motivo da retirada de presença
              <input aria-label={`Motivo para retirar presença de ${item.name}`} minLength={3} maxLength={160}
                value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} />
            </label>
            <button type="button" disabled={reverseReason.trim().length < 3 || Boolean(presenceBusyId)}
              onClick={() => void changePresence(item.reservationId, true, reverseReason.trim())}>Confirmar retirada</button>
            <button type="button" className={styles.secondaryAction}
              onClick={() => { setReversingId(''); setReverseReason(''); }}>Cancelar</button>
          </div></td></tr>}
        </tbody>)}
      </table></div>
      <button type="button" onClick={() => printLines(mode === 'print' ? 'Lista para impressão' : 'Relatório de credenciamento', report.items)}>Imprimir lista</button>
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
