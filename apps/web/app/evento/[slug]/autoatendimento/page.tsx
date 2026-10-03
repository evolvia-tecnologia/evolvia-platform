'use client';

import { FormEvent, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../../lib/api';
import styles from './page.module.css';

type Outcome = { outcome: 'entered' | 'already'; name: string };

export default function SelfCheckInPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await api<Outcome>(`/public/events/${encodeURIComponent(slug)}/self-check-in`, {
        method: 'POST', body: JSON.stringify({ code: code.trim() }),
      });
      setMessage(result.outcome === 'already'
        ? `${result.name}, sua entrada já estava registrada.`
        : `${result.name}, entrada registrada. Pode seguir.`);
      setCode('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível registrar a entrada.');
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return <main className={styles.page}>
    <p className={styles.eyebrow}>AUTOATENDIMENTO</p>
    <h1>Registre sua entrada</h1>
    <p>Aponte o leitor para o QR da sua credencial ou cole o código. O protocolo da inscrição não registra a entrada.</p>
    <form onSubmit={submit}>
      <label htmlFor="self-credential-code">Código da credencial
        <input id="self-credential-code" ref={inputRef} value={code} autoFocus autoComplete="off" spellCheck={false} required onChange={(event) => setCode(event.target.value)} />
      </label>
      <button type="submit" disabled={busy}>{busy ? 'Registrando…' : 'Registrar minha entrada'}</button>
    </form>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.ok} role="status">{message}</p>}
  </main>;
}
