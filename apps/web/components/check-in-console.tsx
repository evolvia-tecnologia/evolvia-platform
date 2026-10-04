'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './check-in-console.module.css';

type Result = { protocol: string; checkedInAt: string; alreadyCheckedIn: boolean };

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
}

export default function CheckInConsole({ eventId, embedded = false }: { eventId: string; embedded?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(false);
  const requestVersionRef = useRef(0);
  const [trackedEventId, setTrackedEventId] = useState(eventId);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');

  if (trackedEventId !== eventId) {
    setTrackedEventId(eventId);
    setCode('');
    setBusy(false);
    setResult(null);
    setError('');
  }

  useEffect(() => {
    pendingRef.current = false;
    return () => { requestVersionRef.current += 1; };
  }, [eventId]);
  useEffect(() => { if (!busy) inputRef.current?.focus(); }, [eventId, busy]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eventId || pendingRef.current) return;
    if (!getToken()) { window.location.assign('/login'); return; }
    pendingRef.current = true;
    const requestVersion = ++requestVersionRef.current;
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await api<Result>(`/events/${encodeURIComponent(eventId)}/check-in`, {
        method: 'POST', body: JSON.stringify({ code: code.trim() }),
      });
      if (requestVersion !== requestVersionRef.current) return;
      setResult(response); setCode('');
    } catch (caught) {
      if (requestVersion !== requestVersionRef.current) return;
      setError(caught instanceof Error ? caught.message : 'Não foi possível registrar a entrada.');
    } finally {
      if (requestVersion === requestVersionRef.current) {
        pendingRef.current = false;
        setBusy(false);
      }
    }
  }

  function clearCode() {
    setCode('');
    setError('');
    inputRef.current?.focus();
  }

  return <main className={styles.page}>
    {!embedded && <header className={styles.header}>
      <p className={styles.eyebrow}>OPERAÇÃO DO EVENTO</p>
      <h1>Credenciamento e check-in</h1>
      <p>Use esta tela na entrada. O leitor óptico lê o QR Code ou o código de barras da etiqueta.</p>
    </header>}

    <div className={styles.layout}>
      <form className={styles.desk} onSubmit={submit}>
        <label htmlFor="credential-code">Código da credencial
          <input
            id="credential-code"
            ref={inputRef}
            autoComplete="off"
            spellCheck={false}
            required
            disabled={busy}
            aria-invalid={error ? true : undefined}
            aria-describedby="credential-code-help"
            placeholder="QR Code ou código de barras"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
        <p id="credential-code-help">O leitor pode preencher o campo e enviar Enter. O campo volta ao foco depois de cada pessoa.</p>
        <div className={styles.actions}>
          <button type="submit" disabled={busy || !eventId}>{busy ? 'Registrando…' : 'Registrar entrada'}</button>
          <button type="button" className={styles.secondary} onClick={clearCode} disabled={busy || !code}>Limpar</button>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {result && <section className={styles.result} data-state={result.alreadyCheckedIn ? 'repeat' : 'ok'} role="status" aria-live="polite">
          <strong>{result.alreadyCheckedIn ? 'Entrada já registrada' : 'Entrada registrada'}</strong>
          <dl>
            <div><dt>Protocolo da inscrição</dt><dd>{result.protocol}</dd></div>
            <div><dt>Horário da entrada</dt><dd><time dateTime={result.checkedInAt}>{formatWhen(result.checkedInAt)}</time></dd></div>
          </dl>
          <p>{result.alreadyCheckedIn ? 'Esta pessoa já entrou. Confira o horário antes de liberar de novo.' : 'Entrada confirmada. O campo está pronto para a próxima pessoa.'}</p>
        </section>}
      </form>

      <aside className={styles.guidance} aria-label="Como registrar a entrada">
        <p className={styles.notice}>O protocolo da inscrição não registra a entrada. Apenas inscrições confirmadas deste evento publicado podem entrar.</p>
        <ol>
          <li>Aponte o leitor óptico para o QR Code ou para o código de barras da etiqueta.</li>
          <li>Confirme a entrada. O protocolo da inscrição, sozinho, não serve.</li>
          <li>Siga para a próxima pessoa. Quem não tiver a etiqueta pode ser encontrado na busca do posto.</li>
        </ol>
        {eventId && <Link href={`/eventos/${eventId}/painel/inscricoes`}>Consultar inscrições recebidas</Link>}
      </aside>
    </div>
  </main>;
}

