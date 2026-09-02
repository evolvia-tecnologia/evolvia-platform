'use client';

import Link from 'next/link';
import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PublicSiteHeader from '../../components/public-site-header';
import { api, saveSession } from '../../lib/api';
import styles from '../auth-layout.module.css';

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
      setError(reason instanceof Error ? reason.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <PublicSiteHeader current="login" />

      <div className={styles.workspace}>
        <section className={styles.hero} aria-labelledby="auth-hero-title">
          <p className={styles.eyebrow}>PLATAFORMA COMPLETA PARA EVENTOS</p>
          <h1 id="auth-hero-title">Grandes eventos começam com <strong>boas conexões.</strong></h1>
          <p className={styles.heroText}>
            Do planejamento à experiência, a Evolvia conecta organizadores, participantes e toda a comunidade do evento em um só lugar.
          </p>

          <div className={styles.benefits} aria-label="Benefícios da Evolvia">
            <div className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden="true">01</span>
              <strong>Eventos mais simples</strong>
              <span>Jornadas guiadas e configuração progressiva.</span>
            </div>
            <div className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden="true">02</span>
              <strong>Pessoas mais conectadas</strong>
              <span>Experiências integradas para cada perfil.</span>
            </div>
            <div className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden="true">03</span>
              <strong>Resultados mais fortes</strong>
              <span>Dados e operação no mesmo ecossistema.</span>
            </div>
          </div>

          <div className={styles.evaCard}>
            <span className={styles.evaIcon} aria-hidden="true">✦</span>
            <div>
              <strong>Assistente EVA</strong>
              <span>Sua parceira inteligente para orientar a criação e a gestão do evento.</span>
            </div>
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="login-title">
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <p className={styles.status}>BEM-VINDO(A) DE VOLTA</p>
              <h1 id="login-title">Entrar na Evolvia</h1>
              <p>Acesse sua conta e continue de onde parou.</p>
            </div>

            {error && <div className={styles.alert} role="alert">{error}</div>}

            <form className={styles.form} onSubmit={submit} noValidate>
              <div className={styles.field}>
                <label htmlFor="email">E-mail</label>
                <input
                  ref={emailRef}
                  className={styles.input}
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
                  placeholder="seu@email.com.br"
                  value={email}
                  aria-invalid={emailTouched && Boolean(emailError)}
                  aria-describedby={emailTouched && emailError ? 'login-email-error' : undefined}
                  onChange={(event) => setEmail(event.target.value)}
                  onBlur={() => setEmailTouched(true)}
                />
                {emailTouched && emailError && <span className={styles.errorText} id="login-email-error">{emailError}</span>}
              </div>

              <div className={styles.field}>
                <label htmlFor="password">Senha</label>
                <div className={styles.inputWrap}>
                  <input
                    ref={passwordRef}
                    className={styles.input}
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="Digite sua senha"
                    value={password}
                    aria-invalid={passwordTouched && Boolean(passwordError)}
                    aria-describedby={passwordTouched && passwordError ? 'login-password-error' : undefined}
                    onChange={(event) => setPassword(event.target.value)}
                    onBlur={() => setPasswordTouched(true)}
                  />
                  <button
                    className={styles.togglePassword}
                    type="button"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    <span aria-hidden="true">{showPassword ? '◉' : '◎'}</span>
                  </button>
                </div>
                {passwordTouched && passwordError && <span className={styles.errorText} id="login-password-error">{passwordError}</span>}
              </div>

              <div className={styles.actionsRow}>
                <span className={styles.futureLink}>Recuperação de senha será habilitada junto do fluxo seguro.</span>
              </div>

              <button className={styles.primaryButton} type="submit" disabled={loading} aria-disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar na minha conta'}
              </button>

              <div className={styles.divider} aria-hidden="true">ou</div>
              <p className={styles.accountPrompt}>Primeira vez por aqui? <Link href="/cadastro">Criar conta</Link></p>
            </form>

            <div className={styles.securityNote}>
              <span aria-hidden="true">◈</span>
              <div><strong>Seus dados estão protegidos.</strong><br />A Evolvia aplica controles de segurança, privacidade e acesso por contexto.</div>
            </div>
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <span>Evolvia — tecnologia para eventos.</span>
        <nav className={styles.footerLinks} aria-label="Documentos jurídicos">
          <Link href="/termos-de-uso">Termos de Uso</Link>
          <Link href="/privacidade">Privacidade</Link>
        </nav>
      </footer>
    </main>
  );
}
