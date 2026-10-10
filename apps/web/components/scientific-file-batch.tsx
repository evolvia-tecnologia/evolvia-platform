'use client';

import { useState } from 'react';
import { getToken } from '../lib/api';
import styles from './scientific-file-batch.module.css';

type Props = { eventId: string };

export default function ScientificFileBatch({ eventId }: Props) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function download() {
    setBusy(true);
    setNotice('');
    setError('');
    const token = getToken();
    if (!token) {
      setError('Entre na sua conta para baixar os arquivos.');
      setBusy(false);
      return;
    }
    try {
      const response = await fetch(`/api/scientific-events/${encodeURIComponent(eventId)}/submission-files/batch`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: { message?: string }; message?: string | string[] };
        const legacy = Array.isArray(payload.message) ? payload.message.join(' ') : payload.message;
        setError(payload.error?.message || legacy || 'Não foi possível baixar os arquivos.');
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'trabalhos.zip';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (response.headers.get('X-Evolvia-Truncated') === '1') {
        setNotice('O pacote chegou ao limite de 40 arquivos ou 32 MB. Os demais trabalhos ficam para outro download.');
      }
    } catch {
      setError('Não foi possível baixar os arquivos.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="scientific-file-batch-title">
      <h2 id="scientific-file-batch-title">Arquivos dos trabalhos</h2>
      <p>
        Baixe até 40 PDFs da versão atual dos trabalhos enviados ou aceitos deste evento.
        O pacote traz o índice com o título e nomes de arquivo sem identificar autor.
        Não há envio de e-mail.
      </p>
      <button type="button" className={styles.download} onClick={() => { void download(); }} disabled={busy}>
        {busy ? 'Preparando o pacote…' : 'Baixar arquivos'}
      </button>
      {notice ? <p className={styles.notice} role="alert">{notice}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  );
}
