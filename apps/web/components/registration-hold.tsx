'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import styles from './registration-hold.module.css';

const OPTIONS = [15, 20, 30, 45, 60] as const;

type HoldSetting = { minutes: number; options: number[]; suggestedMinutes: number };

export default function RegistrationHold({ eventId }: { eventId: string }) {
  const [minutes, setMinutes] = useState<number>(20);
  const [saved, setSaved] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api<HoldSetting>(`/events/${encodeURIComponent(eventId)}/registration-hold`)
      .then((result) => {
        if (!active) return;
        setMinutes(result.minutes);
        setSaved(result.minutes);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o tempo da reserva.');
      });
    return () => { active = false; };
  }, [eventId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{ minutes: number }>(`/events/${encodeURIComponent(eventId)}/registration-hold`, {
        method: 'PUT',
        body: JSON.stringify({ minutes }),
      });
      setMinutes(result.minutes);
      setSaved(result.minutes);
      setNotice(`A vaga paga fica reservada por ${result.minutes} minutos.`);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o tempo da reserva.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="registration-hold-title">
      <p className={styles.eyebrow}>Inscrição paga</p>
      <h2 id="registration-hold-title">Tempo para concluir a compra</h2>
      <p>
        Depois que a pessoa envia a ficha, a vaga paga fica reservada por este tempo.
        Sem um valor salvo, o evento usa 20 minutos. Quinze minutos é a referência sugerida.
      </p>
      {saved !== null ? <p>Em uso agora: {saved} minutos.</p> : null}
      <form className={styles.form} onSubmit={onSubmit}>
        <fieldset className={styles.choices}>
          <legend>Minutos da reserva</legend>
          {OPTIONS.map((option) => (
            <label key={option} className={styles.choice}>
              <input
                type="radio"
                name="hold-minutes"
                value={option}
                checked={minutes === option}
                onChange={() => setMinutes(option)}
              />
              <span>{option === 15 ? '15 minutos, padrão sugerido' : `${option} minutos`}</span>
            </label>
          ))}
        </fieldset>
        <button className={styles.primary} type="submit" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar tempo da reserva'}
        </button>
      </form>
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
