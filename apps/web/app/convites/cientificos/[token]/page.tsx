'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../../../lib/api';
import EvaScreenSupport from '../../../../components/eva-screen-support';
import styles from './scientific-invitation.module.css';

type InvitationPayload = {
  event: { id: string; name: string };
  guest: {
    displayName: string;
    institution?: string | null;
    professionalTitle?: string | null;
    participationType: string;
    roleLabel: string;
    miniBio?: string | null;
  };
  invitation: {
    status: 'PREPARED' | 'SENT' | 'VIEWED' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED';
    expiresAt?: string | null;
    subject: string;
    body: string;
  };
};

export default function ScientificInvitationPage() {
  return <>
    <EvaScreenSupport guide="invitation" />
    <InvitationResponse />
  </>;
}

function InvitationResponse() {
  const params = useParams<{ token: string }>();
  const [payload, setPayload] = useState<InvitationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api<InvitationPayload>(`/scientific-invitations/${params.token}`)
      .then((result) => active && setPayload(result))
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : 'Não foi possível abrir este convite.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [params.token]);

  async function respond(response: 'CONFIRMED' | 'DECLINED') {
    setBusy(true);
    setError('');
    try {
      const result = await api<InvitationPayload>(`/scientific-invitations/${params.token}/respond`, {
        method: 'POST',
        body: JSON.stringify({ response }),
      });
      setPayload(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível registrar sua resposta.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className={styles.page}><div className={styles.card}><div className={styles.mark}>E</div><p>Carregando convite...</p></div></main>;
  if (!payload) return <main className={styles.page}><div className={styles.card}><div className={styles.mark}>E</div><h1>Convite indisponível</h1><p>{error}</p></div></main>;

  const answered = payload.invitation.status === 'CONFIRMED' || payload.invitation.status === 'DECLINED';
  return <main className={styles.page}>
    <section className={styles.card}>
      <div className={styles.brand}>EVOLVIA</div>
      <p className={styles.eyebrow}>CONVITE CIENTÍFICO</p>
      <h1>{payload.invitation.subject}</h1>
      <p className={styles.message}>{payload.invitation.body}</p>
      <div className={styles.profile}>
        <strong>{payload.guest.displayName}</strong>
        <span>{payload.guest.roleLabel}{payload.guest.institution ? ` · ${payload.guest.institution}` : ''}</span>
        {payload.guest.professionalTitle && <small>{payload.guest.professionalTitle}</small>}
      </div>
      {payload.invitation.expiresAt && <p className={styles.expiry}>Resposta disponível até {new Date(payload.invitation.expiresAt).toLocaleDateString('pt-BR')}.</p>}
      {error && <div className={styles.error}>{error}</div>}
      {answered ? <div className={styles.answer}><strong>{payload.invitation.status === 'CONFIRMED' ? 'Participação confirmada' : 'Convite recusado'}</strong><p>Sua resposta foi registrada com segurança.</p></div> : <div className={styles.actions}>
        <button className={styles.confirm} disabled={busy} onClick={() => respond('CONFIRMED')}>{busy ? 'Registrando…' : 'Confirmar participação'}</button>
        <button className={styles.decline} disabled={busy} onClick={() => respond('DECLINED')}>Não poderei participar</button>
      </div>}
      <p className={styles.privacy}>Este link contém apenas um identificador não sequencial. Dados internos do evento não são expostos.</p>
    </section>
  </main>;
}
