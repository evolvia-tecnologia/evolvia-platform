'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import PublicSiteHeader from '../../components/public-site-header';
import { ApiError, api, saveSession } from '../../lib/api';
import styles from '../auth-layout.module.css';

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
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
      { label: 'Tamanho compatível com o limite de segurança', complete: password.length > 0 && passwordUtf8ByteLength(password) <= PASSWORD_MAX_BCRYPT_BYTES },
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
      router.push('/acesso');
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
    <div className={styles.page}>
      <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
      <PublicSiteHeader current="cadastro" />

      <main id="main-content" className={styles.workspace} tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="cadastro-hero-title">
          <p className={styles.eyebrow}>COMECE SUA JORNADA NA EVOLVIA</p>
          <h1 id="cadastro-hero-title">Seu próximo evento começa com uma experiência <strong>mais inteligente.</strong></h1>
          <p className={styles.heroText}>
            A conta Evolvia é única. Você pode organizar eventos e participar de outros usando o mesmo e-mail e senha.
          </p>

          <div className={styles.benefits} aria-label="Benefícios da Evolvia">
            <div className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden="true">01</span>
              <strong>Configuração guiada</strong>
              <span>Comece pelo essencial e aprofunde quando precisar.</span>
            </div>
            <div className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden="true">02</span>
              <strong>Experiência integrada</strong>
              <span>Organizador e público conectados à mesma jornada.</span>
            </div>
            <div className={styles.benefit}>
              <span className={styles.benefitIcon} aria-hidden="true">03</span>
              <strong>Segurança desde a origem</strong>
              <span>Permissões, privacidade e rastreabilidade por contexto.</span>
            </div>
          </div>

          <div className={styles.evaCard}>
            <span className={styles.evaIcon} aria-hidden="true">✦</span>
            <div>
              <strong>A EVA acompanha você</strong>
              <span>Depois do cadastro, ela ajuda a organizar o evento sem exigir conhecimento técnico.</span>
            </div>
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="cadastro-title">
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <p className={styles.status}>CADASTRO EVOLVIA</p>
              <h1 id="cadastro-title">Como você quer começar?</h1>
              <p>Escolha seu primeiro caminho. Depois, a mesma conta poderá acessar os dois ambientes.</p>
            </div>

            <nav className={styles.accountChoices} aria-label="Tipo de cadastro">
              <span aria-current="step">Organizar um evento</span>
              <Link href="/participante?cadastro=1">Acompanhar minhas inscrições</Link>
            </nav>
            <p className={styles.choiceHelp}>Para organizar, crie sua conta abaixo. Para participar, confirme sua primeira inscrição no cadastro de participante.</p>

            {error && <div className={styles.alert} role="alert">{error}</div>}

            <form className={styles.form} onSubmit={submit} noValidate>
              <div className={styles.field}>
                <label htmlFor="name">Seu nome</label>
                <input
                  ref={nameRef}
                  className={styles.input}
                  id="name"
                  name="name"
                  required
                  maxLength={NAME_MAX_LENGTH}
                  autoComplete="name"
                  placeholder="Como podemos chamar você?"
                  value={name}
                  aria-invalid={touched.name && Boolean(nameError)}
                  aria-describedby={touched.name && nameError ? 'name-error' : undefined}
                  onChange={(event) => setName(event.target.value)}
                  onBlur={() => markTouched('name')}
                />
                {touched.name && nameError && <span className={styles.errorText} id="name-error">{nameError}</span>}
              </div>

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
                  aria-invalid={(touched.email && Boolean(emailError)) || Boolean(serverEmailError)}
                  aria-describedby={(touched.email && emailError) || serverEmailError ? 'email-error email-help' : 'email-help'}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setServerEmailError('');
                  }}
                  onBlur={() => markTouched('email')}
                />
                <span className={styles.help} id="email-help">Esse endereço será usado nos fluxos seguros da sua conta.</span>
                {((touched.email && emailError) || serverEmailError) && (
                  <span className={styles.errorText} id="email-error">{serverEmailError || emailError}</span>
                )}
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
                    minLength={PASSWORD_MIN_LENGTH}
                    autoComplete="new-password"
                    aria-invalid={touched.password && Boolean(passwordError)}
                    aria-describedby="password-requirements password-progress"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onBlur={() => markTouched('password')}
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
              </div>

              <div className={styles.field}>
                <label htmlFor="passwordConfirmation">Confirmar senha</label>
                <div className={styles.inputWrap}>
                  <input
                    ref={confirmationRef}
                    className={styles.input}
                    id="passwordConfirmation"
                    name="passwordConfirmation"
                    type={showConfirmation ? 'text' : 'password'}
                    required
                    minLength={PASSWORD_MIN_LENGTH}
                    autoComplete="new-password"
                    aria-invalid={touched.passwordConfirmation && Boolean(confirmationError)}
                    aria-describedby="password-confirmation-status"
                    value={passwordConfirmation}
                    onChange={(event) => setPasswordConfirmation(event.target.value)}
                    onBlur={() => markTouched('passwordConfirmation')}
                  />
                  <button
                    className={styles.togglePassword}
                    type="button"
                    aria-label={showConfirmation ? 'Ocultar confirmação da senha' : 'Mostrar confirmação da senha'}
                    aria-pressed={showConfirmation}
                    onClick={() => setShowConfirmation((current) => !current)}
                  >
                    <span aria-hidden="true">{showConfirmation ? '◉' : '◎'}</span>
                  </button>
                </div>
                <span
                  className={touched.passwordConfirmation && confirmationError ? styles.errorText : styles.help}
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

              <div className={styles.passwordGuidance}>
                <span className={styles.passwordProgress} id="password-progress" aria-live="polite">
                  Segurança da senha: {completedRequirements} de {passwordChecks.length} requisitos atendidos.
                </span>
                <ul className={styles.requirements} id="password-requirements">
                  {passwordChecks.map((item) => (
                    <li className={item.complete ? styles.requirementDone : undefined} key={item.label}>
                      <span className={styles.requirementMark} aria-hidden="true">{item.complete ? '✓' : '○'}</span>
                      <span>{item.label}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button className={styles.primaryButton} type="submit" disabled={loading} aria-disabled={loading}>
                {loading ? 'Criando conta...' : 'Criar conta e continuar'}
              </button>

              <div className={styles.divider} aria-hidden="true">ou</div>
              <p className={styles.accountPrompt}>Já possui uma conta? <Link href="/login">Entrar na Evolvia</Link></p>
            </form>

            <div className={styles.securityNote}>
              <span aria-hidden="true">◈</span>
              <div><strong>Cadastro protegido e progressivo.</strong><br />Pedimos apenas os dados necessários para iniciar sua jornada.</div>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>Evolvia — tecnologia para eventos.</span>
        <nav className={styles.footerLinks} aria-label="Documentos jurídicos">
          <Link href="/termos-de-uso">Termos de Uso</Link>
          <Link href="/privacidade">Privacidade</Link>
        </nav>
      </footer>
    </div>
  );
}
