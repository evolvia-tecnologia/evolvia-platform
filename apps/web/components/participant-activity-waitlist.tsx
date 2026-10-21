'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import styles from './activity-waitlist.module.css';

type Waiting = { activityId: string; title: string; startAt: string; endAt: string; spaceName: string | null; queuedAt: string; position: number | null };
type Full = { activityId: string; title: string; startAt: string; endAt: string; spaceName: string | null; canJoin: boolean; reason: string | null };
type View = { timeZone: string; waiting: Waiting[]; full: Full[] };

export default function ParticipantActivityWaitlist({ slug }: { slug: string }) {
  return <ScopedParticipantActivityWaitlist key={slug} slug={slug} />;
}

function ScopedParticipantActivityWaitlist({ slug }: { slug: string }) {
  const [protocol, setProtocol] = useState('');
  const [identityDocument, setIdentityDocument] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const snapshot = useRef(0);

  useEffect(() => {
    if (!slug || !token) return;
    const ticket = snapshot.current;
    const controller = new AbortController();
    fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/activity-waitlist`, {
      cache: 'no-store',
      headers: { authorization: `Bearer ${token}` },
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await readBody<View>(response, 'Não foi possível carregar a fila.');
      if (ticket !== snapshot.current) return;
      if (!response.ok) throw new Error(payload.message);
      setView(payload);
    }).catch((caught: unknown) => {
      if (ticket !== snapshot.current || controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : 'Não foi possível carregar a fila.');
    });
    return () => controller.abort();
  }, [slug, token]);

  async function enter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slug || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ protocol, identityDocument }),
      });
      const session = await readBody<{ accessToken?: string }>(response, 'Não foi possível entrar.');
      if (!response.ok || !session.accessToken) throw new Error(session.message);
      setToken(session.accessToken);
      setIdentityDocument('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  }

  async function change(activityId: string, method: 'POST' | 'DELETE') {
    if (!slug || !token || busy) return;
    const ticket = snapshot.current + 1;
    snapshot.current = ticket;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const response = await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/activity-waitlist/${encodeURIComponent(activityId)}`, {
        method,
        headers: { authorization: `Bearer ${token}` },
      });
      const payload = await readBody<View>(response, 'Não foi possível atualizar a fila.');
      if (ticket !== snapshot.current) return;
      if (!response.ok) throw new Error(payload.message);
      setView(payload);
      setStatus(method === 'POST' ? 'Você entrou no fim da fila.' : 'Você saiu da fila.');
    } catch (caught) {
      if (ticket !== snapshot.current) return;
      setError(caught instanceof Error ? caught.message : 'Não foi possível atualizar a fila.');
    } finally {
      if (ticket === snapshot.current) setBusy(false);
    }
  }

  function leaveSession() {
    snapshot.current += 1;
    setToken(null);
    setView(null);
    setProtocol('');
    setStatus('');
    setError('');
    setBusy(false);
  }

  if (!token) {
    return <main className={styles.page}>
      <section className={styles.card} aria-labelledby="waitlist-access-title">
        <Link className={styles.back} href={`/evento/${encodeURIComponent(slug)}`}>← Voltar ao evento</Link>
        <p className={styles.eyebrow}>FILA DA ATIVIDADE</p>
        <h1 id="waitlist-access-title">Entrar na fila de uma atividade</h1>
        <p>Use o código da inscrição confirmada e o mesmo documento da ficha. A fila não confirma vaga e não gera pagamento.</p>
        <form onSubmit={enter} className={styles.form}>
          <label>Código da inscrição<input type="text" autoComplete="off" required maxLength={20} value={protocol} onChange={(event) => setProtocol(event.target.value.toUpperCase())} /></label>
          <label>CPF ou documento estrangeiro<input type="text" autoComplete="off" required maxLength={50} value={identityDocument} onChange={(event) => setIdentityDocument(event.target.value)} /></label>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <button type="submit" disabled={busy || !slug}>{busy ? 'Validando…' : 'Entrar'}</button>
        </form>
        <p className={styles.privacy}>O documento é usado somente para validar o acesso e não fica gravado nesta tela.</p>
      </section>
    </main>;
  }

  return <main className={styles.page}>
    <section className={styles.card} aria-labelledby="waitlist-title">
      <p className={styles.eyebrow}>FILA DA ATIVIDADE</p>
      <h1 id="waitlist-title">Atividades sem vaga</h1>
      <p>Entrar na fila não segura a vaga. A organização escolhe quem entra quando ela abre. Se você sair e voltar, entra no fim.</p>
      {!view && !error && <p>Carregando a fila…</p>}
      {view && <section aria-labelledby="my-queue-title">
        <h2 id="my-queue-title">Sua fila</h2>
        {view.waiting.length === 0 && <p>Você não está em nenhuma fila.</p>}
        <ul className={styles.list}>
          {view.waiting.map((item) => <li key={item.activityId} className={styles.activity}>
            <h3>{item.title}</h3>
            <p>{when(item.startAt, view.timeZone)} – {when(item.endAt, view.timeZone)}{item.spaceName ? ` · ${item.spaceName}` : ''}</p>
            <p>{item.position !== null ? `Posição ${item.position}` : 'Posição ainda não calculada'} · entrou em {when(item.queuedAt, view.timeZone)}</p>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => void change(item.activityId, 'DELETE')}>Sair da fila</button>
          </li>)}
        </ul>
      </section>}
      {view && <section aria-labelledby="full-title">
        <h2 id="full-title">Sem vaga agora</h2>
        {view.full.length === 0 && <p>Nenhuma outra atividade publicada está sem vaga.</p>}
        <ul className={styles.list}>
          {view.full.map((item) => <li key={item.activityId} className={styles.activity}>
            <h3>{item.title}</h3>
            <p>{when(item.startAt, view.timeZone)} – {when(item.endAt, view.timeZone)}{item.spaceName ? ` · ${item.spaceName}` : ''}</p>
            {item.reason && <p>{item.reason}</p>}
            {item.canJoin && <button type="button" disabled={busy} onClick={() => void change(item.activityId, 'POST')}>Entrar na fila</button>}
          </li>)}
        </ul>
      </section>}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <Link className={`${styles.textLink} ${styles.secondary}`} href={`/evento/${encodeURIComponent(slug)}/participante`}>Área da inscrição</Link>
        <button type="button" className={styles.secondary} onClick={leaveSession}>Sair com segurança</button>
      </div>
    </section>
  </main>;
}

async function readBody<T>(response: Response, fallback: string): Promise<T & { message: string }> {
  const body = await response.json().catch(() => ({})) as { message?: string | string[]; error?: { message?: string } };
  const raw = body.error?.message ?? body.message;
  const message = Array.isArray(raw) ? raw.filter(Boolean).join(' ') : raw || fallback;
  return { ...(body as T), message };
}

function when(iso: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
  }
}
