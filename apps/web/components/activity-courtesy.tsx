'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import styles from './activity-enrollment-limit.module.css';

type CourtesyActivity = {
  activityId: string;
  title: string;
  courtesyQuota: number;
  courtesyUsed: number;
  courtesyLimit: number;
  publicRemaining: number;
};
type CourtesyView = { activities: CourtesyActivity[] };

export default function ActivityCourtesy({ eventId }: { eventId: string }) {
  const [view, setView] = useState<CourtesyView | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    api<CourtesyView>(`/events/${encodeURIComponent(eventId)}/activity-courtesy`)
      .then((result) => {
        if (!active) return;
        setView(result);
        setCounts(Object.fromEntries(result.activities.map((item) => [item.activityId, String(item.courtesyQuota)])));
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as cortesias.');
      });
    return () => { active = false; };
  }, [eventId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!view || !eventId) return;
    setBusy(true);
    setError('');
    setNotice('');
    const quotas = view.activities.map((item) => ({ activityId: item.activityId, count: Number(counts[item.activityId] ?? 0) }));
    if (quotas.some((item, index) => !Number.isInteger(item.count) || item.count < view.activities[index].courtesyUsed || item.count > view.activities[index].courtesyLimit)) {
      setError('A cortesia precisa ficar entre as já confirmadas e as vagas ainda abertas.');
      setBusy(false);
      return;
    }
    try {
      const result = await api<CourtesyView>(`/events/${encodeURIComponent(eventId)}/activity-courtesy`, {
        method: 'PUT',
        body: JSON.stringify({ quotas }),
      });
      setView(result);
      setCounts(Object.fromEntries(result.activities.map((item) => [item.activityId, String(item.courtesyQuota)])));
      setNotice('As cortesias foram gravadas. Esses lugares saem da vaga que a pessoa reserva sozinha.');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível gravar as cortesias.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="activity-courtesy-title">
      <h2 id="activity-courtesy-title">Cortesias da atividade</h2>
      <p>O número separa lugares da vaga aberta. A pessoa não ocupa esses lugares sozinha. A organização usa a cortesia ao confirmar uma preferência.</p>
      {!view && !error ? <p role="status">Carregando cortesias…</p> : null}
      {view && view.activities.length === 0 ? <p>Nenhuma atividade publicada tem vaga para separar cortesia.</p> : null}
      {view && view.activities.length > 0 ? (
        <form className={styles.form} onSubmit={onSubmit}>
          <ul className={styles.list}>
            {view.activities.map((item) => (
              <li key={item.activityId}>
                <strong>{item.title}</strong>
                <span>{item.publicRemaining} {item.publicRemaining === 1 ? 'vaga aberta' : 'vagas abertas'} · {item.courtesyUsed} já confirmadas</span>
                <label className={styles.field}>
                  Lugares de cortesia
                  <input
                    type="number"
                    value={counts[item.activityId] ?? '0'}
                    min={item.courtesyUsed}
                    max={item.courtesyLimit}
                    step={1}
                    inputMode="numeric"
                    required
                    disabled={busy}
                    onChange={(event) => setCounts((current) => ({ ...current, [item.activityId]: event.target.value }))}
                  />
                </label>
              </li>
            ))}
          </ul>
          <button className={styles.primary} type="submit" disabled={busy}>{busy ? 'Gravando…' : 'Gravar cortesias'}</button>
        </form>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
