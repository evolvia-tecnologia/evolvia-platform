'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import styles from './event-desk.module.css';

type Kind = 'VIDEOCONFERENCE' | 'LIVE' | 'RECORDED';
type Transmission = { kind: Kind; title: string; url: string };

const kinds: Array<[Kind, string]> = [
  ['VIDEOCONFERENCE', 'Videoconferência'],
  ['LIVE', 'Vídeo ao vivo'],
  ['RECORDED', 'Vídeo gravado'],
];

export default function EventTransmission({ eventId }: { eventId: string }) {
  const [kind, setKind] = useState<Kind>('VIDEOCONFERENCE');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState<Transmission | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api<{ transmission: Transmission | null }>(`/events/${encodeURIComponent(eventId)}/transmission`)
      .then((result) => {
        if (!active || !result.transmission) return;
        setSaved(result.transmission);
        setKind(result.transmission.kind);
        setTitle(result.transmission.title);
        setUrl(result.transmission.url);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a transmissão.');
      });
    return () => { active = false; };
  }, [eventId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<{ transmission: Transmission }>(`/events/${encodeURIComponent(eventId)}/transmission`, {
        method: 'PUT',
        body: JSON.stringify({ kind, title, url }),
      });
      setSaved(result.transmission);
      setNotice('Link salvo. Só quem tem inscrição confirmada vê este endereço.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a transmissão.');
    } finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/events/${encodeURIComponent(eventId)}/transmission`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: false }),
      });
      setSaved(null);
      setTitle('');
      setUrl('');
      setNotice('Transmissão removida. O link deixou de aparecer para os inscritos.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível remover a transmissão.');
    } finally { setBusy(false); }
  }

  return <div className={styles.page}>
    <section className={styles.panel} aria-labelledby="transmission-title">
      <p className={styles.eyebrow}>TRANSMISSÃO</p>
      <h2 id="transmission-title">Link para quem está inscrito</h2>
      <p>Use o link da videoconferência, de um vídeo ao vivo ou de uma gravação. A página pública não mostra esse endereço. Não há envio de arquivo nem comentário na Evolvia.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <form className={styles.register} onSubmit={(event) => void save(event)}>
        <label>Forma
          <select value={kind} onChange={(event) => setKind(event.target.value as Kind)}>
            {kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Título
          <input required minLength={2} maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>Link https
          <input required type="url" inputMode="url" maxLength={500} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
        </label>
        <button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar transmissão'}</button>
      </form>
      {saved && <button type="button" disabled={busy} onClick={() => void remove()}>Remover link</button>}
    </section>
  </div>;
}
