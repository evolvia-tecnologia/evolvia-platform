'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import styles from '../auth-layout.module.css';

type VerificationResponse = { message: string };
type VerificationState = 'checking' | 'success' | 'rejected' | 'unavailable';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export default function VerifyEmailPage() {
  const started = useRef(false);
  const [state, setState] = useState<VerificationState>('checking');
  const [message, setMessage] = useState('Validando seu link seguro...');
  const resultTitleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get('token') ?? '';
    window.history.replaceState(null, '', window.location.pathname);

    if (!TOKEN_PATTERN.test(token)) {
      setState('rejected');
      setMessage('O link de confirmação é inválido, expirou ou já foi utilizado.');
      return;
    }

    void api<VerificationResponse>('/auth/email/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then((response) => {
        setState('success');
        setMessage(response.message);
      })
      .catch((reason: unknown) => {
        const text = reason instanceof Error ? reason.message : '';
        if (/inválido|expirou|utilizado/iu.test(text)) {
          setState('rejected');
          setMessage('O link de confirmação é inválido, expirou ou já foi utilizado.');
          return;
        }
        setState('unavailable');
        setMessage('Não foi possível confirmar o e-mail agora. Tente novamente mais tarde.');
      });
  }, []);

  useEffect(() => {
    if (state === 'checking') return;
    requestAnimationFrame(() => resultTitleRef.current?.focus());
  }, [state]);

  const resultTitle = state === 'success'
    ? 'E-mail confirmado'
    : state === 'rejected'
      ? 'Este link não é mais válido'
      : state === 'unavailable'
        ? 'Confirmação indisponível'
        : 'Protegendo sua conta';

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
        <Link className={styles.headerLink} href="/login">Ir para o login</Link>
      </header>

      <div className={styles.workspace}>
        <section className={styles.hero} aria-labelledby="verification-hero-title">
          <p className={styles.eyebrow}>IDENTIDADE PROTEGIDA</p>
          <h1 id="verification-hero-title">Confirme seu e-mail e siga com <strong>segurança.</strong></h1>
          <p className={styles.heroText}>
            A confirmação protege sua conta e habilita jornadas sensíveis sem expor seus dados.
          </p>

          <div className={styles.benefits} aria-label="Proteções da confirmação">
            <div className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden="true">01</span>
              <strong>Link temporário</strong>
              <span>O endereço expira e só pode ser utilizado uma vez.</span>
            </div>
            <div className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden="true">02</span>
              <strong>Token protegido</strong>
              <span>O segredo é removido da barra de endereço imediatamente.</span>
            </div>
            <div className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden="true">03</span>
              <strong>Resposta mínima</strong>
              <span>Nenhum e-mail, hash ou dado interno retorna ao navegador.</span>
            </div>
          </div>

          <div className={styles.evaCard}>
            <span className={styles.evaIcon} aria-hidden="true">✦</span>
            <div>
              <strong>A EVA preserva seus dados</strong>
              <span>Ela pode orientar a jornada, mas nunca recebe o token de confirmação.</span>
            </div>
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="verification-title">
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <p className={styles.status}>CONFIRMAÇÃO DE E-MAIL</p>
              <h1
                ref={resultTitleRef}
                id="verification-title"
                tabIndex={state === 'checking' ? undefined : -1}
              >
                {resultTitle}
              </h1>
              <p>Esta verificação acontece uma única vez e não exibe dados da conta.</p>
            </div>

            {state === 'checking' && (
              <div className={styles.neutralAlert} role="status" aria-live="polite">
                <strong>Validando link seguro...</strong>
                <span>{message}</span>
              </div>
            )}

            {state === 'success' && (
              <div className={styles.successAlert} role="status" aria-live="polite">
                <strong>Confirmação concluída.</strong>
                <span>{message}</span>
                <Link href="/login">Entrar na Evolvia</Link>
              </div>
            )}

            {state === 'rejected' && (
              <div className={styles.alert} role="alert">
                {message} Solicite um novo link pela jornada de acesso.
              </div>
            )}

            {state === 'unavailable' && (
              <div className={styles.alert} role="alert">
                {message}
              </div>
            )}

            {state !== 'checking' && state !== 'success' && (
              <Link className={styles.primaryButton} href="/login">
                Voltar para entrar
              </Link>
            )}

            <div className={styles.securityNote}>
              <span aria-hidden="true">◈</span>
              <div><strong>Token removido da URL.</strong><br />O segredo não permanece no histórico nem aparece na interface.</div>
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
