'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { communicationDraftId } from '../lib/event-communication-draft';
import styles from './event-communication.module.css';

type Batch = { id: string; draftId: string; draftRevision: number; recipientCount: number;
  status: string; createdAt: string; acceptedCount?: number; receivedCount: number; unknownCount?: number; failedCount?: number; cancelledCount?: number };
type Listing = { batches: Batch[]; sendingAvailable: boolean };
type Props = { eventId: string; draft: { id: string; revision: number; subject: string } | null;
  filters: { categoryIds: string[]; payment: string; filterMode: string } | null; history?: boolean };
const statusLabels: Record<string, string> = {
  PREPARED: 'Preparado', SENDING: 'Em processamento', ACCEPTED: 'Aceito pelo transporte',
  RECEIVED: 'Recebido', UNKNOWN: 'A conciliar', PARTIAL: 'Resultados distintos', FAILED: 'Falhou', CANCELLED: 'Cancelado',
};

export default function EventCommunicationBatches({ eventId, draft, filters, history = false }: Props) {
  const endpoint = `/events/${encodeURIComponent(eventId)}/communication/batches`;
  const [listing, setListing] = useState<Listing | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const live = useRef(false);
  const sequence = useRef(0);
  const requestKey = useRef<{ body: string; id: string } | null>(null);

  async function reload() {
    const ticket = ++sequence.current;
    try {
      const result = await api<Listing>(endpoint);
      if (live.current && ticket === sequence.current) setListing(result);
    } catch {
      if (live.current && ticket === sequence.current) {
        setListing(null);
        setMessage('Histórico indisponível. Atualize antes de continuar.');
      }
    }
  }

  useEffect(() => {
    live.current = true;
    void reload();
    return () => { live.current = false; sequence.current++; };
    // The parent remounts this panel for every event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  async function command(action: 'prepare' | 'cancel' | 'start', batch?: Batch) {
    if (lock.current || !listing) return;
    if (action === 'prepare' && (!draft || !filters)) return;
    if (action !== 'prepare' && batch?.status !== 'PREPARED') return;
    if (action === 'start' && !listing.sendingAvailable) return;
    if (action === 'start' && !window.confirm(`Autorizar o envio para até ${batch!.recipientCount} destinatários deste lote?`)) return;
    if (action === 'cancel' && !window.confirm('Cancelar este lote preparado?')) return;
    lock.current = true;
    sequence.current++;
    setBusy(true);
    setMessage('');
    try {
      if (action === 'prepare' && draft && filters) {
        const payload = { draftId: draft.id, draftRevision: draft.revision,
          filters: { audience: 'CONFIRMED_REGISTRATIONS', categoryIds: [...filters.categoryIds].sort(), payment: filters.payment, filterMode: filters.filterMode } };
        const body = JSON.stringify(payload);
        if (requestKey.current?.body !== body) requestKey.current = { body, id: communicationDraftId() };
        await api(endpoint, { method: 'POST', body: JSON.stringify({ ...payload, id: requestKey.current.id }) });
      } else if (batch) {
        await api(`${endpoint}/${encodeURIComponent(batch.id)}/${action}`, { method: 'POST' });
      }
      if (live.current) setMessage(action === 'prepare' ? 'Lote preparado. Confira os destinatários elegíveis no histórico.' :
        action === 'cancel' ? 'Lote cancelado.' : 'Início autorizado. Acompanhe a entrega no histórico.');
    } catch (error) {
      if (live.current) setMessage(error instanceof Error ? error.message : 'Resultado não confirmado. Consulte o histórico.');
    } finally {
      if (live.current) await reload();
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }

  return <section className={styles.card} aria-label={history ? "Histórico de envios" : "Preparar lote"}>
    <h3>{history ? "Histórico de lotes" : "Preparar lote"}</h3>
    {!history && <>
    <p>{draft ? `Mensagem: ${draft.subject} · versão ${draft.revision}.` : 'Abra ou salve uma mensagem antes de preparar um lote.'}</p>
    <p>Confira o público de inscrições confirmadas. A preparação inclui apenas contatos com consentimento.</p>
    </>}
    <div className={styles.actions}>
      {!history && <button type="button" disabled={busy || !listing || !filters || !draft} onClick={() => void command('prepare')}>Preparar lote</button>}
      <button type="button" disabled={busy} onClick={() => { setMessage(''); void reload(); }}>Atualizar histórico</button>
    </div>
    {message && <p role="status">{message}</p>}
    {history && listing && !listing.batches.length && <p>Nenhum lote preparado neste evento.</p>}
    {history && <ul className={styles.list}>{listing?.batches.map(batch => <li key={batch.id}>
      <strong>{statusLabels[batch.status] ?? 'A conferir'} · {batch.recipientCount} destinatários</strong>
      <span>{new Date(batch.createdAt).toLocaleString('pt-BR')} · Revisão {batch.draftRevision}</span>
      <span>Recebidos: {batch.receivedCount}{batch.acceptedCount !== undefined && ` · Aceitos pelo transporte: ${batch.acceptedCount}`}
        {Boolean(batch.failedCount) && ` · Falhas: ${batch.failedCount}`}
        {Boolean(batch.cancelledCount) && ` · Cancelados: ${batch.cancelledCount}`}
        {Boolean(batch.unknownCount) && ` · A conciliar: ${batch.unknownCount}`}</span>
      {batch.status === 'PREPARED' && <div className={styles.actions}>
        {listing.sendingAvailable && <button type="button" disabled={busy} onClick={() => void command('start', batch)}>Autorizar envio</button>}
        <button type="button" disabled={busy} onClick={() => void command('cancel', batch)}>Cancelar lote</button>
      </div>}
    </li>)}</ul>}
  </section>;
}
