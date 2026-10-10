'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import styles from './registration-notice.module.css';

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
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

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
      setIdempotencyKey(crypto.randomUUID());
      const pending = result.remaining > 0 ? ` Ainda faltam ${result.remaining} confirmados.` : '';
      setNotice(`O aviso foi aceito para ${result.delivered} pessoas. ${result.failed} falharam e ${result.skipped} ficaram sem e-mail válido.${pending}`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar o aviso.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="registration-notice-title">
      <h2 id="registration-notice-title">Aviso para confirmados</h2>
      <p>
        A mensagem vai só para inscrições confirmadas deste evento, no máximo {setting?.limit ?? 40} por envio.
        Os endereços não aparecem aqui. Sem o canal HTTPS configurado, nada é entregue.
      </p>
      {setting && !setting.configured ? <p role="status">O envio de avisos ainda não está configurado.</p> : null}
      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.field}>
          Assunto
          <input value={subject} maxLength={120} required onChange={(event) => setSubject(event.target.value)} />
        </label>
        <label className={styles.field}>
          Mensagem
          <textarea value={message} maxLength={800} required rows={6} onChange={(event) => setMessage(event.target.value)} />
        </label>
        <label className={styles.field}>
          Quem recebe
          <select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setCursor(null); }}>
            <option value="">Todos os confirmados</option>
            {setting?.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          Presença do dia
          <select value={presence} onChange={(event) => { setPresence(event.target.value); setCursor(null); }}>
            <option value="">Todas</option>
            <option value="PRESENT">Presentes hoje</option>
            <option value="ABSENT">Ausentes hoje</option>
          </select>
        </label>
        <label className={styles.field}>
          Resultado científico
          <select value={scientificResult} onChange={(event) => { setScientificResult(event.target.value); setCursor(null); }}>
            <option value="">Todos</option>
            <option value="ACCEPTED">Aceito</option>
            <option value="ACCEPTED_WITH_CHANGES">Aceito com alterações</option>
            <option value="REJECTED">Recusado</option>
          </select>
        </label>
        <p>Presentes e ausentes usam o dia de hoje no fuso do evento. Presença estornada conta como ausência. O resultado usa a decisão da comissão.</p>
        <button className={styles.primary} type="submit" disabled={busy || setting?.configured === false}>
          {busy ? 'Enviando…' : cursor ? 'Enviar o próximo lote' : 'Enviar aviso'}
        </button>
      </form>
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
