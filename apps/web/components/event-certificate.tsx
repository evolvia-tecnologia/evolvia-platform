'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import ScientificEvaHelp from './scientific-eva-help';
import styles from './event-desk.module.css';

type CertificateSetting = {
  enabled: boolean;
  hours: number | null;
  revision: number;
  feeCents: 0;
  role: 'participation';
  issuedCount: number;
};

export default function EventCertificate({ eventId }: { eventId: string }) {
  if (!eventId) return <p>Escolha um evento para liberar o certificado.</p>;
  return <EventCertificateForm key={eventId} eventId={eventId} />;
}

function EventCertificateForm({ eventId }: { eventId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [hours, setHours] = useState('');
  const [revision, setRevision] = useState(0);
  const [issuedCount, setIssuedCount] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api<CertificateSetting>(`/events/${encodeURIComponent(eventId)}/certificate`)
      .then((result) => {
        if (!active) return;
        setEnabled(result.enabled);
        setHours(result.hours == null ? '' : String(result.hours));
        setRevision(result.revision);
        setIssuedCount(result.issuedCount);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o certificado.');
      });
    return () => { active = false; };
  }, [eventId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    const parsedHours = hours.trim() === '' ? null : Number(hours);
    try {
      const result = await api<CertificateSetting>(`/events/${encodeURIComponent(eventId)}/certificate`, {
        method: 'PUT',
        body: JSON.stringify({ enabled, hours: parsedHours, expectedRevision: revision }),
      });
      setEnabled(result.enabled);
      setHours(result.hours == null ? '' : String(result.hours));
      setRevision(result.revision);
      setIssuedCount(result.issuedCount);
      setNotice(result.enabled
        ? 'Certificado de participação liberado. Só quem teve a entrada registrada consegue emitir, e o download não é cobrado.'
        : 'Certificado desligado. Novas emissões ficam bloqueadas.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o certificado.');
    } finally { setBusy(false); }
  }

  return <div className={styles.page}>
    <section className={styles.panel} aria-labelledby="certificate-setting-title">
      <p className={styles.eyebrow}>CERTIFICADO</p>
      <h2 id="certificate-setting-title">Participação com presença registrada</h2>
      <p>O download não é cobrado. O certificado sai somente para inscrição confirmada com entrada registrada. Não há envio em massa, verso nem certificado de atividade, autoria ou avaliação.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <p>Já emitidos neste evento: {issuedCount}. Quem já emitiu mantém a carga horária daquele momento.</p>
      <form className={styles.register} onSubmit={(event) => void save(event)}>
        <div className={styles.choices}>
          <label>
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            Liberar certificado de participação
          </label>
        </div>
        <label>Carga horária
          <input
            inputMode="numeric"
            min={1}
            max={999}
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            aria-describedby="certificate-hours-help"
          />
        </label>
        <p id="certificate-hours-help">Opcional. Use um inteiro de 1 a 999, ou deixe em branco.</p>
        <button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar certificado'}</button>
      </form>
      <ScientificEvaHelp
        context="Certificado de participação"
        intro="A EVA explica a liberação deste certificado. Ela não lê documento, não cobra e não envia dado para fora da Evolvia."
        questions={[
          { question: 'O download é cobrado?', answer: 'Não. Certificado de participação não tem taxa.' },
          { question: 'Quem pode emitir?', answer: 'Somente a inscrição confirmada com presença registrada, depois que esta liberação estiver ligada.' },
          { question: 'A EVA mostra documentos?', answer: 'Não. A EVA só explica esta tela. A consulta pública do código também não mostra e-mail, CPF nem protocolo.' },
        ]}
      />
    </section>
  </div>;
}
