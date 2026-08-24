'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import styles from '../auth-layout.module.css';

type DeliveryStatus = 'SENT' | 'PENDING';
type ResendResponse = { message: string };

export default function ConfirmEmailPage() {
  const [delivery, setDelivery] = useState<DeliveryStatus>('PENDING');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('evolvia_email_verification_status');
    sessionStorage.removeItem('evolvia_email_verification_status');
    if (stored === 'SENT') setDelivery('SENT');
  }, []);

  async function resend() {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await api<ResendResponse>('/auth/email/resend', {
        method: 'POST',
      });
      setDelivery('SENT');
      setMessage(response.message);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 429) {
        setError('Um link já foi solicitado recentemente. Aguarde um minuto antes de tentar novamente.');
      } else if (reason instanceof ApiError && reason.status === 401) {
        setError('Sua sessão expirou. Entre novamente para solicitar outro link.');
      } else {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Não foi possível reenviar o link agora.',
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brandGroup}>
          <Link className={styles.brand} href="/" aria-label="Evolvia — página inicial">
            <span className={styles.brandMark} aria-hidden="true"><span /></span>
            EVOLVIA
          </Link>
          <span className={styles.tagline}>Tecnologia que conecta eventos<br />a pessoas e grandes ideias.</span>
        </div>
        <Link className={styles.headerLink} href="/painel">Ir para o painel</Link>
      </header>

      <div className={styles.workspace}>
        <section className={styles.hero} aria-labelledby="confirm-email-hero-title">
          <p className={styles.eyebrow}>ÚLTIMO PASSO DE SEGURANÇA</p>
          <h1 id="confirm-email-hero-title">Confirme seu e-mail e proteja sua <strong>jornada.</strong></h1>
          <p className={styles.heroText}>
            A confirmação ajuda a recuperar o acesso e protege operações sensíveis da sua conta.
          </p>

          <div className={styles.benefits} aria-label="Como confirmar seu e-mail">
            <div className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden="true">01</span>
              <strong>Abra sua caixa de entrada</strong>
              <span>Procure a mensagem enviada pela Evolvia.</span>
            </div>
            <div className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden="true">02</span>
              <strong>Use o link seguro</strong>
              <span>Ele é individual, temporário e de uso único.</span>
            </div>
            <div className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden="true">03</span>
              <strong>Continue seu evento</strong>
              <span>Você pode acessar o painel enquanto confirma.</span>
            </div>
          </div>

          <div className={styles.evaCard}>
            <span className={styles.evaIcon} aria-hidden="true">✦</span>
            <div>
              <strong>A EVA preserva sua privacidade</strong>
              <span>Nenhum endereço de e-mail ou token aparece nesta página.</span>
            </div>
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="confirm-email-title">
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <p className={styles.status}>CONFIRMAÇÃO DE E-MAIL</p>
              <h1 id="confirm-email-title">
                {delivery === 'SENT' ? 'Confira sua caixa de entrada' : 'Envio pendente'}
              </h1>
              <p>
                {delivery === 'SENT'
                  ? 'Enviamos as instruções de confirmação para o endereço cadastrado.'
                  : 'Sua conta foi criada, mas o envio não pôde ser concluído. Você pode tentar novamente.'}
              </p>
            </div>

            {message && (
              <div className={styles.successAlert} role="status" aria-live="polite">
                <strong>Novo link solicitado.</strong>
                <span>{message}</span>
              </div>
            )}
            {error && <div className={styles.alert} role="alert">{error}</div>}

            <div className={styles.actionStack}>
              <button
                className={styles.primaryButton}
                type="button"
                disabled={loading}
                aria-disabled={loading}
                onClick={resend}
              >
                {loading ? 'Solicitando novo link...' : 'Reenviar link de confirmação'}
              </button>
              <Link className={styles.secondaryButton} href="/painel">
                Continuar para o painel
              </Link>
            </div>

            <div className={styles.securityNote}>
              <span aria-hidden="true">◈</span>
              <div><strong>Reenvio protegido.</strong><br />Tentativas repetidas possuem intervalo e limite para evitar abuso.</div>
            </div>
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <span>Evolvia — tecnologia para eventos.</span>
        <span>Privacidade e acessibilidade desde a origem.</span>
      </footer>
    </main>
  );
}
