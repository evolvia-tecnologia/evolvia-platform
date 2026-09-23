'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import styles from './participant-area.module.css';

type RegistrationStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';
type PaymentStatus = 'CREATING' | 'ACTIVE' | 'PAID' | 'PAID_REVIEW' | 'CANCELED' | 'EXPIRED' | 'FAILED' | 'UNKNOWN';

type Area = {
  event: { name: string; slug: string; startDate: string | null; endDate: string | null; format: string; venue: string | null };
  registration: { protocol: string; status: RegistrationStatus; category: string; lot: string; finalPriceCents: number; confirmedAt: string | null; expiresAt: string | null };
  payment: { status: PaymentStatus; paidAt: string | null } | null;
  sessionExpiresAt: string;
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const registrationLabels: Record<RegistrationStatus, string> = {
  PENDING_PAYMENT: 'Aguardando pagamento',
  CONFIRMED: 'Confirmada',
  EXPIRED: 'Reserva expirada',
  CANCELLED: 'Cancelada',
};
const paymentLabels: Record<PaymentStatus, string> = {
  CREATING: 'Preparando pagamento',
  ACTIVE: 'Aguardando pagamento',
  PAID: 'Pago',
  PAID_REVIEW: 'Pagamento em análise',
  CANCELED: 'Cancelado',
  EXPIRED: 'Pagamento expirado',
  FAILED: 'Falha no pagamento',
  UNKNOWN: 'Situação em verificação',
};

async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const raw = await response.text();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(fallbackMessage);
    return parsed as T;
  } catch { throw new Error(fallbackMessage); }
}

export default function ParticipantArea({ slug }: { slug: string }) {
  const [protocol, setProtocol] = useState('');
  const [document, setDocument] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!area) return;
    const delay = Date.parse(area.sessionExpiresAt) - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) {
      setToken(null); setArea(null); setError('Sua sessão expirou. Entre novamente para consultar a inscrição.');
      return;
    }
    const timer = window.setTimeout(() => {
      setToken(null); setArea(null); setError('Sua sessão expirou. Entre novamente para consultar a inscrição.');
    }, delay);
    return () => window.clearTimeout(timer);
  }, [area]);

  async function enter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const sessionResponse = await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/sessions`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ protocol, identityDocument: document }),
      });
      const session = await readJson<{ accessToken?: string; message?: string }>(sessionResponse, 'Não foi possível entrar.');
      if (!sessionResponse.ok || !session.accessToken) throw new Error(session.message ?? 'Não foi possível entrar.');
      const areaResponse = await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/me`, {
        cache: 'no-store', headers: { authorization: `Bearer ${session.accessToken}` },
      });
      const payload = await readJson<Area & { message?: string }>(areaResponse, 'Não foi possível carregar sua inscrição.');
      if (!areaResponse.ok) throw new Error(payload.message ?? 'Não foi possível carregar sua inscrição.');
      setToken(session.accessToken); setArea(payload); setDocument('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível entrar.'); }
    finally { setBusy(false); }
  }

  async function refresh() {
    if (!token || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/me`, {
        cache: 'no-store', headers: { authorization: `Bearer ${token}` },
      });
      const payload = await readJson<Area & { message?: string }>(response, 'Não foi possível atualizar sua inscrição.');
      if (response.status === 401) {
        setToken(null); setArea(null);
        throw new Error('Sua sessão expirou. Entre novamente para consultar a inscrição.');
      }
      if (!response.ok) throw new Error('Não foi possível atualizar sua inscrição.');
      if (Date.parse(payload.sessionExpiresAt) <= Date.now()) {
        setToken(null); setArea(null);
        throw new Error('Sua sessão expirou. Entre novamente para consultar a inscrição.');
      }
      setArea(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível atualizar sua inscrição.');
    } finally { setBusy(false); }
  }

  async function leave() {
    if (token) await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/sessions/current`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }).catch(() => undefined);
    setToken(null); setArea(null); setProtocol(''); setDocument(''); setError('');
  }

  if (area) return <main className={styles.page}>
    <section className={styles.card} aria-labelledby="participant-title">
      <p className={styles.eyebrow}>ÁREA DO PARTICIPANTE</p>
      <h1 id="participant-title">{area.event.name}</h1>
      <p>Consulte abaixo o estado atual da sua inscrição. Esta versão é somente leitura.</p>
      <dl className={styles.details}>
        <div><dt>Protocolo</dt><dd>{area.registration.protocol}</dd></div>
        <div><dt>Inscrição</dt><dd>{registrationLabels[area.registration.status] ?? 'Em análise'}</dd></div>
        <div><dt>Categoria</dt><dd>{area.registration.category}</dd></div>
        <div><dt>Lote</dt><dd>{area.registration.lot}</dd></div>
        <div><dt>Valor</dt><dd>{money.format(area.registration.finalPriceCents / 100)}</dd></div>
        <div><dt>Pagamento</dt><dd>{area.payment ? paymentLabels[area.payment.status] ?? 'Situação em verificação' : 'Não aplicável'}</dd></div>
      </dl>
      <p className={styles.session}>Por segurança, sua sessão termina às {new Date(area.sessionExpiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</p>
      {area.registration.status === 'PENDING_PAYMENT' && <p>Após concluir o pagamento, atualize a situação para conferir a confirmação.</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button type="button" onClick={refresh} disabled={busy}>{busy ? 'Atualizando…' : 'Atualizar situação'}</button>
        <button type="button" onClick={leave}>Sair com segurança</button>
      </div>
    </section>
  </main>;

  return <main className={styles.page}>
    <section className={styles.card} aria-labelledby="access-title">
      <Link href={`/evento/${slug}`}>← Voltar ao evento</Link>
      <p className={styles.eyebrow}>ÁREA DO PARTICIPANTE</p>
      <h1 id="access-title">Acompanhe sua inscrição</h1>
      <p>Use o protocolo recebido na inscrição e o mesmo CPF ou documento estrangeiro informado na ficha.</p>
      <form onSubmit={enter} className={styles.form}>
        <label>Protocolo<input autoComplete="off" required maxLength={20} value={protocol} onChange={(event) => setProtocol(event.target.value.toUpperCase())} /></label>
        <label>CPF ou documento estrangeiro<input autoComplete="off" required maxLength={50} value={document} onChange={(event) => setDocument(event.target.value)} /></label>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Validando…' : 'Entrar'}</button>
      </form>
      <p className={styles.privacy}>O documento é usado somente para validar o acesso e não é armazenado por esta tela.</p>
    </section>
  </main>;
}
