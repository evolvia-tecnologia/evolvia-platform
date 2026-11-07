'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { transmissionFieldFromApiMessage, transmissionUnavailable } from '../lib/transmission-availability';
import styles from './event-desk.module.css';
import local from './event-transmission.module.css';

type Kind = 'VIDEOCONFERENCE' | 'LIVE' | 'RECORDED';
type Transmission = { kind: Kind; title: string; url: string };
type Phase = 'loading' | 'ready' | 'saving' | 'load-error' | 'write-error';

const kinds: Array<[Kind, string]> = [
  ['VIDEOCONFERENCE', 'Videoconferência'],
  ['LIVE', 'Vídeo ao vivo'],
  ['RECORDED', 'Vídeo gravado'],
];

export default function EventTransmission({ eventId }: { eventId: string }) {
  if (!eventId) return <p>Escolha um evento para configurar a transmissão.</p>;
  return <EventTransmissionForm key={eventId} eventId={eventId} />;
}

function EventTransmissionForm({ eventId }: { eventId: string }) {
  const [kind, setKind] = useState<Kind>('VIDEOCONFERENCE');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState<Transmission | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [phase, setPhase] = useState<Phase>('loading');
  const [reload, setReload] = useState(0);
  // State alone cannot prevent two submits before React renders again.
  const locked = useRef(true);
  const busy = phase !== 'ready';

  useEffect(() => {
    let active = true;
    locked.current = true;
    setPhase('loading');
    setError('');
    setNotice('');
    api<{ transmission: Transmission | null }>(`/events/${encodeURIComponent(eventId)}/transmission`)
      .then((result) => {
        if (!active) return;
        setSaved(result.transmission);
        setKind(result.transmission?.kind ?? 'VIDEOCONFERENCE');
        setTitle(result.transmission?.title ?? '');
        setUrl(result.transmission?.url ?? '');
        locked.current = false;
        setPhase('ready');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a transmissão.');
        setPhase('load-error');
      });
    return () => { active = false; };
  }, [eventId, reload]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setPhase('saving'); setError(''); setNotice('');
    try {
      const result = await api<{ transmission: Transmission }>(`/events/${encodeURIComponent(eventId)}/transmission`, {
        method: 'PUT',
        body: JSON.stringify({ kind, title, url }),
      });
      setSaved(result.transmission);
      setNotice('Link salvo. Só quem tem inscrição confirmada vê este endereço.');
      locked.current = false;
      setPhase('ready');
    } catch (reason) {
      if (reason instanceof ApiError && (reason.status === 400 || reason.status === 422)) {
        setError(reason.message);
        setNotice('');
        const field = transmissionFieldFromApiMessage(reason.message);
        if (field && typeof document !== 'undefined') {
          requestAnimationFrame(() => document.getElementById(`transmission-field-${field}`)?.focus());
        }
        locked.current = false;
        setPhase('ready');
        return;
      }
      setError('Não foi possível confirmar se o link foi salvo. Recarregue a transmissão e confira a configuração atual antes de tentar novamente.');
      setPhase('write-error');
    }
  }

  async function remove() {
    if (locked.current) return;
    locked.current = true;
    setPhase('saving'); setError(''); setNotice('');
    try {
      await api(`/events/${encodeURIComponent(eventId)}/transmission`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: false }),
      });
      setSaved(null);
      setTitle('');
      setUrl('');
      setNotice('Transmissão removida. O link deixou de aparecer para os inscritos.');
      locked.current = false;
      setPhase('ready');
    } catch {
      setError('Não foi possível confirmar se o link foi removido. Recarregue a transmissão e confira a configuração atual antes de tentar novamente.');
      setPhase('write-error');
    }
  }

  const unavailable = transmissionUnavailable(error);
  const rejectedField = transmissionFieldFromApiMessage(error);
  return <div className={styles.page}>
    <section className={`${styles.panel} ${local.panel}`} aria-labelledby="transmission-title">
      <p className={styles.eyebrow}>TRANSMISSÃO</p>
      <h2 id="transmission-title">Link para quem está inscrito</h2>
      <p>Use o link da videoconferência, de um vídeo ao vivo ou de uma gravação. A página pública não mostra esse endereço. Não há envio de arquivo nem comentário na Evolvia. O salvamento segue o formato já gravado: só evento online ou híbrido.</p>
      {error && <p className={styles.error} id="transmission-error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {phase === 'loading' && <p role="status">Carregando a transmissão…</p>}
      {unavailable && <a className={local.foundation} href={`/eventos/${encodeURIComponent(eventId)}/configuracao`}>Abrir a fundação do evento</a>}
      {(phase === 'load-error' || phase === 'write-error' || unavailable) && <button type="button" onClick={() => setReload((value) => value + 1)}>Recarregar transmissão</button>}
      {!unavailable && <form className={styles.register} onSubmit={(event) => void save(event)}>
        <label>Forma
          <select disabled={busy} value={kind} onChange={(event) => setKind(event.target.value as Kind)}>
            {kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Título
          <input id="transmission-field-title" disabled={busy} required minLength={2} maxLength={80} value={title} aria-invalid={rejectedField === 'title' || undefined} aria-describedby={rejectedField === 'title' ? 'transmission-error' : undefined} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>Link https
          <input id="transmission-field-url" disabled={busy} required type="url" inputMode="url" pattern="[hH][tT][tT][pP][sS]://.*" title="O link deve começar com https://" maxLength={500} value={url} aria-invalid={rejectedField === 'url' || undefined} aria-describedby={rejectedField === 'url' ? 'transmission-error' : undefined} onChange={(event) => setUrl(event.target.value)} placeholder="https://" />
        </label>
        <button type="submit" disabled={busy}>{phase === 'saving' ? 'Salvando…' : 'Salvar transmissão'}</button>
      </form>}
      {!unavailable && saved && <button type="button" disabled={busy} onClick={() => void remove()}>Remover link</button>}
    </section>
  </div>;
}

