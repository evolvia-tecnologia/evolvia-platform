'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './check-in-console.module.css';

type Result = { protocol: string; checkedInAt: string; alreadyCheckedIn: boolean };

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

  return <main className={styles.page}>
    <h1>Credenciamento e check-in</h1>
    <p>Leia o QR da credencial com um leitor que digita o código, ou informe o código da credencial. O protocolo da inscrição não registra a entrada. Apenas inscrições confirmadas deste evento podem entrar.</p>
    <form onSubmit={submit}>
      <label htmlFor="credential-code">Código da credencial
        <input id="credential-code" ref={inputRef} autoComplete="off" spellCheck={false} required
          value={code} onChange={(event) => setCode(event.target.value)} />
      </label>
      <button type="submit" disabled={busy}>{busy ? 'Registrando…' : 'Registrar entrada'}</button>
    </form>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {result && <section className={styles.result} role="status" aria-live="polite">
      <strong>{result.alreadyCheckedIn ? 'Entrada já registrada' : 'Entrada registrada'}</strong>
      <p>Protocolo: {result.protocol}</p>
      <p>Horário: {new Date(result.checkedInAt).toLocaleString('pt-BR')}</p>
    </section>}
  </main>;
}
