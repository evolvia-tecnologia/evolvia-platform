'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import styles from './registration-notice.module.css';

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch { /* contexto sem HTTPS */ }
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

type NoticeSetting = {
  configured: boolean;
  limit: number;
  categories: { id: string; name: string }[];
};

type NoticeResult = {
  delivered: number;
  failed: number;
  skipped: number;
  remaining: number;
  continuationCursor: string | null;
};

export default function RegistrationNotice({ eventId }: { eventId: string }) {
  const [setting, setSetting] = useState<NoticeSetting | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [presence, setPresence] = useState('');
  const [scientificResult, setScientificResult] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey);
  const [directProtocol, setDirectProtocol] = useState('');
  const [directSubject, setDirectSubject] = useState('');
  const [directMessage, setDirectMessage] = useState('');
  const [directBusy, setDirectBusy] = useState(false);
  const [directNotice, setDirectNotice] = useState('');
  const [directError, setDirectError] = useState('');
  const [directKey, setDirectKey] = useState(generateIdempotencyKey);

  useEffect(() => {
    let active = true;
    api<NoticeSetting>(`/events/${encodeURIComponent(eventId)}/registration-notices`)
      .then((result) => { if (active) setSetting(result); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os avisos.');
      });
    return () => { active = false; };
  }, [eventId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<NoticeResult>(`/events/${encodeURIComponent(eventId)}/registration-notices`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          subject,
          body: message,
          categoryId: categoryId || null,
          continuationCursor: cursor,
          presence: presence || null,
          scientificResult: scientificResult || null,
        }),
      });
      setCursor(result.continuationCursor);
      setIdempotencyKey(generateIdempotencyKey());
      const pending = result.remaining > 0 ? ` Ainda faltam ${result.remaining} confirmados.` : '';
      setNotice(`O aviso foi aceito para ${result.delivered} pessoas. ${result.failed} falharam e ${result.skipped} ficaram sem e-mail válido.${pending}`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar o aviso.');
    } finally {
      setBusy(false);
    }
  }

  async function onDirect(event: FormEvent) {
    event.preventDefault();
    setDirectBusy(true);
    setDirectError('');
    setDirectNotice('');
    try {
      const result = await api<Pick<NoticeResult, 'delivered' | 'failed' | 'skipped'>>(`/events/${encodeURIComponent(eventId)}/registration-notices/direct`, {
        method: 'POST',
        headers: { 'Idempotency-Key': directKey },
        body: JSON.stringify({
          protocol: directProtocol.trim(),
          subject: directSubject,
          body: directMessage,
        }),
      });
      setDirectKey(generateIdempotencyKey());
      setDirectProtocol('');
      if (result.delivered > 0) setDirectNotice('O recado foi aceito para esta inscrição.');
      else if (result.skipped > 0) setDirectNotice('Esta inscrição confirmada não tem e-mail válido. Nada foi enviado.');
      else setDirectNotice('O recado não foi aceito pelo canal.');
    } catch (reason: unknown) {
      setDirectError(reason instanceof Error ? reason.message : 'Não foi possível enviar o recado.');
    } finally {
      setDirectBusy(false);
    }
  }

  const batchLocked = busy || cursor !== null;
  const channelClosed = !setting || setting.configured === false;

  return (
    <>
    <section className={styles.panel} aria-labelledby="registration-notice-title">
      <h2 id="registration-notice-title">Aviso para confirmados</h2>
      <p>
        A mensagem vai só para inscrições confirmadas deste evento, no máximo {setting?.limit ?? 40} por envio.
        Os endereços não aparecem aqui. Sem o canal HTTPS configurado, nada é entregue.
        Também dá para enviar um recado a uma inscrição confirmada pelo protocolo.
        Presentes e ausentes usam o dia de hoje no fuso do evento. Presença estornada conta como ausência.
        O resultado usa a decisão da comissão.
      </p>
      {setting && !setting.configured ? <p role="status">O envio de avisos ainda não está configurado.</p> : null}
      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.field}>
          Assunto
          <input value={subject} maxLength={120} required disabled={batchLocked} onChange={(event) => setSubject(event.target.value)} />
        </label>
        <label className={styles.field}>
          Mensagem
          <textarea value={message} maxLength={800} required rows={6} disabled={batchLocked} onChange={(event) => setMessage(event.target.value)} />
        </label>
        <label className={styles.field}>
          Quem recebe
          <select value={categoryId} disabled={batchLocked} onChange={(event) => { setCategoryId(event.target.value); setCursor(null); }}>
            <option value="">Todos os confirmados</option>
            {setting?.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          Presença do dia
          <select value={presence} disabled={batchLocked} onChange={(event) => { setPresence(event.target.value); setCursor(null); }}>
            <option value="">Todas</option>
            <option value="PRESENT">Presentes hoje</option>
            <option value="ABSENT">Ausentes hoje</option>
          </select>
        </label>
        <label className={styles.field}>
          Resultado científico
          <select value={scientificResult} disabled={batchLocked} onChange={(event) => { setScientificResult(event.target.value); setCursor(null); }}>
            <option value="">Todos</option>
            <option value="ACCEPTED">Aceito</option>
            <option value="ACCEPTED_WITH_CHANGES">Aceito com alterações</option>
            <option value="REJECTED">Recusado</option>
          </select>
        </label>
        {cursor ? <p>O próximo lote usa o mesmo texto e o mesmo filtro. Começar outro aviso abandona o restante deste envio.</p> : null}
        <div className={styles.actions}>
          <button className={styles.primary} type="submit" disabled={busy || channelClosed}>
            {busy ? 'Enviando…' : cursor ? 'Enviar o próximo lote' : 'Enviar aviso'}
          </button>
          {cursor ? <button className={styles.secondary} type="button" disabled={busy} onClick={() => { setCursor(null); setIdempotencyKey(generateIdempotencyKey()); }}>Começar outro aviso</button> : null}
        </div>
      </form>
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
    <section className={styles.panel} aria-labelledby="registration-direct-title">
      <h2 id="registration-direct-title">Recado para uma inscrição</h2>
      <p>Vale só para uma inscrição confirmada deste evento, pelo protocolo. O endereço não aparece.</p>
      <form className={styles.form} onSubmit={onDirect}>
        <label className={styles.field}>
          Protocolo da inscrição
          <input value={directProtocol} maxLength={20} required autoComplete="off" spellCheck={false} disabled={directBusy} onChange={(event) => setDirectProtocol(event.target.value.toUpperCase())} />
        </label>
        <label className={styles.field}>
          Assunto
          <input value={directSubject} maxLength={120} required disabled={directBusy} onChange={(event) => setDirectSubject(event.target.value)} />
        </label>
        <label className={styles.field}>
          Mensagem
          <textarea value={directMessage} maxLength={800} required rows={4} disabled={directBusy} onChange={(event) => setDirectMessage(event.target.value)} />
        </label>
        <button className={styles.primary} type="submit" disabled={directBusy || channelClosed}>
          {directBusy ? 'Enviando…' : 'Enviar recado'}
        </button>
      </form>
      {directNotice ? <p role="status">{directNotice}</p> : null}
      {directError ? <p role="alert">{directError}</p> : null}
    </section>
    </>
  );
}
