'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import styles from './participant-area.module.css';
import CredentialQr from './credential-qr';
import ScientificAuthorPanel from './scientific-author-panel';
import { paymentLabel, registrationLabel, sessionDelay } from './participant-status';
import type { PaymentStatus, RegistrationStatus } from './participant-status';

type Area = {
  event: { name: string; slug: string; profileCode: string; startDate: string | null; endDate: string | null; format: string; venue: string | null };
  registration: { protocol: string; status: RegistrationStatus; category: string; lot: string; finalPriceCents: number; confirmedAt: string | null; expiresAt: string | null };
  payment: { status: PaymentStatus; paidAt: string | null } | null;
  credential: { code: string; checkedInAt: string | null } | null;
  sessionExpiresAt: string;
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const raw = await response.text();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(fallbackMessage);
    return parsed as T;
  } catch { throw new Error(fallbackMessage); }
}

export default function ParticipantArea({ slug }: { slug: string }) {
  const requestEpoch = useRef(0);
  const [protocol, setProtocol] = useState('');
  const [document, setDocument] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!area) return;
    const delay = sessionDelay(area.sessionExpiresAt, Date.now());
    if (delay === 0) {
      requestEpoch.current += 1;
      setToken(null); setArea(null); setBusy(false); setError('Sua sessão expirou. Entre novamente para consultar a inscrição.');
      return;
    }
    const timer = window.setTimeout(() => {
      requestEpoch.current += 1;
      setToken(null); setArea(null); setBusy(false); setError('Sua sessão expirou. Entre novamente para consultar a inscrição.');
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
    const request = ++requestEpoch.current;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/me`, {
        cache: 'no-store', headers: { authorization: `Bearer ${token}` },
      });
      if (request !== requestEpoch.current) return;
      if (response.status === 401) {
        requestEpoch.current += 1; setToken(null); setArea(null); setBusy(false);
        setError('Sua sessão expirou. Entre novamente para consultar a inscrição.');
        return;
      }
      const payload = await readJson<Area & { message?: string }>(response, 'Não foi possível atualizar sua inscrição.');
      if (request !== requestEpoch.current) return;
      if (!response.ok) throw new Error('Não foi possível atualizar sua inscrição.');
      if (sessionDelay(payload.sessionExpiresAt, Date.now()) === 0) {
        requestEpoch.current += 1; setToken(null); setArea(null); setBusy(false);
        setError('Sua sessão expirou. Entre novamente para consultar a inscrição.');
        return;
      }
      setArea(payload);
    } catch (caught) {
      if (request === requestEpoch.current || !token) {
        setError(caught instanceof Error ? caught.message : 'Não foi possível atualizar sua inscrição.');
      }
    } finally { if (request === requestEpoch.current) setBusy(false); }
  }

  async function leave() {
    const activeToken = token;
    requestEpoch.current += 1;
    setToken(null); setArea(null); setProtocol(''); setDocument(''); setError(''); setBusy(false);
    if (!activeToken) return;
    try {
      const response = await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/sessions/current`, {
        method: 'DELETE', headers: { authorization: `Bearer ${activeToken}` },
      });
      if (!response.ok) throw new Error('Falha ao revogar.');
    } catch {
      setError('A sessão saiu deste navegador, mas a revogação no servidor não pôde ser confirmada. Ela expira em até 15 minutos.');
    }
  }

  if (area) return <main className={styles.page}>
    <section className={styles.card} aria-labelledby="participant-title">
      <p className={styles.eyebrow}>ÁREA DO PARTICIPANTE</p>
      <h1 id="participant-title">{area.event.name}</h1>
      <p>Consulte abaixo o estado atual da sua inscrição. Acompanhe sua inscrição e apresente sua credencial no evento.</p>
      <dl className={styles.details}>
        <div><dt>Protocolo</dt><dd>{area.registration.protocol}</dd></div>
        <div><dt>Inscrição</dt><dd>{registrationLabel(area.registration.status)}</dd></div>
        <div><dt>Categoria</dt><dd>{area.registration.category}</dd></div>
        <div><dt>Lote</dt><dd>{area.registration.lot}</dd></div>
        <div><dt>Valor</dt><dd>{money.format(area.registration.finalPriceCents / 100)}</dd></div>
        <div><dt>Pagamento</dt><dd>{paymentLabel(area.payment?.status ?? null)}</dd></div>
      </dl>
      {area.credential && <section aria-labelledby="credential-title">
        <h2 id="credential-title">Credencial de acesso</h2>
        <p>Apresente este QR à equipe de credenciamento. Ele é válido apenas para este evento.</p>
        <CredentialQr code={area.credential.code} />
        <p><small>Código para leitura manual: <code style={{ overflowWrap: 'anywhere' }}>{area.credential.code}</code></small></p>
        {area.credential.checkedInAt && <p role="status">Entrada registrada em {new Date(area.credential.checkedInAt).toLocaleString('pt-BR')}.</p>}
      </section>}
      {token && area.event.profileCode === 'SCIENTIFIC_EVENT' && area.registration.status === 'CONFIRMED' && <ScientificAuthorPanel slug={slug} token={token} />}
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
