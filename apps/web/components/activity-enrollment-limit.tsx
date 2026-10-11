'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import styles from './activity-enrollment-limit.module.css';

type LimitView = { configured: boolean; max: number | null; confirmByOrganization?: boolean };

export default function ActivityEnrollmentLimit({ eventId }: { eventId: string }) {
  const [view, setView] = useState<LimitView | null>(null);
  const [unlimited, setUnlimited] = useState(true);
  const [max, setMax] = useState('1');
  const [confirmByOrganization, setConfirmByOrganization] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api<LimitView>(`/events/${encodeURIComponent(eventId)}/activity-enrollment-limit`)
      .then((result) => {
        if (!active) return;
        setView(result);
        setUnlimited(result.max === null);
        setMax(result.max === null ? '1' : String(result.max));
        setConfirmByOrganization(result.confirmByOrganization === true);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o limite.');
      });
    return () => { active = false; };
  }, [eventId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<LimitView>(`/events/${encodeURIComponent(eventId)}/activity-enrollment-limit`, {
        method: 'PUT',
        body: JSON.stringify({ max: unlimited ? null : Number(max), confirmByOrganization }),
      });
      setView(result);
      setUnlimited(result.max === null);
      setMax(result.max === null ? '1' : String(result.max));
      setConfirmByOrganization(result.confirmByOrganization === true);
      setNotice(result.confirmByOrganization
        ? 'A preferência fica aguardando a confirmação da organização.'
        : 'O limite foi gravado. A pessoa continua reservando só atividades publicadas com vaga.');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível gravar o limite.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="activity-limit-title">
      <h2 id="activity-limit-title">Limite por inscrição</h2>
      <p>
        O número conta as vagas que a própria pessoa reservou. Atividade em que ela apresenta não entra nessa conta.
        Sem limite gravado, a reserva segue só pela vaga e pelo horário.
      </p>
      {view && !view.configured ? <p role="status">Ainda não há limite gravado.</p> : null}
      <form className={styles.form} onSubmit={onSubmit}>
        <fieldset className={styles.choices} disabled={busy || !view}>
          <legend>Como a pessoa reserva atividades</legend>
          <label><input type="radio" name="enrollment-limit" checked={unlimited} onChange={() => setUnlimited(true)} /> Sem limite adicional</label>
          <label><input type="radio" name="enrollment-limit" checked={!unlimited} onChange={() => setUnlimited(false)} /> Limitar a quantidade</label>
        </fieldset>
        <label className={styles.choice}>
          <input type="checkbox" checked={confirmByOrganization} disabled={busy || !view} onChange={(event) => setConfirmByOrganization(event.target.checked)} />
          A organização confirma o horário
        </label>
        {!unlimited ? (
          <label className={styles.field}>
            Quantidade máxima
            <input value={max} inputMode="numeric" min={1} max={20} step={1} required disabled={busy || !view} onChange={(event) => setMax(event.target.value)} />
          </label>
        ) : null}
        <button className={styles.primary} type="submit" disabled={busy || !view}>
          {busy ? 'Gravando…' : 'Gravar limite'}
        </button>
      </form>
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
