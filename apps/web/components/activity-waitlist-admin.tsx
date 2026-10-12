'use client';

import { useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './activity-waitlist.module.css';

type Person = { id: string; participantName: string; queuedAt: string; position: number };
type ActivityQueue = {
  activityId: string;
  title: string;
  startAt: string;
  endAt: string;
  spaceName: string | null;
  published: boolean;
  remaining: number;
  hiddenCount: number;
  people: Person[];
};
type View = { timeZone: string; truncated: boolean; activities: ActivityQueue[] };

export default function ActivityWaitlistAdmin({ eventId }: { eventId: string }) {
  return <ScopedActivityWaitlistAdmin key={eventId} eventId={eventId} />;
}

function ScopedActivityWaitlistAdmin({ eventId }: { eventId: string }) {
  const [view, setView] = useState<View | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    if (!eventId) return;
    if (!getToken()) {
      setError('Entre na sua conta para ver a fila.');
      return;
    }
    let current = true;
    api<View>(`/events/${encodeURIComponent(eventId)}/activity-waitlist`).then((result) => {
      if (current) setView(result);
    }).catch(() => {
      if (current) setError('Não foi possível carregar a fila.');
    });
    return () => { current = false; };
  }, [eventId]);

  async function promote(entryId: string) {
    if (!eventId || busyId) return;
    setBusyId(entryId);
    setStatus('');
    setError('');
    try {
      const result = await api<View>(`/events/${encodeURIComponent(eventId)}/activity-waitlist/${encodeURIComponent(entryId)}/promote`, { method: 'POST' });
      setView(result);
      setStatus('Vaga confirmada na agenda.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível confirmar a vaga.');
    } finally {
      setBusyId('');
    }
  }

  return <main className={styles.page}>
    <section className={styles.card} aria-labelledby="activity-waitlist-title">
      <p className={styles.eyebrow}>ATIVIDADES</p>
      <h1 id="activity-waitlist-title">Fila das atividades</h1>
      <p>A fila não reserva a vaga e não gera pagamento. Confirmar grava a pessoa na agenda quando há vaga aberta.</p>
      {!view && !status && !error && <p>Carregando a fila…</p>}
      {view?.truncated && <p className={styles.note}>A lista mostra as primeiras 500 pessoas do evento.</p>}
      {view && view.activities.length === 0 && <p>Nenhuma atividade tem gente na fila.</p>}
      {view && view.activities.map((activity) => <article key={activity.activityId} className={styles.activity} aria-labelledby={`queue-${activity.activityId}`}>
        <h2 id={`queue-${activity.activityId}`}>{activity.title}</h2>
        <p>{when(activity.startAt, view.timeZone)} – {when(activity.endAt, view.timeZone)}{activity.spaceName ? ` · ${activity.spaceName}` : ''}</p>
        <p>{activity.published ? `${activity.remaining} vaga${activity.remaining === 1 ? '' : 's'} aberta${activity.remaining === 1 ? '' : 's'}` : 'A atividade não está publicada.'}</p>
        <ul className={styles.list}>
          {activity.people.map((person) => <li key={person.id} className={styles.person}>
            <p><strong>{person.position}. {person.participantName}</strong><br />Entrou em {when(person.queuedAt, view.timeZone)}</p>
            <button type="button" disabled={Boolean(busyId) || !activity.published || activity.remaining < 1} onClick={() => void promote(person.id)}>
              {busyId === person.id ? 'Confirmando…' : 'Dar a vaga'}
            </button>
          </li>)}
        </ul>
        {activity.hiddenCount > 0 && <p>Há mais {activity.hiddenCount} pessoas nesta atividade.</p>}
        {activity.published && activity.remaining < 1 && <p>A atividade continua sem vaga.</p>}
      </article>)}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </section>
  </main>;
}

function when(iso: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
  }
}
