'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PublicSiteHeader from '../../components/public-site-header';
import { api } from '../../lib/api';
import styles from '../auth-layout.module.css';

export default function VerifyEmailPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'verified' | 'error'>('checking');
  const [message, setMessage] = useState('Confirmando a segurança do seu e-mail…');

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/u, ''));
    const token = fragment.get('token') ?? '';
    history.replaceState(null, '', '/verificar-email');
    if (!token) {
      setStatus('error');
      setMessage('Este link de confirmação está incompleto. Solicite um novo link na sua conta.');
      return;
    }
    api<{ verified: boolean }>('/auth/email-verification/confirm', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }).then(() => {
      setStatus('verified');
      setMessage('E-mail confirmado. Sua conta já pode reunir e abrir suas inscrições.');
    }).catch((reason: unknown) => {
      setStatus('error');
      setMessage(reason instanceof Error ? reason.message : 'Não foi possível confirmar o e-mail.');
    });
  }, []);

  return <div className={styles.page}>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="login" />
    <main id="main-content" className={styles.workspace} tabIndex={-1}>
      <section className={styles.panel} aria-labelledby="verify-title">
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <p className={styles.status}>SEGURANÇA DA CONTA</p>
            <h1 id="verify-title">{status === 'verified' ? 'E-mail confirmado' : 'Confirme seu e-mail'}</h1>
            <p role={status === 'error' ? 'alert' : 'status'}>{message}</p>
          </div>
          {status === 'verified'
            ? <button className={styles.primaryButton} type="button" onClick={() => router.replace('/participante')}>Continuar para meus eventos</button>
            : status === 'error'
              ? <p><Link href="/participante">Voltar à área do participante</Link></p>
              : null}
        </div>
      </section>
    </main>
  </div>;
}
