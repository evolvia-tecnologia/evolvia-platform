'use client';

import { FormEvent, useEffect, useState } from 'react';
import styles from './registration-refund.module.css';

type Eligibility = { message: string; eligible: boolean | null; pending: string | null };
type RequestView = { statusLabel: string; reason: string; decisionNote: string | null; moneyReturned: false };
type View = { paid: boolean; current: Eligibility; accepted: (Eligibility & { acceptedAt: string; version: number }) | null; request: RequestView | null };

export default function RegistrationRefundRequest({ slug, token }: { slug: string; token: string }) {
  const [view, setView] = useState<View | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/refund`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message || 'Não foi possível abrir o reembolso.');
        return payload as View;
      })
      .then((next) => { if (active) { setView(next); setError(''); } })
      .catch((reasonError: unknown) => { if (active) setError(reasonError instanceof Error ? reasonError.message : 'Não foi possível abrir o reembolso.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug, token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    const cleanReason = reason.trim().replace(/\s+/gu, ' ');
    if (cleanReason.length < 10 || cleanReason.length > 500) {
      setError('O motivo precisa ter entre 10 e 500 caracteres.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const response = await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/refund/requests`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: cleanReason }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: { message?: string }; statusLabel?: string; reason?: string; decisionNote?: string | null };
      if (!response.ok) throw new Error(payload.error?.message || 'Não foi possível registrar o pedido.');
      setView((current) => current ? { ...current, request: { statusLabel: payload.statusLabel ?? 'Em análise', reason: payload.reason ?? cleanReason, decisionNote: payload.decisionNote ?? null, moneyReturned: false } } : current);
    } catch (reasonError) {
      setError(reasonError instanceof Error ? reasonError.message : 'Não foi possível registrar o pedido.');
    } finally {
      setSending(false);
    }
  }

  const rule = view?.accepted ?? view?.current;

  return <section className={styles.panel} aria-labelledby="participant-refund-title" aria-busy={loading || sending}>
    <h2 id="participant-refund-title">Reembolso</h2>
    {loading && <p role="status">Carregando a regra de reembolso…</p>}
    {error && <p role="alert">{error}</p>}
    {view && <>
      <p>{view.current.message}</p>
      {view.accepted && <p>Regra aceita nesta compra, em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(view.accepted.acceptedAt))}: {view.accepted.message}</p>}
      {view.request && <p role="status">Situação do pedido: {view.request.statusLabel}. A aprovação administrativa não devolve o dinheiro nem cancela a credencial.</p>}
      {view.request?.decisionNote && <p>Justificativa da organização: {view.request.decisionNote}</p>}
      {!view.request && view.paid && rule?.eligible && <form onSubmit={(event) => void submit(event)}>
        <label>Motivo do reembolso
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} required minLength={10} maxLength={500} rows={3} />
        </label>
        <button type="submit" disabled={sending}>{sending ? 'Enviando…' : 'Solicitar reembolso'}</button>
      </form>}
      {!view.paid && !view.request && <p>O pedido vale para uma inscrição paga.</p>}
      {!view.request && view.paid && rule && rule.eligible === null && <p>A elegibilidade ainda não pode ser calculada.</p>}
    </>}
  </section>;
}
