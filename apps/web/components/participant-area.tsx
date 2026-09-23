'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import styles from './participant-area.module.css';

type Area = {
  event: { name: string; slug: string; startDate: string | null; endDate: string | null; format: string; venue: string | null };
  registration: { protocol: string; status: string; category: string; lot: string; finalPriceCents: number; confirmedAt: string | null; expiresAt: string | null };
  payment: { status: string; paidAt: string | null } | null;
  sessionExpiresAt: string;
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ParticipantArea({ slug }: { slug: string }) {
  const [protocol, setProtocol] = useState('');
  const [document, setDocument] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function enter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const sessionResponse = await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/sessions`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ protocol, identityDocument: document }),
      });
      const session = await sessionResponse.json() as { accessToken?: string; message?: string };
      if (!sessionResponse.ok || !session.accessToken) throw new Error(session.message ?? 'Não foi possível entrar.');
      const areaResponse = await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/me`, {
        cache: 'no-store', headers: { authorization: `Bearer ${session.accessToken}` },
      });
      const payload = await areaResponse.json() as Area & { message?: string };
      if (!areaResponse.ok) throw new Error(payload.message ?? 'Não foi possível carregar sua inscrição.');
      setToken(session.accessToken); setArea(payload); setDocument('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível entrar.'); }
    finally { setBusy(false); }
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
        <div><dt>Inscrição</dt><dd>{area.registration.status}</dd></div>
        <div><dt>Categoria</dt><dd>{area.registration.category}</dd></div>
        <div><dt>Lote</dt><dd>{area.registration.lot}</dd></div>
        <div><dt>Valor</dt><dd>{money.format(area.registration.finalPriceCents / 100)}</dd></div>
        <div><dt>Pagamento</dt><dd>{area.payment?.status ?? 'Não aplicável'}</dd></div>
      </dl>
      <p className={styles.session}>Por segurança, sua sessão termina às {new Date(area.sessionExpiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</p>
      <button type="button" onClick={leave}>Sair com segurança</button>
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
