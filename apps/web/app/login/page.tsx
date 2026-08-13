'use client';

import Link from 'next/link';
import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, saveSession } from '../../lib/api';

type AuthResponse = { token: string; user: { id: string; name: string; email: string } };

const EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function emailValidationMessage(value: string): string {
  const normalized = value.trim();
  if (!normalized) return 'Informe seu e-mail.';
  if (normalized.length > EMAIL_MAX_LENGTH) return `O e-mail deve ter no máximo ${EMAIL_MAX_LENGTH} caracteres.`;
  if (!EMAIL_PATTERN.test(normalized)) return 'Informe um e-mail válido, por exemplo nome@dominio.com.br.';
  return '';
}

export default function LoginPage() {
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const emailError = emailValidationMessage(email);
  const passwordError = password ? '' : 'Informe sua senha.';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setEmailTouched(true);
    setPasswordTouched(true);

    if (emailError || passwordError) {
      setError('Revise os campos destacados antes de continuar.');
      requestAnimationFrame(() => {
        if (emailError) emailRef.current?.focus();
        else passwordRef.current?.focus();
      });
      return;
    }

    setLoading(true);
    try {
      const response = await api<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      saveSession(response.token, response.user);
      router.push('/painel');
    } catch (reason) {
      // A API deliberadamente não diferencia e-mail inexistente de senha incorreta.
      setError(reason instanceof Error ? reason.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/">EVOLVIA</Link>
        <Link className="btn-link" href="/cadastro">Criar conta</Link>
      </header>
      <section className="auth-card">
        <p className="event-status">BEM-VINDO DE VOLTA</p>
        <h1>Entrar na Evolvia</h1>
        {error && <div className="error" role="alert">{error}</div>}
        <form onSubmit={submit} noValidate>
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
              aria-invalid={emailTouched && Boolean(emailError)}
              aria-describedby={emailTouched && emailError ? 'login-email-error' : undefined}
              onChange={(event) => setEmail(event.target.value)}
              onBlur={() => setEmailTouched(true)}
            />
            {emailTouched && emailError && <span className="error-text" id="login-email-error">{emailError}</span>}
          </div>
          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <input
              ref={passwordRef}
              className="input"
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              aria-invalid={passwordTouched && Boolean(passwordError)}
              aria-describedby={passwordTouched && passwordError ? 'login-password-error' : undefined}
              onChange={(event) => setPassword(event.target.value)}
              onBlur={() => setPasswordTouched(true)}
            />
            <button
              className="btn btn-secondary btn-small"
              type="button"
              aria-pressed={showPassword}
              aria-label={showPassword ? 'Ocultar senha digitada' : 'Mostrar senha digitada'}
              onClick={() => {
                setShowPassword((current) => !current);
                requestAnimationFrame(() => passwordRef.current?.focus());
              }}
            >
              <span aria-hidden="true">👁</span>
              {showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            </button>
            {passwordTouched && passwordError && <span className="error-text" id="login-password-error">{passwordError}</span>}
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} aria-disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}
