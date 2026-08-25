'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import styles from '../auth-layout.module.css';

type DeliveryStatus = 'SENT' | 'PENDING';
type ResendResponse = { message: string };

export default function ConfirmEmailPage() {
  const [delivery, setDelivery] = useState<DeliveryStatus>('PENDING');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [clock, setClock] = useState(0);
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('evolvia_email_verification_status');
    const storedRetryAt = Number(
      sessionStorage.getItem('evolvia_email_verification_retry_at') ?? 0,
    );
    sessionStorage.removeItem('evolvia_email_verification_status');
    sessionStorage.removeItem('evolvia_email_verification_retry_at');
    if (stored === 'SENT') setDelivery('SENT');
    if (Number.isFinite(storedRetryAt) && storedRetryAt > Date.now()) {
      setRetryAt(storedRetryAt);
      setClock(Date.now());
    }
  }, []);

  useEffect(() => {
    if (retryAt <= Date.now()) return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  useEffect(() => {
    if (!message && !error) return;
    requestAnimationFrame(() => feedbackRef.current?.focus());
  }, [message, error]);

  const retrySeconds = retryAt > clock
    ? Math.max(0, Math.ceil((retryAt - clock) / 1_000))
    : 0;

  function startCooldown(): void {
    const nextRetryAt = Date.now() + 60_000;
    setRetryAt(nextRetryAt);
    setClock(Date.now());
  }

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
      startCooldown();
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 429) {
        startCooldown();
        setError('Um link já foi solicitado recentemente. Aguarde o tempo indicado antes de tentar novamente.');
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
              <div
                ref={feedbackRef}
                className={styles.successAlert}
                role="status"
                aria-live="polite"
                tabIndex={-1}
              >
                <strong>Novo link solicitado.</strong>
                <span>{message}</span>
              </div>
            )}
            {error && (
              <div ref={feedbackRef} className={styles.alert} role="alert" tabIndex={-1}>
                {error}
              </div>
            )}

            <div className={styles.actionStack}>
              <button
                className={styles.primaryButton}
                type="button"
                disabled={loading || retrySeconds > 0}
                aria-disabled={loading || retrySeconds > 0}
                aria-describedby={retrySeconds > 0 ? 'verification-retry-status' : undefined}
                onClick={resend}
              >
                {loading
                  ? 'Solicitando novo link...'
                  : retrySeconds > 0
                    ? `Reenviar em ${retrySeconds}s`
                    : 'Reenviar link de confirmação'}
              </button>
              {retrySeconds > 0 && (
                <span className={styles.cooldownText} id="verification-retry-status">
                  Para sua segurança, um novo envio estará disponível em {retrySeconds} segundos.
                </span>
              )}
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
