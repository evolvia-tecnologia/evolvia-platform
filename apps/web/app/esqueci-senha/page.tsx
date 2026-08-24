'use client';

import Link from 'next/link';
import { FormEvent, useRef, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import styles from '../auth-layout.module.css';

type RecoveryResponse = { message: string };

const EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function emailValidationMessage(value: string): string {
  const normalized = value.trim();
  if (!normalized) return 'Informe seu e-mail.';
  if (normalized.length > EMAIL_MAX_LENGTH) {
    return `O e-mail deve ter no máximo ${EMAIL_MAX_LENGTH} caracteres.`;
  }
  if (!EMAIL_PATTERN.test(normalized)) {
    return 'Informe um e-mail válido, por exemplo nome@dominio.com.br.';
  }
  return '';
}

export default function ForgotPasswordPage() {
  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const emailError = emailValidationMessage(email);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    setError('');
    setStatus('');

    if (emailError) {
      setError('Revise o e-mail informado antes de continuar.');
      requestAnimationFrame(() => emailRef.current?.focus());
      return;
    }

    setLoading(true);
    try {
      const response = await api<RecoveryResponse>('/auth/password/forgot', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setStatus(response.message);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 429) {
        setError('Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.');
      } else {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Não foi possível processar a solicitação agora.',
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
        <Link className={styles.headerLink} href="/login">Voltar para entrar</Link>
      </header>

      <div className={styles.workspace}>
        <section className={styles.hero} aria-labelledby="recovery-hero-title">
          <p className={styles.eyebrow}>RECUPERAÇÃO SEGURA DE ACESSO</p>
          <h1 id="recovery-hero-title">Retome sua jornada com <strong>segurança.</strong></h1>
          <p className={styles.heroText}>
            Informe o e-mail da conta. Se ele estiver elegível, enviaremos um link de uso único e validade curta.
          </p>

          <div className={styles.benefits} aria-label="Proteções da recuperação">
            <div className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden="true">01</span>
              <strong>Resposta privada</strong>
              <span>Não revelamos se uma conta está cadastrada.</span>
            </div>
            <div className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden="true">02</span>
              <strong>Link temporário</strong>
              <span>O acesso expira e só pode ser utilizado uma vez.</span>
            </div>
            <div className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden="true">03</span>
              <strong>Senha protegida</strong>
              <span>Nenhuma senha ou token aparece em logs e auditorias.</span>
            </div>
          </div>

          <div className={styles.evaCard}>
            <span className={styles.evaIcon} aria-hidden="true">✦</span>
            <div>
              <strong>A EVA protege sua privacidade</strong>
              <span>Ela pode orientar o fluxo, mas nunca acessa sua senha ou o link seguro.</span>
            </div>
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="recovery-title">
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <p className={styles.status}>RECUPERAR ACESSO</p>
              <h1 id="recovery-title">Esqueci minha senha</h1>
              <p>Use o e-mail ao qual você ainda tenha acesso.</p>
            </div>

            {error && <div className={styles.alert} role="alert">{error}</div>}
            {status && (
              <div className={styles.successAlert} role="status" aria-live="polite">
                <strong>Solicitação recebida.</strong>
                <span>{status}</span>
              </div>
            )}

            <form className={styles.form} onSubmit={submit} noValidate>
              <div className={styles.field}>
                <label htmlFor="recovery-email">E-mail</label>
                <input
                  ref={emailRef}
                  className={styles.input}
                  id="recovery-email"
                  name="email"
                  type="email"
                  required
                  maxLength={EMAIL_MAX_LENGTH}
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="email"
                  placeholder="seu@email.com.br"
                  value={email}
                  aria-invalid={touched && Boolean(emailError)}
                  aria-describedby={touched && emailError ? 'recovery-email-error recovery-email-help' : 'recovery-email-help'}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setStatus('');
                  }}
                  onBlur={() => setTouched(true)}
                />
                <span className={styles.help} id="recovery-email-help">
                  Por privacidade, a confirmação será sempre a mesma.
                </span>
                {touched && emailError && (
                  <span className={styles.errorText} id="recovery-email-error">{emailError}</span>
                )}
              </div>

              <button className={styles.primaryButton} type="submit" disabled={loading} aria-disabled={loading}>
                {loading ? 'Enviando solicitação...' : 'Enviar instruções seguras'}
              </button>

              <p className={styles.accountPrompt}>
                Lembrou sua senha? <Link href="/login">Entrar na Evolvia</Link>
              </p>
            </form>

            <div className={styles.securityNote}>
              <span aria-hidden="true">◈</span>
              <div><strong>Proteção contra abuso e enumeração.</strong><br />Solicitações repetidas são limitadas sem expor dados da conta.</div>
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
