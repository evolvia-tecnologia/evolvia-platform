'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import styles from './operational-readings.module.css';

const LABELS = [
  ['dayPresence', 'Presença do dia'],
  ['presenceDays', 'Dias com presença'],
  ['dayPresenceReversed', 'Presença do dia estornada'],
  ['activityPresence', 'Presença em atividade'],
  ['activitiesWithPresence', 'Atividades com presença'],
  ['materialReversed', 'Material estornado'],
  ['checkInReversed', 'Credenciamento estornado'],
  ['waitlistWaiting', 'Fila aguardando'],
  ['waitlistOffered', 'Fila com oferta'],
  ['activityEnrollments', 'Inscrições em atividade'],
  ['publishedActivities', 'Atividades publicadas'],
  ['reviewsSubmitted', 'Pareceres enviados'],
  ['reviewsOpen', 'Pareceres em aberto'],
  ['worksWithoutReview', 'Trabalhos sem parecer'],
  ['certificatesIssued', 'Certificados emitidos'],
] as const;

type ReadingKey = (typeof LABELS)[number][0];
type Readings = Record<ReadingKey, number>;

export default function OperationalReadings({ eventId }: { eventId: string }) {
  const [readings, setReadings] = useState<Readings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    api<{ readings: Readings }>(`/events/${encodeURIComponent(eventId)}/operational-readings`)
      .then((result) => { if (active) setReadings(result.readings); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as contas.');
      })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [eventId, reload]);

  return (
    <section className={styles.panel} aria-labelledby="operational-readings-title">
      <h2 id="operational-readings-title">Quinze contas deste evento</h2>
      <p>
        A lista soma presença do dia, atividade, fila, parecer e certificado.
        Não mostra pessoas, protocolos nem endereços. Não estorna, não emite e não decide o trabalho.
      </p>
      <button className={styles.primary} type="button" onClick={() => setReload((current) => current + 1)} disabled={busy}>
        {busy ? 'Atualizando…' : 'Atualizar contas'}
      </button>
      {readings ? (
        <div className={styles.tableWrap}>
          <table>
            <caption>Contas operacionais, sem identificação de pessoa.</caption>
            <thead>
              <tr>
                <th scope="col">Conta</th>
                <th scope="col">Quantidade</th>
              </tr>
            </thead>
            <tbody>
              {LABELS.map(([key, label]) => (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  <td>{readings[key].toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
