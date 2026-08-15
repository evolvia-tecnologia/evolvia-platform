'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';
import PublicEventPresentation, { PublicEventPresentationData } from './public-event-presentation';
import styles from './publication-preview.module.css';

export default function PublicationPreview({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [event, setEvent] = useState<PublicEventPresentationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPreview = async () => {
    setLoading(true);
    setError('');
    try {
      const preview = await api<PublicEventPresentationData>(`/events/${eventId}/publication/preview`);
      setEvent(preview);
    } catch (reason) {
      setEvent(null);
      setError(reason instanceof Error ? reason.message : 'Não foi possível preparar a pré-visualização.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    void loadPreview();
    // eventId representa a identidade estável da pré-visualização.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, router]);

  if (loading) {
    return <main className={styles.state} aria-busy="true">
      <div className={styles.mark} aria-hidden="true">EVA</div>
      <p>Preparando a pré-visualização privada...</p>
    </main>;
  }

  if (!event) {
    return <main className={styles.state}>
      <div className={styles.alert} role="alert">{error || 'Esta pré-visualização não está disponível para seu acesso.'}</div>
      <div className={styles.stateActions}>
        <button type="button" onClick={() => void loadPreview()}>Tentar novamente</button>
        <Link href={`/eventos/${eventId}/painel/divulgacao`}>Voltar à Divulgação</Link>
      </div>
    </main>;
  }

  return <main className={styles.page}>
    <header className={styles.previewBar}>
      <div>
        <p>PRÉ-VISUALIZAÇÃO PRIVADA</p>
        <strong>Veja a página como o público verá depois da publicação</strong>
        <span>Esta tela não publica, não altera o evento e não fica disponível para mecanismos de busca.</span>
      </div>
      <Link href={`/eventos/${eventId}/painel/divulgacao`}>Voltar à Divulgação</Link>
    </header>

    <PublicEventPresentation event={event} eyebrow="PRÉ-VISUALIZAÇÃO PRIVADA" />
  </main>;
}
