'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { eventReuseClientIssue, eventReuseInstant, eventReuseLocalValue } from '../lib/event-reuse';
import styles from './event-reuse.module.css';

type SourcePayload = { event: { name: string }; answers: { timeZone?: string; startDate?: string | null; endDate?: string | null; venue?: string | null; capabilities?: string[] } };
type ReuseResult = { event: { id: string; name: string }; replay: boolean; exclusions: string[] };

function createReuseKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return `reuse:${globalThis.crypto.randomUUID()}`;
  if (typeof globalThis.crypto?.getRandomValues !== 'function') return '';
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `reuse:${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`;
}
export default function EventReuse({ eventId }: { eventId: string }) {
  return <EventReuseForm key={eventId} eventId={eventId} />;
}

function EventReuseForm({ eventId }: { eventId: string }) {
  const [source, setSource] = useState<SourcePayload | null>(null);
  const [name, setName] = useState('');
  const [confirmationName, setConfirmationName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [timeZone, setTimeZone] = useState('America/Sao_Paulo');
  const [copyVenue, setCopyVenue] = useState(true);
  const [copyCapabilities, setCopyCapabilities] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<ReuseResult | null>(null);
  const key = useRef<string>('');
  const mounted = useRef(false);
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    api<SourcePayload>(`/event-wizard/${eventId}`)
      .then((payload) => {
        if (!active) return;
        setSource(payload);
        const zone = payload.answers.timeZone || 'America/Sao_Paulo';
        setTimeZone(zone);
        setStartDate(eventReuseLocalValue(payload.answers.startDate, zone));
        setEndDate(eventReuseLocalValue(payload.answers.endDate, zone));
      })
      .catch((reason) => {
        if (active) setMessage(reason instanceof ApiError ? reason.message : 'Não foi possível carregar o evento.');
      });
    return () => { active = false; mounted.current = false; };
  }, [eventId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !mounted.current || !source) return;
    const draft = { name, confirmationName, startDate, endDate, timeZone };
    const issue = eventReuseClientIssue(draft);
    if (issue) { setMessage(issue); return; }
    if (confirmationName.trim() !== source.event.name) {
      setMessage('Digite exatamente o nome do evento de origem para confirmar.');
      return;
    }
    if (!key.current) {
      key.current = createReuseKey();
      if (!key.current) {
        setMessage('Não foi possível criar uma chave segura. Use uma conexão segura e tente novamente.');
        return;
      }
    }
    submitting.current = true;
    setPending(true);
    setMessage('');
    try {
      const response = await api<ReuseResult>(`/events/${eventId}/reuse`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key.current },
        body: JSON.stringify({
          name: name.trim(),
          confirmationName: confirmationName.trim(),
          startDate: eventReuseInstant(startDate, timeZone),
          endDate: eventReuseInstant(endDate, timeZone),
          timeZone,
          copyVenue,
          copyCapabilities,
        }),
      });
      if (mounted.current) setResult(response);
    } catch (reason) {
      if (mounted.current) setMessage(reason instanceof ApiError ? reason.message : 'Não foi possível reutilizar o evento.');
    } finally {
      submitting.current = false;
      if (mounted.current) setPending(false);
    }
  }

  if (result) return <main className={styles.page}>
    <section className={styles.card} aria-labelledby="reuse-success-title">
      <p className={styles.eyebrow}>NOVO RASCUNHO</p>
      <h1 id="reuse-success-title">{result.event.name} foi criado</h1>
      <p>{result.replay ? 'A resposta segura da tentativa anterior foi recuperada.' : 'A fundação foi reutilizada sem copiar dados operacionais.'}</p>
      <Link className={styles.primary} href={`/eventos/${result.event.id}/painel`}>Abrir novo evento</Link>
    </section>
  </main>;

  return <main className={styles.page}>
    <div className={styles.heading}>
      <div><p className={styles.eyebrow}>REUTILIZAÇÃO SEGURA</p><h1>Usar este evento como base</h1></div>
      <Link className={styles.secondary} href={`/eventos/${eventId}/painel`}>Voltar ao painel</Link>
    </div>
    <section className={styles.notice} aria-labelledby="reuse-boundary-title">
      <h2 id="reuse-boundary-title">Somente a fundação será reaproveitada</h2>
      <p>Participantes, cobranças, trabalhos, pessoas, arquivos, credenciais e publicações não serão copiados.</p>
    </section>
    <form className={styles.card} onSubmit={submit} aria-busy={pending}>
      <label>Nome do novo evento<input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required /></label>
      <div className={styles.grid}>
        <label>Início<input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} required /></label>
        <label>Término<input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} required /></label>
      </div>
      <p>Início e término usam o fuso horário do evento informado abaixo.</p>
      <label>Fuso horário<input value={timeZone} onChange={(e) => setTimeZone(e.target.value)} required /></label>
      <fieldset><legend>O que reaproveitar</legend>
        <label className={styles.check}><input type="checkbox" checked={copyVenue} onChange={(e) => setCopyVenue(e.target.checked)} /> Local do evento</label>
        <label className={styles.check}><input type="checkbox" checked={copyCapabilities} onChange={(e) => setCopyCapabilities(e.target.checked)} /> Seleção de recursos (sem configurações e segredos)</label>
      </fieldset>
      <label>Para confirmar, digite exatamente “{source?.event.name || 'nome do evento'}”
        <input value={confirmationName} onChange={(e) => setConfirmationName(e.target.value)} required autoComplete="off" />
      </label>
      {message && <p className={styles.error} role="alert">{message}</p>}
      <button className={styles.primary} type="submit" disabled={pending || !source}>{pending ? 'Criando rascunho...' : 'Criar novo rascunho'}</button>
    </form>
  </main>;
}

