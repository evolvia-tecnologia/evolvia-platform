'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import styles from './registration-refund.module.css';

type WindowCode = 'NONE' | 'DAYS_30' | 'DAYS_7' | 'DAYS_1' | 'ANYTIME';
type Policy = { window: WindowCode | null; message: string; pending: string | null; version: number | null };
type Item = { id: string; protocol: string; reason: string; status: string; statusLabel: string; decisionNote: string | null; createdAt: string };
type RequestPage = { items: Item[]; nextCursor: string | null };
type RequestFilter = '' | 'REQUESTED' | 'APPROVED' | 'REJECTED';

const OPTIONS: Array<[WindowCode, string]> = [
  ['NONE', 'Em nenhum momento'],
  ['DAYS_30', 'Até 30 dias antes do início'],
  ['DAYS_7', 'Até 7 dias antes do início'],
  ['DAYS_1', 'Até 1 dia antes do início'],
  ['ANYTIME', 'A qualquer momento'],
];

export default function RegistrationRefundOrganizer({ eventId }: { eventId: string }) {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [windowCode, setWindowCode] = useState<WindowCode>('NONE');
  const [items, setItems] = useState<Item[]>([]);
  const [requestFilter, setRequestFilter] = useState<RequestFilter>('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams();
    if (requestFilter) params.set('status', requestFilter);
    const query = params.toString();
    Promise.all([
      api<Policy>(`/events/${encodeURIComponent(eventId)}/refunds/policy`),
      api<RequestPage>(`/events/${encodeURIComponent(eventId)}/refunds/requests${query ? `?${query}` : ''}`),
    ])
      .then(([nextPolicy, nextRequests]) => {
        if (!active) return;
        setPolicy(nextPolicy);
        if (nextPolicy.window) setWindowCode(nextPolicy.window);
        setItems(nextRequests.items);
        setNextCursor(nextRequests.nextCursor);
        setError('');
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir os reembolsos.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventId, requestFilter]);

  async function loadMore() {
    if (!nextCursor) return;
    setSaving(true);
    setError('');
    try {
      const params = new URLSearchParams({ cursor: nextCursor });
      if (requestFilter) params.set('status', requestFilter);
      const page = await api<RequestPage>(`/events/${encodeURIComponent(eventId)}/refunds/requests?${params.toString()}`);
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar mais pedidos.');
    } finally {
      setSaving(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const next = await api<Policy>(`/events/${encodeURIComponent(eventId)}/refunds/policy`, {
        method: 'POST',
        body: JSON.stringify({ window: windowCode }),
      });
      setPolicy(next);
      setNotice('Regra de reembolso publicada. Compras anteriores mantêm a versão que aceitaram.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível publicar a regra.');
    } finally {
      setSaving(false);
    }
  }

  async function decide(item: Item, decision: 'APPROVE' | 'REJECT') {
    if (busyId) return;
    const note = (notes[item.id] ?? '').trim().replace(/\s+/gu, ' ');
    if (note.length < 10 || note.length > 500) {
      setError('A justificativa precisa ter entre 10 e 500 caracteres.');
      return;
    }
    setBusyId(item.id);
    setError('');
    setNotice('');
    try {
      const next = await api<Item>(`/events/${encodeURIComponent(eventId)}/refunds/requests/${encodeURIComponent(item.id)}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, note }),
      });
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: next.status, statusLabel: next.statusLabel, decisionNote: next.decisionNote } : row));
      setNotice(decision === 'APPROVE' ? 'Pedido aprovado e aguardando processamento. O dinheiro não foi devolvido.' : 'Pedido recusado.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível analisar o pedido.');
    } finally {
      setBusyId('');
    }
  }

  return <section className={styles.panel} aria-labelledby="organizer-refund-title" aria-busy={loading || saving}>
    <h1 id="organizer-refund-title">Reembolsos</h1>
    <p>Publique a janela deste evento. Aprovar um pedido não devolve o dinheiro nem cancela a credencial: a situação fica como aprovado, aguardando processamento.</p>
    {loading && <p role="status">Carregando reembolsos…</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <form onSubmit={(event) => void save(event)}>
      <div className={styles.filters}>
        <label>Janela de reembolso
          <select value={windowCode} onChange={(event) => setWindowCode(event.target.value as WindowCode)}>
            {OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button type="submit" disabled={loading || saving}>{saving ? 'Publicando…' : 'Publicar regra'}</button>
      </div>
    </form>
    {policy && <p className={styles.note}>{policy.message}</p>}
    <div className={styles.filters}>
      <label>Situação dos pedidos
        <select value={requestFilter} onChange={(event) => setRequestFilter(event.target.value as RequestFilter)}>
          <option value="">Todas</option>
          <option value="REQUESTED">Em análise</option>
          <option value="APPROVED">Aprovado, aguardando processamento</option>
          <option value="REJECTED">Recusado</option>
        </select>
      </label>
    </div>
    {!loading && items.length === 0 && <p role="status">Nenhum pedido de reembolso.</p>}
    {items.length > 0 && <table className={styles.table}>
      <caption>Pedidos de reembolso</caption>
      <thead>
        <tr>
          <th scope="col">Protocolo</th>
          <th scope="col">Motivo</th>
          <th scope="col">Situação</th>
          <th scope="col">Análise</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => <tr key={item.id}>
          <th scope="row">{item.protocol}</th>
          <td>{item.reason}</td>
          <td>{item.statusLabel}</td>
          <td>{item.status === 'REQUESTED' ? <form onSubmit={(event) => event.preventDefault()}>
            <label>Justificativa de {item.protocol}
              <textarea value={notes[item.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} required minLength={10} maxLength={500} rows={2} />
            </label>
            <div className={styles.actions}>
              <button type="button" disabled={busyId === item.id} onClick={() => void decide(item, 'APPROVE')}>{busyId === item.id ? 'Salvando…' : 'Aprovar'}</button>
              <button type="button" disabled={busyId === item.id} onClick={() => void decide(item, 'REJECT')}>Recusar</button>
            </div>
          </form> : <p>{item.decisionNote}</p>}</td>
        </tr>)}
      </tbody>
    </table>}
    {nextCursor && <button type="button" disabled={saving} onClick={() => void loadMore()}>{saving ? 'Carregando…' : 'Carregar mais pedidos'}</button>}
  </section>;
}
