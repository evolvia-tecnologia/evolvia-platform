'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './check-in-console.module.css';

type TicketResult = { kind: 'TICKET'; protocol: string; checkedInAt: string; alreadyCheckedIn: boolean };
type StaffResult = { kind: 'STAFF'; displayName: string; duty: string; checkedInAt: string; repeated: boolean };
type Result = TicketResult | StaffResult;

export default function CheckInConsole({ eventId }: { eventId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!getToken()) { window.location.assign('/login'); return; }
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await api<Result>(`/events/${encodeURIComponent(eventId)}/check-in`, {
        method: 'POST', body: JSON.stringify({ code: code.trim() }),
      });
      setResult(response); setCode('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível registrar a entrada.');
    } finally { setBusy(false); inputRef.current?.focus(); }
  }

  const repeated = result?.kind === 'TICKET' ? result.alreadyCheckedIn : result?.kind === 'STAFF' ? result.repeated : false;

  return <main className={styles.page} id="main-content">
    <Link href={`/eventos/${eventId}/painel`}>← Voltar ao painel do evento</Link>
    <h1>Credenciamento e check-in</h1>
    <p>Leia o QR do ingresso ou da equipe com um leitor que digita o código, ou informe o código manualmente. Ingressos precisam estar confirmados neste evento. A equipe pode entrar mais de uma vez.</p>
    <p><Link href={`/eventos/${eventId}/painel/show`}>Ver relatórios de ingressos, acessos e catracas</Link></p>
    <form className={styles.form} onSubmit={submit}>
      <label htmlFor="credential-code">Código da credencial</label>
      <input id="credential-code" ref={inputRef} autoComplete="off" spellCheck={false} required
        value={code} onChange={(event) => setCode(event.target.value)} />
      <button type="submit" disabled={busy}>{busy ? 'Registrando…' : 'Registrar entrada'}</button>
    </form>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {result && <section className={`${styles.result} ${repeated ? styles.repeated : ''}`} role="status" aria-live="polite">
      <strong>
        {result.kind === 'STAFF'
          ? (result.repeated ? 'Nova passagem da equipe' : 'Entrada da equipe registrada')
          : (result.alreadyCheckedIn ? 'Ingresso já validado' : 'Ingresso validado')}
      </strong>
      {result.kind === 'STAFF' ? <>
        <p>Equipe: {result.displayName}</p>
        <p>Função: {result.duty}</p>
      </> : <p>Protocolo: {result.protocol}</p>}
      <p>Horário: {new Date(result.checkedInAt).toLocaleString('pt-BR')}</p>
    </section>}
  </main>;
}
