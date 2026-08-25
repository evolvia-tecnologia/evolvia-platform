'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import styles from '../auth-layout.module.css';

type ResetResponse = { message: string };

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BCRYPT_BYTES = 72;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const UPPERCASE_PATTERN = /\p{Lu}/u;
const NUMBER_PATTERN = /\p{N}/u;
const SYMBOL_PATTERN = /[^\p{L}\p{N}\s]/u;

function passwordCharacterLength(value: string): number {
  return Array.from(value).length;
}

function passwordUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export default function ResetPasswordPage() {
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [touched, setTouched] = useState({ password: false, confirmation: false });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const receivedToken = fragment.get('token') ?? '';
    setToken(TOKEN_PATTERN.test(receivedToken) ? receivedToken : '');
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  useEffect(() => {
    if (!success) return;
    requestAnimationFrame(() => successRef.current?.focus());
  }, [success]);

  const passwordChecks = useMemo(
    () => [
      { label: 'Pelo menos 8 caracteres', complete: passwordCharacterLength(password) >= PASSWORD_MIN_LENGTH },
      { label: 'Uma letra maiúscula', complete: UPPERCASE_PATTERN.test(password) },
      { label: 'Um número', complete: NUMBER_PATTERN.test(password) },
      { label: 'Um símbolo, como ! @ # $ % & *', complete: SYMBOL_PATTERN.test(password) },
      {
        label: 'Tamanho compatível com o limite de segurança',
        complete: password.length > 0 && passwordUtf8ByteLength(password) <= PASSWORD_MAX_BCRYPT_BYTES,
      },
    ],
    [password],
  );

  const completedRequirements = passwordChecks.filter((item) => item.complete).length;
  const passwordIsStrong = completedRequirements === passwordChecks.length;
  const confirmationMatches = password.length > 0 && password === confirmation;
  const passwordError = !password
    ? 'Informe a nova senha.'
    : !passwordIsStrong
      ? 'A senha ainda não atende a todos os requisitos de segurança.'
      : '';
  const confirmationError = !confirmation
    ? 'Confirme a nova senha.'
    : !confirmationMatches
      ? 'A confirmação não corresponde à senha informada.'
      : '';

  function focusFirstInvalid(): void {
    if (passwordError) passwordRef.current?.focus();
    else if (confirmationError) confirmationRef.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setTouched({ password: true, confirmation: true });

    if (!token) {
      setError('O link de redefinição é inválido, expirou ou já foi utilizado.');
      return;
    }

    if (passwordError || confirmationError) {
      setError('Revise os campos destacados antes de continuar.');
      requestAnimationFrame(focusFirstInvalid);
      return;
    }

    setLoading(true);
    try {
      const response = await api<ResetResponse>('/auth/password/reset', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword: password }),
      });
      setSuccess(response.message);
      setToken('');
      setPassword('');
      setConfirmation('');
      setShowPassword(false);
      setShowConfirmation(false);
      setTouched({ password: false, confirmation: false });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Não foi possível redefinir a senha agora.',
      );
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
        <section className={styles.hero} aria-labelledby="reset-hero-title">
          <p className={styles.eyebrow}>NOVA SENHA, MESMA JORNADA</p>
          <h1 id="reset-hero-title">Recupere o acesso com uma senha <strong>mais forte.</strong></h1>
          <p className={styles.heroText}>
            O link é individual, temporário e deixa de funcionar assim que a senha for alterada.
          </p>

          <div className={styles.benefits} aria-label="Proteções da redefinição">
            <div className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden="true">01</span>
              <strong>Uso único</strong>
              <span>O token não pode ser reutilizado após a troca.</span>
            </div>
            <div className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden="true">02</span>
              <strong>Política forte</strong>
              <span>A senha segue os mesmos requisitos do cadastro.</span>
            </div>
            <div className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden="true">03</span>
              <strong>Consumo atômico</strong>
              <span>Troca e invalidação ocorrem juntas no servidor.</span>
            </div>
          </div>

          <div className={styles.evaCard}>
            <span className={styles.evaIcon} aria-hidden="true">✦</span>
            <div>
              <strong>Orientação sem acesso ao segredo</strong>
              <span>A EVA explica os requisitos, mas nunca lê ou armazena sua senha.</span>
            </div>
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="reset-title">
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <p className={styles.status}>REDEFINIR ACESSO</p>
              <h1 id="reset-title">Crie uma nova senha</h1>
              <p>Use uma combinação forte e diferente das suas senhas anteriores.</p>
            </div>

            {token === null && (
              <div className={styles.neutralAlert} role="status" aria-live="polite">
                Validando o link seguro...
              </div>
            )}
            {token === '' && !success && (
              <div className={styles.alert} role="alert">
                O link de redefinição é inválido, expirou ou já foi utilizado.{' '}
                <Link href="/esqueci-senha">Solicite um novo link</Link>.
              </div>
            )}
            {error && <div className={styles.alert} role="alert">{error}</div>}
            {success && (
              <div
                ref={successRef}
                className={styles.successAlert}
                role="status"
                aria-live="polite"
                tabIndex={-1}
              >
                <strong>Senha atualizada.</strong>
                <span>{success}</span>
                <div className={styles.successActions}>
                  <Link href="/login">Entrar com a nova senha</Link>
                </div>
              </div>
            )}

            {token && !success && (
              <form className={styles.form} onSubmit={submit} noValidate>
                <div className={styles.field}>
                  <label htmlFor="new-password">Nova senha</label>
                  <div className={styles.inputWrap}>
                    <input
                      ref={passwordRef}
                      className={styles.input}
                      id="new-password"
                      name="newPassword"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={PASSWORD_MIN_LENGTH}
                      autoComplete="new-password"
                      value={password}
                      aria-invalid={touched.password && Boolean(passwordError)}
                      aria-describedby="reset-password-progress reset-password-requirements"
                      onChange={(event) => setPassword(event.target.value)}
                      onBlur={() => setTouched((current) => ({ ...current, password: true }))}
                    />
                    <button
                      className={styles.togglePassword}
                      type="button"
                      aria-label={showPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((current) => !current)}
                    >
                      <span aria-hidden="true">{showPassword ? '◉' : '◎'}</span>
                    </button>
                  </div>
                </div>

                <div className={styles.field}>
                  <label htmlFor="new-password-confirmation">Confirmar nova senha</label>
                  <div className={styles.inputWrap}>
                    <input
                      ref={confirmationRef}
                      className={styles.input}
                      id="new-password-confirmation"
                      name="newPasswordConfirmation"
                      type={showConfirmation ? 'text' : 'password'}
                      required
                      minLength={PASSWORD_MIN_LENGTH}
                      autoComplete="new-password"
                      value={confirmation}
                      aria-invalid={touched.confirmation && Boolean(confirmationError)}
                      aria-describedby="reset-confirmation-status"
                      onChange={(event) => setConfirmation(event.target.value)}
                      onBlur={() => setTouched((current) => ({ ...current, confirmation: true }))}
                    />
                    <button
                      className={styles.togglePassword}
                      type="button"
                      aria-label={showConfirmation ? 'Ocultar confirmação' : 'Mostrar confirmação'}
                      aria-pressed={showConfirmation}
                      onClick={() => setShowConfirmation((current) => !current)}
                    >
                      <span aria-hidden="true">{showConfirmation ? '◉' : '◎'}</span>
                    </button>
                  </div>
                  <span
                    className={touched.confirmation && confirmationError ? styles.errorText : styles.help}
                    id="reset-confirmation-status"
                    aria-live="polite"
                  >
                    {confirmation.length === 0
                      ? 'Digite novamente a nova senha.'
                      : confirmationMatches
                        ? 'As senhas correspondem.'
                        : 'As senhas ainda não correspondem.'}
                  </span>
                </div>

                <div className={styles.passwordGuidance}>
                  <span className={styles.passwordProgress} id="reset-password-progress" aria-live="polite">
                    Segurança da senha: {completedRequirements} de {passwordChecks.length} requisitos atendidos.
                  </span>
                  <ul className={styles.requirements} id="reset-password-requirements">
                    {passwordChecks.map((item) => (
                      <li className={item.complete ? styles.requirementDone : undefined} key={item.label}>
                        <span className={styles.requirementMark} aria-hidden="true">{item.complete ? '✓' : '○'}</span>
                        <span>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button className={styles.primaryButton} type="submit" disabled={loading} aria-disabled={loading}>
                  {loading ? 'Atualizando senha...' : 'Salvar nova senha'}
                </button>
              </form>
            )}

            <div className={styles.securityNote}>
              <span aria-hidden="true">◈</span>
              <div><strong>Link removido da barra de endereço.</strong><br />O token é capturado e apagado da URL antes do envio seguro.</div>
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
