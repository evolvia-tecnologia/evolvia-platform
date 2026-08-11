'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, saveSession } from '../../lib/api';

type AuthResponse = {
  token: string;
  user: { id: string; name: string; email: string };
};

const PASSWORD_MIN_LENGTH = 8;
const UPPERCASE_PATTERN = /\p{Lu}/u;
const NUMBER_PATTERN = /\p{N}/u;
const SYMBOL_PATTERN = /[^\p{L}\p{N}\s]/u;

export default function CadastroPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');

  const passwordChecks = useMemo(
    () => [
      { label: 'Pelo menos 8 caracteres', complete: password.length >= PASSWORD_MIN_LENGTH },
      { label: 'Uma letra maiúscula', complete: UPPERCASE_PATTERN.test(password) },
      { label: 'Um número', complete: NUMBER_PATTERN.test(password) },
      { label: 'Um símbolo, como ! @ # $ % & *', complete: SYMBOL_PATTERN.test(password) },
    ],
    [password],
  );

  const completedRequirements = passwordChecks.filter((item) => item.complete).length;
  const passwordIsStrong = completedRequirements === passwordChecks.length;
  const confirmationMatches = password.length > 0 && password === passwordConfirmation;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!passwordIsStrong) {
      setError('Sua senha ainda não atende a todos os requisitos de segurança.');
      return;
    }

    if (!confirmationMatches) {
      setError('A confirmação de senha não corresponde à senha informada.');
      return;
    }

    setLoading(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await api<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          email: form.get('email'),
          password,
        }),
      });
      saveSession(response.token, response.user);
      router.push('/painel');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar a conta.');
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

        <form onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="name">Seu nome</label>
            <input className="input" id="name" name="name" required minLength={2} autoComplete="name" />
          </div>

          <div className="form-group">
            <label htmlFor="email">E-mail</label>
            <input className="input" id="email" name="email" type="email" required autoComplete="email" />
          </div>

          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <input
              className="input"
              id="password"
              name="password"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              aria-describedby="password-requirements password-progress"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
              className="input"
              id="passwordConfirmation"
              name="passwordConfirmation"
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              aria-describedby="password-confirmation-status"
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
            />
            <span className="muted small" id="password-confirmation-status" aria-live="polite">
              {passwordConfirmation.length === 0
                ? 'Digite novamente a senha para confirmar.'
                : confirmationMatches
                  ? 'As senhas correspondem.'
                  : 'As senhas ainda não correspondem.'}
            </span>
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Criando conta...' : 'Criar conta e continuar'}
          </button>
        </form>
      </section>
    </main>
  );
}
