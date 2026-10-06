'use client';

import { useState } from 'react';
import { api } from '../lib/api';
import { PUBLIC_SUBJECT_AREAS } from '../lib/public-discovery';
import styles from './event-subject-areas.module.css';

export default function EventSubjectAreas({ eventId, initial }: { eventId: string; initial: string[] }) {
  const [selected, setSelected] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function toggle(id: string) {
    setNotice('');
    setError('');
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) {
        setError('Escolha no máximo 3 áreas de atuação.');
        return current;
      }
      return [...current, id];
    });
  }

  async function save() {
    if (selected.length === 0) {
      setError('Escolha ao menos uma área de atuação.');
      setNotice('');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{ subjectAreas: string[] }>(`/events/${encodeURIComponent(eventId)}/subject-areas`, {
        method: 'PATCH',
        body: JSON.stringify({ subjectAreas: selected }),
      });
      setSelected(result.subjectAreas);
      setNotice('Área salva. O catálogo público passa a encontrar este evento por ela.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a área de atuação.');
    } finally {
      setSaving(false);
    }
  }

  return <section className={styles.panel} aria-labelledby="subject-areas-title">
    <h2 id="subject-areas-title">Área de atuação</h2>
    <p>Educação, Saúde, Direito, Engenharias e as demais áreas do catálogo usam esta marcação. Sem ela, o evento não aparece nesses filtros.</p>
    <div className={styles.choices}>
      {PUBLIC_SUBJECT_AREAS.map((area) => <label key={area.id} className={selected.includes(area.id) ? styles.selected : undefined}>
        <input type="checkbox" checked={selected.includes(area.id)} onChange={() => toggle(area.id)} />
        <span><strong>{area.label}</strong>{area.description}</span>
      </label>)}
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <button type="button" disabled={saving} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar área de atuação'}</button>
  </section>;
}
