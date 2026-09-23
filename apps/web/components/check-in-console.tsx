'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, getToken } from '../lib/api';

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
      inputRef.current?.focus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível registrar a entrada.');
    } finally { setBusy(false); }
  }

  return <main style={{ maxWidth: 680, margin: '3rem auto', padding: '1.5rem' }}>
    <Link href={`/eventos/${eventId}/painel`}>← Voltar ao painel do evento</Link>
    <h1>Credenciamento e check-in</h1>
    <p>Leia o QR da credencial com um leitor que digita o código, ou informe o código manualmente. Apenas inscrições confirmadas deste evento podem entrar.</p>
    <form onSubmit={submit}>
      <label htmlFor="credential-code">Código da credencial</label>
      <input id="credential-code" ref={inputRef} autoComplete="off" spellCheck={false} required
        value={code} onChange={(event) => setCode(event.target.value)} style={{ display: 'block', width: '100%', padding: '0.8rem', margin: '0.75rem 0' }} />
      <button type="submit" disabled={busy}>{busy ? 'Registrando…' : 'Registrar entrada'}</button>
    </form>
    {error && <p role="alert" style={{ color: '#9b2226' }}>{error}</p>}
    {result && <section role="status" aria-live="polite" style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid currentColor' }}>
      <strong>{result.alreadyCheckedIn ? 'Entrada já registrada' : 'Entrada registrada'}</strong>
      <p>Protocolo: {result.protocol}</p>
      <p>Horário: {new Date(result.checkedInAt).toLocaleString('pt-BR')}</p>
    </section>}
  </main>;
}
