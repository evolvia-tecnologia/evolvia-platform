'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import styles from './registration-lot-display.module.css';

type Mode = 'CURRENT' | 'LADDER';

const OPTIONS: Array<{ mode: Mode; title: string; detail: string }> = [
  { mode: 'CURRENT', title: 'Só o lote atual', detail: 'A página mostra um lote por categoria e as vagas restantes.' },
  { mode: 'LADDER', title: 'Escada de preços', detail: 'A página mostra os lotes abertos e os que ainda vão abrir, com hora.' },
];

export default function RegistrationLotDisplay({ eventId }: { eventId: string }) {
  const [mode, setMode] = useState<Mode>('LADDER');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    api<{ mode: Mode }>(`/events/${encodeURIComponent(eventId)}/registration-lot-display`)
      .then((payload) => { if (active && (payload.mode === 'CURRENT' || payload.mode === 'LADDER')) setMode(payload.mode); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof ApiError ? caught.message : 'Não foi possível carregar a exibição dos lotes.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await api<{ mode: Mode }>(`/events/${encodeURIComponent(eventId)}/registration-lot-display`, {
        method: 'PUT',
        body: JSON.stringify({ mode }),
      });
      setMode(saved.mode);
      setNotice('A página pública passou a usar esta exibição.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível salvar a exibição dos lotes.');
    } finally {
      setSaving(false);
    }
  }

  return <section className={styles.panel} aria-labelledby="lot-display-title">
    <p className={styles.eyebrow}>PÁGINA PÚBLICA</p>
    <h2 id="lot-display-title">O que a inscrição mostra</h2>
    <p>Escolha se a pessoa vê só o lote em que pode entrar agora ou a escada com os preços seguintes. A hora de abertura e de encerramento aparece na página.</p>
    <form className={styles.form} onSubmit={save}>
      <fieldset className={styles.choices} disabled={loading || saving}>
        <legend className={styles.srOnly}>Exibição dos lotes</legend>
        {OPTIONS.map((option) => <label className={mode === option.mode ? `${styles.choice} ${styles.choiceSelected}` : styles.choice} key={option.mode}>
          <input type="radio" name="lot-display-mode" value={option.mode} checked={mode === option.mode} onChange={() => setMode(option.mode)} />
          <span>
            <strong>{option.title}</strong>
            <span>{option.detail}</span>
            <span className={option.mode === 'LADDER' ? `${styles.preview} ${styles.previewStairs}` : styles.preview} aria-hidden="true">
              <i /><i />{option.mode === 'LADDER' && <i />}
            </span>
          </span>
        </label>)}
      </fieldset>
      <button className={styles.primary} type="submit" disabled={loading || saving}>{saving ? 'Salvando…' : 'Salvar exibição'}</button>
    </form>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
  </section>;
}
