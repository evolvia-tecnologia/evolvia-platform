'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import PublicSiteHeader from '../../components/public-site-header';
import ParticipantArea from '../../components/participant-area';
import { ApiError, api, clearSession, getToken, saveSession } from '../../lib/api';
import styles from './page.module.css';

type EventItem = {
  slug: string; name: string; profileCode: string | null; startDate: string | null;
  endDate: string | null; venue: string | null; status: string;
};
type Dashboard = { user: { name: string; email: string }; emailVerified: boolean; linked: boolean; events: EventItem[] };
type AuthResponse = { token: string; user: { id: string; name: string; email: string }; emailVerificationSent?: boolean };

const passwordEncoder = new TextEncoder();

function passwordRequirements(value: string) {
  return [
    { label: 'Pelo menos 8 caracteres', met: Array.from(value).length >= 8 },
    { label: 'Uma letra maiúscula', met: /\p{Lu}/u.test(value) },
    { label: 'Um número', met: /\p{N}/u.test(value) },
    { label: 'Um símbolo, como ! @ # $ % & *', met: /[^\p{L}\p{N}\s]/u.test(value) },
    { label: 'Até 72 bytes para proteger a senha', met: value.length > 0 && passwordEncoder.encode(value).length <= 72 },
  ];
}

function validCpf(value: string) {
  const digits = value.replace(/\D/gu, '');
  if (!/^[0-9]{11}$/u.test(digits) || /^(\d)\1{10}$/u.test(digits)) return false;
  return [9, 10].every((size) => {
    const sum = Array.from(digits.slice(0, size)).reduce((total, digit, index) => total + Number(digit) * (size + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return Number(digits[size]) === (remainder === 10 ? 0 : remainder);
  });
}

function formatCpf(value: string) {
  const digits = value.replace(/\D/gu, '').slice(0, 11);
  return digits.replace(/^(\d{3})(\d)/u, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/u, '$1.$2.$3').replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/u, '$1.$2.$3-$4');
}

export default function ParticipantEntryPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [documentType, setDocumentType] = useState<'cpf' | 'foreign'>('cpf');
  const [selected, setSelected] = useState<{ slug: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const checks = passwordRequirements(password);
  const strongPassword = checks.every((check) => check.met);

  const load = useCallback(async () => {
    const result = await api<Dashboard>('/participant/me');
    setDashboard(result);
    setError('');
    setReady(true);
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('cadastro') === '1') setMode('register');
  }, []);

  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    load().catch((caught: unknown) => {
      if (caught instanceof ApiError && caught.status === 401) clearSession();
      else setError(caught instanceof Error ? caught.message : 'Não foi possível carregar sua conta.');
      setReady(true);
    });
  }, [load]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === 'register' && (!strongPassword || password !== passwordConfirmation)) {
      setError('Revise a senha e sua confirmação antes de criar a conta.'); return;
    }
    setBusy(true); setError('');
    try {
      const response = await api<AuthResponse>(mode === 'login' ? '/auth/login' : '/auth/participant/register', {
        method: 'POST', body: JSON.stringify({
          email: email.trim().toLowerCase(), password, ...(mode === 'register' ? { name } : {}),
        }),
      });
      saveSession(response.token, response.user);
      if (mode === 'register' && response.emailVerificationSent === false) {
        setNotice('Conta criada. O envio do link de confirmação está temporariamente indisponível; tente reenviar mais tarde.');
      }
      setPassword(''); setPasswordConfirmation('');
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível entrar.'); }
    finally { setBusy(false); }
  }

  async function requestVerification() {
    setBusy(true); setError(''); setNotice('');
    try {
      await api<{ accepted: boolean }>('/auth/email-verification/request', { method: 'POST', body: '{}' });
      setNotice('Enviamos um novo link. Confira sua caixa de entrada e também a pasta de spam.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível enviar o link de confirmação.');
    } finally { setBusy(false); }
  }

  async function link(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (documentType === 'cpf' && !validCpf(document)) {
      setError('Informe um CPF válido, no formato 000.000.000-00.'); return;
    }
    if (documentType === 'foreign' && (!/^[A-Za-z0-9 .\/-]{5,50}$/u.test(document.trim()) || document.replace(/[ .\/-]/gu, '').length > 40)) {
      setError('Informe o documento estrangeiro usado na inscrição (5 a 40 letras ou números).'); return;
    }
    setBusy(true); setError('');
    try {
      const result = await api<Dashboard>('/participant/links', {
        method: 'POST', body: JSON.stringify({ identityDocument: document }),
      });
      setDashboard(result); setDocument('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível vincular sua inscrição.'); }
    finally { setBusy(false); }
  }

  async function openEvent(slug: string) {
    setBusy(true); setError('');
    try {
      const session = await api<{ accessToken: string }>(`/participant/events/${encodeURIComponent(slug)}/sessions`, {
        method: 'POST', body: '{}',
      });
      setSelected({ slug, token: session.accessToken });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível abrir a inscrição.'); }
    finally { setBusy(false); }
  }

  const exitEvent = useCallback((message?: string) => { setSelected(null); if (message) setError(message); }, []);

  const closeEvent = useCallback(() => {
    if (selected) {
      fetch(`/api/public/events/${encodeURIComponent(selected.slug)}/participant/sessions/current`, {
        method: 'DELETE', headers: { authorization: `Bearer ${selected.token}` },
      }).catch(() => {});
    }
    setSelected(null);
  }, [selected]);

  function logout() {
    closeEvent(); clearSession(); setDashboard(null); setSelected(null); setEmail(''); setPassword(''); setError('');
  }

  return <>
    <a className="skip-link" href="#participant-main">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="participante" />
    <main id="participant-main" className={styles.page} tabIndex={-1}>
      <p className={styles.eyebrow}>ÁREA DO PARTICIPANTE</p>
      {!ready && <p role="status">Carregando sua conta…</p>}
      {ready && !dashboard && getToken() && <section className={styles.card} aria-labelledby="retry-title">
        <h1 id="retry-title">Não foi possível carregar seus eventos</h1>
        <p role="alert">{error || 'Tente novamente em instantes.'}</p>
        <button type="button" disabled={busy} onClick={() => {
          setBusy(true);
          load().catch((caught: unknown) => {
            if (caught instanceof ApiError && caught.status === 401) clearSession();
            else setError(caught instanceof Error ? caught.message : 'Não foi possível carregar sua conta.');
          }).finally(() => setBusy(false));
        }}>Tentar novamente</button>
        <button type="button" className={styles.textButton} onClick={logout}>Sair da conta</button>
      </section>}
      {ready && !dashboard && !getToken() && <section className={styles.card} aria-labelledby="access-title">
        <div className={styles.cardIntro}>
          <h1 id="access-title">{mode === 'login' ? 'Meus eventos, em um só lugar' : 'Crie sua conta de participante'}</h1>
          <p>{mode === 'login' ? 'Acesse suas inscrições ativas com e-mail e senha. Veja pagamentos, QR de entrada e trabalhos disponíveis em cada evento.' : 'Crie sua conta com nome, e-mail e senha. Você poderá se inscrever em um evento depois; não precisa de código de inscrição para criar a conta.'}</p>
        </div>
        <div className={styles.modeSwitch} role="group" aria-label="Acesso do participante">
          <button type="button" aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setError(''); }}>Entrar</button>
          <button type="button" aria-pressed={mode === 'register'} onClick={() => { setMode('register'); setError(''); }}>Criar conta</button>
        </div>
        <form className={styles.form} onSubmit={authenticate}>
          {mode === 'register' && <label>Nome completo<input required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label>}
          <label>E-mail<input required type="email" maxLength={254} autoComplete="email" placeholder="voce@exemplo.com" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <div className={styles.passwordField}><label htmlFor="participant-password">Senha</label><span className={styles.passwordWrap}><input id="participant-password" required type={showPassword ? 'text' : 'password'} minLength={mode === 'register' ? 8 : 1} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword((current) => !current)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></span></div>
          {mode === 'register' && <>
            <div className={styles.passwordGuidance} aria-label="Requisitos da senha"><strong>Uma senha segura precisa de:</strong><ul>{checks.map((check) => <li key={check.label} className={check.met ? styles.met : undefined}><span aria-hidden="true">{check.met ? '✓' : '○'}</span>{check.label}</li>)}</ul></div>
            <label>Confirmar senha<input required type="password" minLength={8} autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} /></label>
          </>}
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <button type="submit" disabled={busy}>{busy ? 'Aguarde…' : mode === 'login' ? 'Entrar nos meus eventos' : 'Criar conta de participante'}</button>
        </form>
        <p className={styles.accountNote}>Já usa a Evolvia como organizador? <Link href="/login">Entre com a mesma conta</Link> e vincule sua inscrição nesta área.</p>
      </section>}
      {ready && dashboard && <>
        <div className={styles.heading}>
          <div><h1>Meus eventos</h1><p>Olá, {dashboard.user.name}. Aqui estão suas inscrições em eventos ativos.</p></div>
          <div className={styles.headingActions}><Link className={styles.textButton} href="/acesso">Trocar de área</Link><button type="button" className={styles.textButton} onClick={logout}>Sair da conta</button></div>
        </div>
        {!dashboard.emailVerified ? <section className={styles.card} aria-labelledby="verify-email-title">
          <h2 id="verify-email-title">Confirme seu e-mail para acessar inscrições</h2>
          <p>A confirmação de <strong>{dashboard.user.email}</strong> protege suas inscrições quando a conta reúne eventos diferentes. Verifique sua caixa de entrada; se não recebeu o link, tente reenviar.</p>
          {notice && <p role="status">{notice}</p>}
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <button type="button" onClick={() => void requestVerification()} disabled={busy}>{busy ? 'Enviando…' : 'Reenviar link de confirmação'}</button>
          <p>Você ainda pode usar a área do organizador. Somente a reunião e a abertura de inscrições ficam bloqueadas até a confirmação.</p>
        </section> : selected ? <>
          <button className={styles.textButton} type="button" onClick={closeEvent}>← Voltar aos meus eventos</button>
          <ParticipantArea key={selected.slug} slug={selected.slug} initialAccessToken={selected.token} onExit={exitEvent} />
        </> : <>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          {!dashboard.linked && <section className={styles.card} aria-labelledby="link-title">
            <h2 id="link-title">Encontrar minhas inscrições</h2>
            <p>Já se inscreveu em um evento? Informe o documento usado naquela inscrição. Vamos procurar as inscrições com o e-mail confirmado desta conta: <strong>{dashboard.user.email}</strong>. Se ainda não se inscreveu, <Link href="/eventos">explore os eventos</Link>.</p>
            <form className={styles.form} onSubmit={link}>
              <label>Qual documento você informou nessa inscrição?
              <select value={documentType} onChange={(event) => { setDocumentType(event.target.value as 'cpf' | 'foreign'); setDocument(''); }}>
                <option value="cpf">CPF brasileiro</option><option value="foreign">Documento estrangeiro</option>
              </select>
            </label>
            <label>{documentType === 'cpf' ? 'CPF informado na inscrição' : 'Número do documento estrangeiro'}
              <input required maxLength={documentType === 'cpf' ? 14 : 50} inputMode={documentType === 'cpf' ? 'numeric' : 'text'} autoComplete="off"
                placeholder={documentType === 'cpf' ? '000.000.000-00' : 'Número do documento'} value={document}
                onChange={(event) => setDocument(documentType === 'cpf' ? formatCpf(event.target.value) : event.target.value.toUpperCase())} />
            </label>
            <p className={styles.fieldHelp}>{documentType === 'cpf' ? 'Digite os 11 números; pontos e traço são preenchidos automaticamente.' : 'Digite o documento exatamente como informou na inscrição. Ele pode ter letras e números.'}</p>
              <button type="submit" disabled={busy}>{busy ? 'Confirmando…' : 'Vincular meus eventos'}</button>
            </form>
            <p>Se a inscrição foi feita com outro e-mail, entre com a conta correspondente.</p>
          </section>}
          {dashboard.linked && dashboard.events.length === 0 && <p>Nenhuma inscrição ativa encontrada para esta conta.</p>}
          {dashboard.events.length > 0 && <ul className={styles.list}>
            {dashboard.events.map((item) => <li key={item.slug} className={styles.card}>
              <h2>{item.name}</h2>
              <p>{item.startDate ? new Date(item.startDate).toLocaleDateString('pt-BR') : 'Data a confirmar'}{item.venue ? ` · ${item.venue}` : ''}</p>
              <p>{item.status === 'CONFIRMED' ? 'Inscrição confirmada' : 'Aguardando pagamento'}</p>
              <button type="button" onClick={() => openEvent(item.slug)} disabled={busy}>Abrir inscrição</button>
            </li>)}
          </ul>}
          <p>Usou outro e-mail em alguma inscrição? Saia desta conta e entre com o e-mail usado nela.</p>
        </>}
      </>}
    </main>
  </>;
}
