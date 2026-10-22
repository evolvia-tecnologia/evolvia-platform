'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import styles from './activity-transmission.module.css';

type Kind = 'VIDEOCONFERENCE' | 'LIVE' | 'RECORDED';
type Transmission = { kind: Kind; title: string; url: string };
type Activity = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  status: 'DRAFT' | 'READY_FOR_REVIEW' | 'PUBLISHED';
  transmission: Transmission | null;
};

const kinds: Array<[Kind, string]> = [
  ['VIDEOCONFERENCE', 'Videoconferência'],
  ['LIVE', 'Vídeo ao vivo'],
  ['RECORDED', 'Vídeo gravado'],
];

const statusLabel = {
  DRAFT: 'Rascunho',
  READY_FOR_REVIEW: 'Em revisão',
  PUBLISHED: 'Publicada',
};

export default function ActivityTransmission({ eventId }: { eventId: string }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityId, setActivityId] = useState('');
  const [kind, setKind] = useState<Kind>('VIDEOCONFERENCE');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(preferredId = activityId) {
    const result = await api<{ activities: Activity[] }>(`/events/${encodeURIComponent(eventId)}/activity-transmissions`);
    const chosen = result.activities.find((item) => item.id === preferredId) ?? result.activities[0];
    setActivities(result.activities);
    setActivityId(chosen?.id ?? '');
    setKind(chosen?.transmission?.kind ?? 'VIDEOCONFERENCE');
    setTitle(chosen?.transmission?.title ?? '');
    setUrl(chosen?.transmission?.url ?? '');
  }

  useEffect(() => {
    let active = true;
    load()
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as atividades.');
      });
    return () => { active = false; };
  }, [eventId]);

  function selectActivity(id: string) {
    setActivityId(id);
    const current = activities.find((item) => item.id === id)?.transmission;
    setKind(current?.kind ?? 'VIDEOCONFERENCE');
    setTitle(current?.title ?? '');
    setUrl(current?.url ?? '');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!activityId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/events/${encodeURIComponent(eventId)}/activity-transmissions/${encodeURIComponent(activityId)}`, {
        method: 'PUT',
        body: JSON.stringify({ kind, title, url }),
      });
      await load(activityId);
      setNotice('Link da atividade salvo. Só quem está nessa atividade e com inscrição confirmada vê o endereço.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o link da atividade.');
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/events/${encodeURIComponent(eventId)}/activity-transmissions/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: false }),
      });
      await load(id === activityId ? '' : activityId);
      setNotice('Link removido desta atividade.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível remover o link da atividade.');
    } finally { setBusy(false); }
  }

  const previewReady = title.trim().length >= 2 && url.startsWith('https://');

  return (
    <section className={styles.panel} aria-labelledby="activity-transmission-title">
      <p className={styles.eyebrow}>TRANSMISSÃO DA ATIVIDADE</p>
      <h2 id="activity-transmission-title">Um link para cada atividade</h2>
      <p>O link do evento continua acima. Aqui o inscrito confirmado vê o endereço só na atividade em que apresenta ou reservou vaga. A página pública não mostra esse link.</p>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {activities.length === 0 ? <p className={styles.empty}>Não há atividades neste evento. Crie a atividade na programação e volte aqui para colocar o link.</p> : (
        <form className={styles.form} onSubmit={(event) => { void save(event); }}>
          <label htmlFor="activity-transmission-activity">Atividade
            <select id="activity-transmission-activity" value={activityId} onChange={(event) => selectActivity(event.target.value)}>
              {activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.title}</option>)}
            </select>
          </label>
          <label htmlFor="activity-transmission-kind">Forma
            <select id="activity-transmission-kind" value={kind} onChange={(event) => setKind(event.target.value as Kind)}>
              {kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label htmlFor="activity-transmission-name">Título que o inscrito vê
            <input id="activity-transmission-name" required minLength={2} maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label htmlFor="activity-transmission-url">Link https
            <input id="activity-transmission-url" required type="url" inputMode="url" maxLength={500} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
          </label>
          <button type="submit" disabled={busy || !activityId}>{busy ? 'Salvando…' : 'Salvar link da atividade'}</button>
        </form>
      )}
      {previewReady ? (
        <div className={styles.preview}>
          <p>Assim o inscrito verá</p>
          <a href={url} target="_blank" rel="noopener noreferrer">Entrar na transmissão · {title.trim()}</a>
        </div>
      ) : null}
      <ul className={styles.list}>
        {activities.map((activity) => (
          <li key={activity.id}>
            <div>
              <strong>{activity.title}</strong>
              <span>{statusLabel[activity.status]} · {when(activity.startAt)}–{hour(activity.endAt)}</span>
            </div>
            {activity.transmission ? (
              <div className={styles.saved}>
                <a href={activity.transmission.url} target="_blank" rel="noopener noreferrer">Entrar na transmissão · {activity.transmission.title}</a>
                <button type="button" disabled={busy} onClick={() => { void remove(activity.id); }}>Remover link</button>
              </div>
            ) : <span className={styles.missing}>Sem link</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function when(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function hour(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
