'use client';

import { useState } from 'react';
import styles from '../app/evento/[slug]/page.module.css';

export default function PublicEventShare({ title }: { title: string }) {
  const [status, setStatus] = useState('');

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus('Link copiado.');
    } catch {
      setStatus('Selecione o endereço da página e copie.');
    }
  }

  return <div className={styles.share}>
    <button className={styles.shareButton} type="button" onClick={() => void copy()} aria-label={`Copiar o link de ${title}`}>
      Copiar link do evento
    </button>
    {status && <p role="status">{status}</p>}
  </div>;
}
