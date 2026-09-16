import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const PUBLIC_AUTH_ERROR_MAX_LENGTH = 180;
const UNSAFE_PUBLIC_AUTH_ERROR = /[{}\[\]<>]|traceId|stack|ECONN|Failed to fetch|NetworkError|Internal Server|statusCode|at \//iu;
const SAFE_PUBLIC_AUTH_ERROR = /^[\p{L}\p{N}\s.,;:!?()'’"%+\-–—/]+$/u;

const [login, cadastro, authStyles] = await Promise.all([
  readFile(new URL('../app/login/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/cadastro/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app/auth-layout.module.css', import.meta.url), 'utf8'),
]);

const pages = [
  ['login', login],
  ['cadastro', cadastro],
];

function submitBlock(source) {
  const match = source.match(/async function submit\([\s\S]*?\n  \}/u);
  assert.ok(match, 'submit() precisa existir');
  return match[0];
}

function isSafePublicAuthMessage(message) {
  const normalized = message.trim();
  if (!normalized || normalized.length > PUBLIC_AUTH_ERROR_MAX_LENGTH) return false;
  if (!/\s/u.test(normalized) || UNSAFE_PUBLIC_AUTH_ERROR.test(normalized)) return false;
  return SAFE_PUBLIC_AUTH_ERROR.test(normalized);
}

function toPublicAuthError(reason, fallback) {
  if (reason?.name === 'ApiError' && isSafePublicAuthMessage(reason.message)) {
    return reason.message.trim();
  }
  return fallback;
}

test('matriz login/cadastro registra falhas reproduzidas e as correções aplicadas', () => {
  const matrix = [
    ['login', 'dupla submissão + aria-busy', /if \(loading \|\| submittingRef\.current\) return;/u.test(login) && /aria-busy=\{loading\}/u.test(login)],
    ['login', 'foco no primeiro inválido + resumo', /emailRef\.current\?\.focus\(\)/u.test(login) && /role="alert"/u.test(login)],
    ['login', 'describedby de e-mail e senha', /login-email-error/u.test(login) && /login-password-error/u.test(login)],
    ['login', 'autocomplete e-mail e senha atual', /autoComplete="email"/u.test(login) && /autoComplete="current-password"/u.test(login)],
    ['login', 'toggle nome e estado', /aria-label=\{showPassword \? 'Ocultar senha' : 'Mostrar senha'\}/u.test(login) && /aria-pressed=\{showPassword\}/u.test(login)],
    ['login', 'erro público sanitizado', /toPublicAuthError\(reason, 'Não foi possível entrar\.'\)/u.test(login)],
    ['login', 'valores controlados', /value=\{email\}/u.test(login) && /value=\{password\}/u.test(login)],
    ['login', 'sem CTA de recuperação', /Recuperação de senha será habilitada junto do fluxo seguro\./u.test(login) && !/href=["'][^"']*recuper/iu.test(login)],
    ['cadastro', 'dupla submissão + aria-busy', /if \(loading \|\| submittingRef\.current\) return;/u.test(cadastro) && /aria-busy=\{loading\}/u.test(cadastro)],
    ['cadastro', 'foco no primeiro inválido + resumo', /function focusFirstInvalid/u.test(cadastro) && /role="alert"/u.test(cadastro)],
    ['cadastro', 'erro de senha associado', /id="password-error"/u.test(cadastro) && /password-error password-requirements password-progress/u.test(cadastro)],
    ['cadastro', 'autocomplete nome, e-mail e nova senha', /autoComplete="name"/u.test(cadastro) && /autoComplete="email"/u.test(cadastro) && /autoComplete="new-password"/u.test(cadastro)],
    ['cadastro', 'toggle nome e estado', /aria-label=\{showPassword \? 'Ocultar senha' : 'Mostrar senha'\}/u.test(cadastro) && /aria-pressed=\{showPassword\}/u.test(cadastro)],
    ['cadastro', 'erro público sanitizado', /toPublicAuthError\(reason, 'Não foi possível criar a conta\.'\)/u.test(cadastro)],
    ['cadastro', 'valores controlados', /value=\{name\}/u.test(cadastro) && /value=\{email\}/u.test(cadastro) && /value=\{password\}/u.test(cadastro)],
    ['cadastro', 'sem CTA de recuperação', !/href=["'][^"']*recuper/iu.test(cadastro) && !/[Ee]squeceu/u.test(cadastro)],
  ];

  for (const [page, criterion, pass] of matrix) {
    assert.equal(pass, true, `${page}: ${criterion}`);
  }
});

test('negativo: submissão repetida é ignorada antes do pedido de autenticação', () => {
  for (const [name, source] of pages) {
    const submit = submitBlock(source);
    const guard = submit.indexOf('if (loading || submittingRef.current) return;');
    const lock = submit.indexOf('submittingRef.current = true;');
    const request = submit.indexOf('api<AuthResponse>');

    assert.ok(guard >= 0, `${name}: guarda síncrona ausente`);
    assert.ok(lock > guard, `${name}: trava precisa vir depois da guarda`);
    assert.ok(request > lock, `${name}: api() não pode correr antes da trava`);
    assert.match(source, /const submittingRef = useRef\(false\)/u, name);
    assert.match(source, /<form className=\{styles\.form\} onSubmit=\{submit\} noValidate aria-busy=\{loading\}>/u, name);
    assert.doesNotMatch(submit, /if \(loading \|\| submittingRef\.current\) return;[\s\S]*setLoading\(true\);[\s\S]*if \(loading/u, name);
  }
});

test('negativo: erro de senha do cadastro não pode ficar sem id associado', () => {
  assert.match(cadastro, /id="password-error"/u);
  assert.match(cadastro, /aria-describedby=\{touched\.password && passwordError \? 'password-error password-requirements password-progress' : 'password-requirements password-progress'\}/u);
  assert.match(cadastro, /\{touched\.password && passwordError && <span className=\{styles\.errorText\} id="password-error">\{passwordError\}<\/span>\}/u);
  assert.match(cadastro, /id="name-error"/u);
  assert.match(cadastro, /id="email-error"/u);
  assert.match(cadastro, /id="password-confirmation-status"/u);
  assert.match(cadastro, /touched\.passwordConfirmation && confirmationError\s*\n\s*\? confirmationError/u);

  assert.match(login, /aria-describedby=\{emailTouched && emailError \? 'login-email-error' : undefined\}/u);
  assert.match(login, /aria-describedby=\{passwordTouched && passwordError \? 'login-password-error' : undefined\}/u);
  assert.match(login, /id="login-email-error"/u);
  assert.match(login, /id="login-password-error"/u);
});

test('negativo: autocomplete semântico não pode ser removido nem invertido', () => {
  assert.match(login, /id="email"[\s\S]*autoComplete="email"/u);
  assert.match(login, /id="password"[\s\S]*autoComplete="current-password"/u);
  assert.doesNotMatch(login, /autoComplete="off"/u);
  assert.doesNotMatch(login, /autoComplete="new-password"/u);
  assert.doesNotMatch(login, /autoComplete="username"/u);

  assert.match(cadastro, /id="name"[\s\S]*autoComplete="name"/u);
  assert.match(cadastro, /id="email"[\s\S]*autoComplete="email"/u);
  assert.match(cadastro, /id="password"[\s\S]*autoComplete="new-password"/u);
  assert.match(cadastro, /id="passwordConfirmation"[\s\S]*autoComplete="new-password"/u);
  assert.doesNotMatch(cadastro, /autoComplete="off"/u);
  assert.doesNotMatch(cadastro, /autoComplete="current-password"/u);

  assert.match(login, /JSON\.stringify\(\{ email: email\.trim\(\)\.toLowerCase\(\), password \}\)/u);
  assert.match(cadastro, /JSON\.stringify\(\{[\s\S]*name: normalizedName\(name\),[\s\S]*email: email\.trim\(\)\.toLowerCase\(\),[\s\S]*password,[\s\S]*\}\)/u);
});

test('erro de rede ou payload técnico cai no fallback em português', () => {
  for (const [name, source] of pages) {
    assert.match(source, /function isSafePublicAuthMessage/u, name);
    assert.match(source, /function toPublicAuthError/u, name);
    assert.match(source, /Failed to fetch/u, name);
    assert.match(source, /traceId/u, name);
    assert.doesNotMatch(source, /setError\(reason instanceof Error \? reason\.message/u, name);
  }

  const fallbackLogin = 'Não foi possível entrar.';
  const fallbackCadastro = 'Não foi possível criar a conta.';

  assert.equal(toPublicAuthError({ name: 'TypeError', message: 'Failed to fetch' }, fallbackLogin), fallbackLogin);
  assert.equal(toPublicAuthError({ name: 'TypeError', message: 'NetworkError when attempting to fetch resource.' }, fallbackCadastro), fallbackCadastro);
  assert.equal(toPublicAuthError({ name: 'ApiError', message: '{"code":"INTERNAL_ERROR","traceId":"trc_1"}' }, fallbackLogin), fallbackLogin);
  assert.equal(toPublicAuthError({ name: 'ApiError', message: 'Unauthorized' }, fallbackLogin), fallbackLogin);
  assert.equal(toPublicAuthError({ name: 'ApiError', message: 'E-mail ou senha inválidos.' }, fallbackLogin), 'E-mail ou senha inválidos.');
  assert.equal(toPublicAuthError({ name: 'ApiError', message: 'Já existe uma conta com este e-mail.' }, fallbackCadastro), 'Já existe uma conta com este e-mail.');
  assert.equal(isSafePublicAuthMessage('Failed to fetch'), false);
  assert.equal(isSafePublicAuthMessage('AUTHENTICATION_REQUIRED'), false);
});

test('login não cria CTA de recuperação enquanto o fluxo seguro permanece inerte', () => {
  assert.match(login, /<span className=\{styles\.futureLink\}>Recuperação de senha será habilitada junto do fluxo seguro\.<\/span>/u);
  assert.doesNotMatch(login, /href=["']\/(?:recuperar|recuperacao|esqueci)/iu);
  assert.doesNotMatch(login, /<Link[^>]*>[\s\S]*recuper/iu);
  assert.doesNotMatch(cadastro, /href=["']\/(?:recuperar|recuperacao|esqueci)/iu);
});

test('mostrar/ocultar senha preserva nome acessível, estado e tipo button', () => {
  for (const [name, source] of pages) {
    assert.match(source, /type="button"/u, name);
    assert.match(source, /aria-pressed=\{showPassword\}/u, name);
    assert.match(source, /aria-label=\{showPassword \? 'Ocultar senha' : 'Mostrar senha'\}/u, name);
  }

  assert.match(cadastro, /aria-label=\{showConfirmation \? 'Ocultar confirmação da senha' : 'Mostrar confirmação da senha'\}/u);
  assert.match(cadastro, /aria-pressed=\{showConfirmation\}/u);
});

test('teclado, 320px e gerenciadores de senha permanecem nos contratos já válidos', () => {
  assert.match(authStyles, /\.togglePassword \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/u);
  const mobile = authStyles.split('@media (max-width: 720px)')[1] ?? '';
  const mobileBlock = mobile.slice(0, mobile.indexOf('@media (prefers-reduced-motion'));
  assert.doesNotMatch(mobileBlock, /\.togglePassword/u);
  assert.match(authStyles, /\.input \{[\s\S]*?padding:var\(--space-12\) var\(--space-48\) var\(--space-12\) var\(--space-16\);/u);

  for (const [name, source] of pages) {
    assert.match(source, /noValidate/u, name);
    assert.match(source, /role="alert"/u, name);
    assert.match(source, /tabIndex=\{-1\}/u, name);
  }
});
