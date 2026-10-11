'use client';

import { useCallback, useEffect, useState } from 'react';
import { agendaDateLabel, agendaHour } from '../lib/scientific-program-agenda';
import { api } from '../lib/api';
import styles from './activity-enrollment-limit.module.css';

type Preference = {
  id: string;
  activityTitle: string;
  startAt: string;
  endAt: string;
  spaceName: string | null;
  participantName: string;
  requestedAt: string;
};
type PreferenceView = { timeZone: string | null; truncated: boolean; preferences: Preference[] };

export default function ActivityPreferences({ eventId }: { eventId: string }) {
  const [view, setView] = useState<PreferenceView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    if (!eventId) return () => undefined;
    let active = true;
    api<PreferenceView>(`/events/${encodeURIComponent(eventId)}/activity-preferences`)
      .then((result) => { if (active) setView(result); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as preferências.');
      });
    return () => { active = false; };
  }, [eventId]);

  useEffect(() => load(), [load]);

  async function decide(id: string, decision: 'confirm' | 'decline') {
    setBusy(id);
    setError('');
    try {
      const result = await api<PreferenceView>(`/events/${encodeURIComponent(eventId)}/activity-preferences/${encodeURIComponent(id)}/${decision}`, { method: 'POST' });
      setView(result);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar a preferência.');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="activity-preferences-title">
      <h2 id="activity-preferences-title">Preferências aguardando confirmação</h2>
      <p>Confirmar reserva a vaga. Recusar devolve a preferência sem ocupar o lugar. A lista não mostra e-mail nem documento.</p>
      {!view && !error ? <p role="status">Carregando preferências…</p> : null}
      {view && view.preferences.length === 0 ? <p>Nenhuma preferência está aguardando confirmação.</p> : null}
      {view && view.truncated ? <p>Há mais preferências do que esta lista mostra. Confirme as primeiras e atualize a página.</p> : null}
      {view && view.preferences.length > 0 ? (
        <ul className={styles.list}>
          {view.preferences.map((item) => {
            const zone = view.timeZone ?? 'UTC';
            const when = `${agendaDateLabel(item.startAt, zone)} · ${agendaHour(item.startAt, zone)}–${agendaHour(item.endAt, zone)}`;
            return (
              <li key={item.id}>
                <strong>{item.participantName}</strong>
                <span>{item.activityTitle} · {when}{item.spaceName ? ` · ${item.spaceName}` : ''}</span>
                <div className={styles.actions}>
                  <button className={styles.primary} type="button" disabled={Boolean(busy)} onClick={() => void decide(item.id, 'confirm')}>
                    {busy === item.id ? 'Confirmando…' : 'Confirmar horário'}
                  </button>
                  <button className={styles.secondary} type="button" disabled={Boolean(busy)} onClick={() => void decide(item.id, 'decline')}>
                    Recusar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
