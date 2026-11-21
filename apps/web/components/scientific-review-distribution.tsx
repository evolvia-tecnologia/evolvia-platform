'use client';

import { useEffect, useRef, useState } from 'react';
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
  const inFlight = useRef(false);
  const scopeRef = useRef({ eventId, active: false });

  useEffect(() => {
    const scope = { eventId, active: true };
    scopeRef.current = scope;
    setData(null); setError(''); setNotice('');
    inFlight.current = false;
    setBusy(false);
    if (!eventId) return () => { scope.active = false; };
    api<DistributionPreview>(`/scientific-events/${encodeURIComponent(eventId)}/reviews/distribution`)
      .then((result) => { if (scope.active && isPreview(result)) setData(result); })
      .catch((reason: unknown) => {
        if (scope.active) setError(reason instanceof Error ? reason.message : 'Não foi possível preparar a distribuição.');
      });
    return () => { scope.active = false; };
  }, [eventId]);

  async function apply() {
    const scope = scopeRef.current;
    if (!scope.active || scope.eventId !== eventId || inFlight.current || busy || !data?.suggestions.length) return;
    inFlight.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<DistributionResult>(`/scientific-events/${encodeURIComponent(eventId)}/reviews/distribution`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!scope.active) return;
      setData(null);
      const pending = result.pending ? ' Ainda há trabalhos elegíveis. Chame de novo.' : '';
      setNotice(result.assignedCount === 0
        ? `Nenhuma atribuição nova neste lote.${pending}`
        : `Lote distribuído: ${result.assignedCount}. O avaliador vê o trabalho na área dele. Não houve e-mail.${pending}`);
      try {
        const fresh = await api<DistributionPreview>(`/scientific-events/${encodeURIComponent(eventId)}/reviews/distribution`);
        if (!scope.active) return;
        if (!isPreview(fresh)) throw new Error('Prévia inválida');
        setData(fresh);
      } catch {
        if (!scope.active) return;
        setError('O lote foi processado, mas não foi possível atualizar as sugestões. Recarregue a página para continuar.');
      }
    } catch (reason) {
      if (scope.active) setError(reason instanceof Error ? reason.message : 'Não foi possível distribuir o lote.');
    } finally {
      if (scope.active) { inFlight.current = false; setBusy(false); }
    }
  }

  const currentScope = scopeRef.current.active && scopeRef.current.eventId === eventId;
  const preview = currentScope ? data : null;
  const cap = preview?.cap == null ? 'um avaliador por trabalho' : `${preview.cap} por trabalho`;

  return <section id="distribuicao-assistida" className={styles.panel} aria-labelledby="review-distribution-title">
    <p className={styles.eyebrow}>AVALIAÇÃO</p>
    <h2 id="review-distribution-title">Distribuição assistida</h2>
    <p>O servidor sugere até 40 atribuições, pula conflito de autoria e respeita o teto ({cap}). Não há e-mail. O trabalho aparece na área do avaliador.</p>
    {currentScope && error && <p className={styles.error} role="alert">{error}</p>}
    {currentScope && notice && <p className={styles.notice} role="status">{notice}</p>}
    <button className={styles.primary} type="button" disabled={busy || !preview?.suggestions.length} onClick={() => void apply()}>
      {busy ? 'Distribuindo…' : 'Distribuir elegíveis'}
    </button>
    <div className={styles.scroll}>
      <table>
        <caption>Sugestão deste lote</caption>
        <thead><tr><th scope="col">Trabalho</th><th scope="col">Avaliador</th></tr></thead>
        <tbody>
          {preview && preview.suggestions.length === 0 && <tr><td colSpan={2}>Nenhum trabalho elegível sem avaliador neste recorte.</td></tr>}
          {preview?.suggestions.map((item) => <tr key={`${item.submissionId}-${item.reviewerPersonId}`}>
            <th scope="row">{item.title}</th>
            <td>{item.reviewerName}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
    {preview?.pending && <p>Ainda há trabalhos além deste lote.</p>}
  </section>;
}

function isPreview(value: DistributionPreview): value is DistributionPreview {
  return Boolean(value) && Array.isArray(value.suggestions) && !('email' in value) && !('registrationData' in value);
}


