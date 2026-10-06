'use client';

import { useEffect, useState } from 'react';
import PublicSiteHeader from './public-site-header';
import ScientificEvaHelp from './scientific-eva-help';
import styles from './presence-certificate-view.module.css';

type CertificateView = {
  authentic: true;
  role: 'participation';
  eventName: string;
  displayName: string;
  hours: number | null;
  issuedAt: string;
  feeCents: 0;
};

const CODE = /^[a-f0-9]{32}$/u;

export default function PresenceCertificateView({ code }: { code: string }) {
  const normalized = code.trim().toLowerCase();
  const [view, setView] = useState<CertificateView | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(CODE.test(normalized));

  useEffect(() => {
    if (!CODE.test(normalized)) return;
    const controller = new AbortController();
    fetch(`/api/public/certificates/${normalized}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || !isCertificateView(payload)) {
          throw new Error(readMessage(payload));
        }
        setView(payload);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Certificado não encontrado.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [normalized]);

  const hours = view?.hours == null ? 'Não informada' : `${view.hours} h`;

  return <div className={styles.page}>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <div className={styles.chrome}>
      <PublicSiteHeader current="evento" />
    </div>
    <main id="main-content" className={styles.sheet} tabIndex={-1}>
      <article className={styles.card} aria-labelledby="certificate-title">
        <p className={styles.eyebrow}>EVOLVIA</p>
        <h1 id="certificate-title">Certificado de participação</h1>
        {!CODE.test(normalized) && <p className={styles.error} role="alert">Código de certificado inválido.</p>}
        {loading && <p role="status">Conferindo autenticidade…</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {view && <>
          <p className={styles.seal} role="status">Autêntico</p>
          <p>Certificamos que <strong>{view.displayName}</strong> participou de <strong>{view.eventName}</strong>.</p>
          <dl className={styles.details}>
            <div><dt>Carga horária</dt><dd>{hours}</dd></div>
            <div><dt>Emitido em</dt><dd suppressHydrationWarning>{new Date(view.issuedAt).toLocaleString('pt-BR')}</dd></div>
            <div><dt>Código</dt><dd><code>{normalized}</code></dd></div>
          </dl>
          <p className={styles.note}>O download não é cobrado. Esta consulta não mostra e-mail, CPF nem protocolo.</p>
          <div className={styles.actions}>
            <button type="button" onClick={() => window.print()}>Imprimir</button>
          </div>
        </>}
        <div className={styles.chrome}>
          <ScientificEvaHelp
            context="Consulta do certificado"
            intro="A EVA confirma o que esta página mostra. Ela não lê documento e não envia dado para fora da Evolvia."
            questions={[
              { question: 'Este certificado é autêntico?', answer: 'O selo aparece quando o código foi emitido pela Evolvia para uma presença registrada.' },
              { question: 'O download é cobrado?', answer: 'Não. O certificado de participação não tem taxa.' },
              { question: 'A EVA envia meus dados?', answer: 'Não. A EVA só explica esta página e não mostra e-mail, CPF nem protocolo.' },
            ]}
          />
        </div>
      </article>
    </main>
  </div>;
}

function readMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'Certificado não encontrado.';
  const record = payload as { message?: unknown; error?: { message?: unknown } };
  if (typeof record.error?.message === 'string' && record.error.message.trim()) return record.error.message;
  if (typeof record.message === 'string' && record.message.trim()) return record.message;
  return 'Certificado não encontrado.';
}

function isCertificateView(value: unknown): value is CertificateView {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.authentic === true
    && record.role === 'participation'
    && typeof record.eventName === 'string'
    && typeof record.displayName === 'string'
    && (record.hours === null || typeof record.hours === 'number')
    && typeof record.issuedAt === 'string'
    && record.feeCents === 0
    && !('protocol' in record)
    && !('email' in record);
}
