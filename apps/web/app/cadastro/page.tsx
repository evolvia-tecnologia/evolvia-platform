'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, saveSession } from '../../lib/api';

type AuthResponse = {
  token: string;
  user: { id: string; name: string; email: string };
};

type TouchedFields = {
  name: boolean;
  email: boolean;
  password: boolean;
  passwordConfirmation: boolean;
};

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_BCRYPT_BYTES = 72;
const NAME_MAX_LENGTH = 120;
const EMAIL_MAX_LENGTH = 254;
const NAME_PATTERN = /^[\p{L}\p{M}'’.\-\s]+$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const UPPERCASE_PATTERN = /\p{Lu}/u;
const NUMBER_PATTERN = /\p{N}/u;
const SYMBOL_PATTERN = /[^\p{L}\p{N}\s]/u;

function passwordCharacterLength(value: string): number {
  return Array.from(value).length;
}

function passwordUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function normalizedName(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

function nameValidationMessage(value: string): string {
  const normalized = normalizedName(value);
  if (!normalized) return 'Informe seu nome.';
  if (Array.from(normalized).length < 2) return 'O nome deve ter pelo menos 2 caracteres.';
  if (Array.from(normalized).length > NAME_MAX_LENGTH) return `O nome deve ter no máximo ${NAME_MAX_LENGTH} caracteres.`;
  if (!NAME_PATTERN.test(normalized)) return 'Use apenas letras, espaços, hífen, apóstrofo ou ponto no nome.';
  return '';
}

function emailValidationMessage(value: string): string {
  const normalized = value.trim();
  if (!normalized) return 'Informe seu e-mail.';
  if (normalized.length > EMAIL_MAX_LENGTH) return `O e-mail deve ter no máximo ${EMAIL_MAX_LENGTH} caracteres.`;
  if (!EMAIL_PATTERN.test(normalized)) return 'Informe um e-mail válido, por exemplo nome@dominio.com.br.';
  return '';
}

export default function CadastroPage() {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState('');
  const [serverEmailError, setServerEmailError] = useState('');
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [touched, setTouched] = useState<TouchedFields>({
    name: false,
    email: false,
    password: false,
    passwordConfirmation: false,
  });

  const nameError = nameValidationMessage(name);
  const emailError = emailValidationMessage(email);

  const passwordChecks = useMemo(
    () => [
      { label: 'Pelo menos 8 caracteres', complete: passwordCharacterLength(password) >= PASSWORD_MIN_LENGTH },
      { label: 'Uma letra maiúscula', complete: UPPERCASE_PATTERN.test(password) },
      { label: 'Um número', complete: NUMBER_PATTERN.test(password) },
      { label: 'Um símbolo, como ! @ # $ % & *', complete: SYMBOL_PATTERN.test(password) },
      {
        label: 'Tamanho compatível com o limite de segurança',
        complete: passwordUtf8ByteLength(password) <= PASSWORD_MAX_BCRYPT_BYTES,
      },
    ],
    [password],
  );

  const completedRequirements = passwordChecks.filter((item) => item.complete).length;
  const passwordIsStrong = completedRequirements === passwordChecks.length;
  const confirmationMatches = password.length > 0 && password === passwordConfirmation;
  const passwordError = !password
    ? 'Informe uma senha.'
    : !passwordIsStrong
      ? 'A senha ainda não atende a todos os requisitos de segurança.'
      : '';
  const confirmationError = !passwordConfirmation
    ? 'Confirme sua senha.'
    : !confirmationMatches
      ? 'A confirmação não corresponde à senha informada.'
      : '';

  function markTouched(field: keyof TouchedFields): void {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  function focusFirstInvalid(): void {
    if (nameError) nameRef.current?.focus();
    else if (emailError) emailRef.current?.focus();
    else if (passwordError) passwordRef.current?.focus();
    else if (confirmationError) confirmationRef.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setServerEmailError('');
    setTouched({ name: true, email: true, password: true, passwordConfirmation: true });

    if (nameError || emailError || passwordError || confirmationError) {
      setError('Revise os campos destacados antes de continuar.');
      requestAnimationFrame(focusFirstInvalid);
      return;
    }

    setLoading(true);

    try {
      const response = await api<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: normalizedName(name),
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      saveSession(response.token, response.user);
      router.push('/painel');
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        const message = reason.message || 'Este e-mail já está vinculado a uma conta.';
        setServerEmailError(message);
        setError('Não foi possível criar a conta. Revise o e-mail informado.');
        requestAnimationFrame(() => emailRef.current?.focus());
      } else {
        setError(reason instanceof Error ? reason.message : 'Não foi possível criar a conta.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/">EVOLVIA</Link>
        <Link className="btn-link" href="/login">Já tenho conta</Link>
      </header>

      <section className="auth-card">
        <p className="event-status">ORGANIZADOR</p>
        <h1>Crie sua conta</h1>
        <p className="muted">Você levará menos de um minuto. Depois, a EVA começa a construir o evento com você.</p>

        {error && <div className="error" role="alert">{error}</div>}

        <form onSubmit={submit} noValidate>
          <div className="form-group">
            <label htmlFor="name">Seu nome</label>
            <input
              ref={nameRef}
              className="input"
              id="name"
              name="name"
              required
              maxLength={NAME_MAX_LENGTH}
              autoComplete="name"
              value={name}
              aria-invalid={touched.name && Boolean(nameError)}
              aria-describedby={touched.name && nameError ? 'name-error' : undefined}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => markTouched('name')}
            />
            {touched.name && nameError && <span className="error-text" id="name-error">{nameError}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="email">E-mail</label>
            <input
              ref={emailRef}
              className="input"
              id="email"
              name="email"
              type="email"
              required
              maxLength={EMAIL_MAX_LENGTH}
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="email"
              value={email}
              aria-invalid={(touched.email && Boolean(emailError)) || Boolean(serverEmailError)}
              aria-describedby={(touched.email && emailError) || serverEmailError ? 'email-error email-help' : 'email-help'}
              onChange={(event) => {
                setEmail(event.target.value);
                setServerEmailError('');
              }}
              onBlur={() => markTouched('email')}
            />
            <span className="muted small" id="email-help">Use um endereço ao qual você tenha acesso.</span>
            {((touched.email && emailError) || serverEmailError) && (
              <span className="error-text" id="email-error">{serverEmailError || emailError}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <input
              ref={passwordRef}
              className="input"
              id="password"
              name="password"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              aria-invalid={touched.password && Boolean(passwordError)}
              aria-describedby="password-requirements password-progress"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onBlur={() => markTouched('password')}
            />
            <p className="muted small" id="password-progress" aria-live="polite">
              Requisitos atendidos: {completedRequirements} de {passwordChecks.length}.
            </p>
            <ul className="muted small" id="password-requirements">
              {passwordChecks.map((item) => (
                <li key={item.label}>
                  {item.complete ? '✓ Atendido' : '○ Pendente'} — {item.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="form-group">
            <label htmlFor="passwordConfirmation">Confirmar senha</label>
            <input
              ref={confirmationRef}
              className="input"
              id="passwordConfirmation"
              name="passwordConfirmation"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              aria-invalid={touched.passwordConfirmation && Boolean(confirmationError)}
              aria-describedby="password-confirmation-status"
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              onBlur={() => markTouched('passwordConfirmation')}
            />
            <span
              className={touched.passwordConfirmation && confirmationError ? 'error-text' : 'muted small'}
              id="password-confirmation-status"
              aria-live="polite"
            >
              {passwordConfirmation.length === 0
                ? 'Digite novamente a senha para confirmar.'
                : confirmationMatches
                  ? 'As senhas correspondem.'
                  : 'As senhas ainda não correspondem.'}
            </span>
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading} aria-disabled={loading}>
            {loading ? 'Criando conta...' : 'Criar conta e continuar'}
          </button>
        </form>
      </section>
    </main>
  );
}
