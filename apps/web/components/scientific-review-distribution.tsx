'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import styles from './scientific-review-distribution.module.css';

type DistributionPreview = {
  cap: number | null;
  pending: boolean;
  suggestions: Array<{ submissionId: string; versionId: string; title: string; reviewerPersonId: string; reviewerName: string }>;
};

type DistributionResult = { assignedCount: number; pending: boolean; cap: number | null };

export default function ScientificReviewDistribution({ eventId }: { eventId: string }) {
  const [data, setData] = useState<DistributionPreview | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!eventId) return undefined;
    let active = true;
    api<DistributionPreview>(`/scientific-events/${encodeURIComponent(eventId)}/reviews/distribution`)
      .then((result) => { if (active && isPreview(result)) setData(result); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível preparar a distribuição.');
      });
    return () => { active = false; };
  }, [eventId]);

  async function apply() {
    if (busy || !data?.suggestions.length) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<DistributionResult>(`/scientific-events/${encodeURIComponent(eventId)}/reviews/distribution`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const pending = result.pending ? ' Ainda há trabalhos elegíveis. Chame de novo.' : '';
      setNotice(result.assignedCount === 0
        ? `Nenhuma atribuição nova neste lote.${pending}`
        : `Lote distribuído: ${result.assignedCount}. O avaliador vê o trabalho na área dele. Não houve e-mail.${pending}`);
      const fresh = await api<DistributionPreview>(`/scientific-events/${encodeURIComponent(eventId)}/reviews/distribution`);
      if (isPreview(fresh)) setData(fresh);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível distribuir o lote.');
    } finally { setBusy(false); }
  }

  const cap = data?.cap == null ? 'um avaliador por trabalho' : `${data.cap} por trabalho`;

  return <section className={styles.panel} aria-labelledby="review-distribution-title">
    <p className={styles.eyebrow}>AVALIAÇÃO</p>
    <h2 id="review-distribution-title">Distribuição assistida</h2>
    <p>O servidor sugere até 40 atribuições, pula conflito de autoria e respeita o teto ({cap}). Não há e-mail. O trabalho aparece na área do avaliador.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <button className={styles.primary} type="button" disabled={busy || !data?.suggestions.length} onClick={() => void apply()}>
      {busy ? 'Distribuindo…' : 'Distribuir elegíveis'}
    </button>
    <div className={styles.scroll}>
      <table>
        <caption>Sugestão deste lote</caption>
        <thead><tr><th scope="col">Trabalho</th><th scope="col">Avaliador</th></tr></thead>
        <tbody>
          {data && data.suggestions.length === 0 && <tr><td colSpan={2}>Nenhum trabalho elegível sem avaliador neste recorte.</td></tr>}
          {data?.suggestions.map((item) => <tr key={`${item.submissionId}-${item.reviewerPersonId}`}>
            <th scope="row">{item.title}</th>
            <td>{item.reviewerName}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    {data?.pending && <p>Ainda há trabalhos além deste lote.</p>}
  </section>;
}

function isPreview(value: DistributionPreview): value is DistributionPreview {
  return Boolean(value) && Array.isArray(value.suggestions) && !('email' in value) && !('registrationData' in value);
}
