'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import CredentialLabel, { CredentialLabelData } from './credential-label';
import EvaScreenSupport from './eva-screen-support';
import styles from './self-service-kiosk.module.css';

type Method = 'CPF' | 'EMAIL' | 'QR' | 'PROTOCOL';
type Phase = 'entry' | 'confirm' | 'success';
type Context = { eventName: string; logoUrl: string | null; logoAlt: string | null; methods: Method[] };
type Preview = { name: string | null; category: string; company: string | null; alreadyCheckedIn: boolean };
type Pending = { method: Method; value: string };
type Badge = CredentialLabelData & { alreadyCheckedIn: boolean };

const methodLabel: Record<Method, string> = { CPF: 'CPF ou passaporte', EMAIL: 'E-mail', QR: 'QR Code', PROTOCOL: 'Número de inscrição' };
const letterRows = ['1234567890-', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const emailShortcuts = ['.', ',', '@gmail.com', '@hotmail.com', '.com', '.br', '@'];

function logoAltText(alt: string | null, eventName: string) {
  const text = alt?.trim() ?? '';
  if (!text || text.toLowerCase() === eventName.trim().toLowerCase()) return '';
  return text;
}

function maskCpf(digits: string) {
  const chars = `${digits}XXXXXXXXXXX`.slice(0, 11).split('');
  return `${chars.slice(0, 3).join('')}.${chars.slice(3, 6).join('')}.${chars.slice(6, 9).join('')}-${chars.slice(9).join('')}`;
}

export default function SelfServiceKiosk({ slug, accessToken }: { slug: string; accessToken?: string }) {
  return <SelfServiceKioskSession key={`${slug}:${accessToken ?? ''}`} slug={slug} accessToken={accessToken} />;
}

function SelfServiceKioskSession({ slug, accessToken }: { slug: string; accessToken?: string }) {
  const [context, setContext] = useState<Context | null>(null);
  const [method, setMethod] = useState<Method>('QR');
  const [cpf, setCpf] = useState('');
  const [passport, setPassport] = useState('');
  const [documentMode, setDocumentMode] = useState<'cpf' | 'passport'>('cpf');
  const [email, setEmail] = useState('');
  const [qr, setQr] = useState('');
  const [protocol, setProtocol] = useState('');
  const [shift, setShift] = useState(false);
  const [phase, setPhase] = useState<Phase>('entry');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [badge, setBadge] = useState<Badge | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [blocked, setBlocked] = useState('');
  const printed = useRef(0);
  const printGeneration = useRef(0);

  useEffect(() => {
    if (!slug) return;
    if (accessToken !== undefined && !/^[a-f0-9]{64}$/u.test(accessToken)) {
      setBlocked('Este link de autoatendimento não é válido.');
      return;
    }
    let active = true;
    const contextPath = accessToken
      ? `/public/events/${encodeURIComponent(slug)}/self-service/access/${encodeURIComponent(accessToken)}`
      : `/public/events/${encodeURIComponent(slug)}/self-service`;
    api<Context>(contextPath)
      .then((result) => {
        if (!active) return;
        setContext(result);
        setMethod(result.methods[0] ?? 'QR');
      })
      .catch((reason) => {
        if (!active) return;
        if (accessToken) setBlocked(reason instanceof Error ? reason.message : 'Este link de autoatendimento não é válido.');
        else setUnavailable(true);
      });
    return () => { active = false; };
  }, [slug, accessToken]);

  useEffect(() => {
    if (phase !== 'success' || !badge) return;
    const generation = printGeneration.current;
    if (printed.current === generation) return;
    const timer = window.setTimeout(() => {
      printed.current = generation;
      window.print();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [phase, badge]);

  function leave() {
    setPhase('entry');
    setPreview(null);
    setPending(null);
    setBadge(null);
    setError('');
    setCpf('');
    setPassport('');
    setDocumentMode('cpf');
    setEmail('');
    setQr('');
    setProtocol('');
    setShift(false);
  }

  useEffect(() => {
    if (phase === 'entry' || busy) return;
    const timer = window.setTimeout(leave, phase === 'confirm' ? 45000 : 20000);
    return () => window.clearTimeout(timer);
  }, [phase, busy, preview, badge]);

  function choose(next: Method) {
    setMethod(next);
    setError('');
    setCpf('');
    setPassport('');
    setDocumentMode('cpf');
    setEmail('');
    setQr('');
    setProtocol('');
    setShift(false);
  }

  async function lookup(nextMethod: Method, value: string) {
    setBusy(true);
    setError('');
    try {
      const result = await api<Preview>(`/public/events/${encodeURIComponent(slug)}/self-service/preview${accessToken ? `?acesso=${encodeURIComponent(accessToken)}` : ''}`, {
        method: 'POST',
        body: JSON.stringify({ method: nextMethod, value }),
      });
      setPreview(result);
      setPending({ method: nextMethod, value });
      setPhase('confirm');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não encontramos uma inscrição confirmada com esses dados.');
    } finally {
      setCpf('');
      setPassport('');
      setEmail('');
      setQr('');
      setProtocol('');
      setBusy(false);
    }
  }

  async function printLabel() {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<Badge>(`/public/events/${encodeURIComponent(slug)}/self-service${accessToken ? `?acesso=${encodeURIComponent(accessToken)}` : ''}`, {
        method: 'POST',
        body: JSON.stringify(pending),
      });
      printGeneration.current += 1;
      setBadge(result);
      setPhase('success');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível imprimir a etiqueta.');
    } finally {
      setBusy(false);
    }
  }

  function submitCpf(event: FormEvent) {
    event.preventDefault();
    if (cpf.length === 11) void lookup('CPF', cpf);
  }

  function submitPassport(event: FormEvent) {
    event.preventDefault();
    const trimmed = passport.trim();
    if (trimmed.length >= 5) void lookup('CPF', trimmed);
  }

  function typePassport(token: string) {
    setPassport((current) => `${current}${token}`.toUpperCase().replace(/[^A-Z0-9]/gu, '').slice(0, 40));
  }

  function submitEmail(event: FormEvent) {
    event.preventDefault();
    if (email.includes('@')) void lookup('EMAIL', email);
  }

  function submitProtocol(event: FormEvent) {
    event.preventDefault();
    const trimmed = protocol.trim();
    if (/^EVO-[A-F0-9]{16}$/u.test(trimmed)) void lookup('PROTOCOL', trimmed);
  }

  function submitQr(event: FormEvent) {
    event.preventDefault();
    if (qr.trim()) void lookup('QR', qr.trim());
  }

  function typeEmail(token: string) {
    const next = shift && token.length === 1 ? token.toUpperCase() : token;
    setEmail((current) => `${current}${next}`.slice(0, 254));
    if (shift && token.length === 1) setShift(false);
  }

  const methods = context?.methods ?? [];
  const others = methods.filter((item) => item !== method);

  return <main className={styles.stage}>
    <section className={styles.brand} aria-label="Identidade do evento">
      {context?.logoUrl && !logoFailed
        ? <img src={context.logoUrl} alt={logoAltText(context.logoAlt, context.eventName)} onError={() => setLogoFailed(true)} />
        : null}
      {context?.eventName ? <p className={styles.eventName}>{context.eventName}</p> : null}
      <p>AUTOATENDIMENTO</p>
    </section>
    <section className={styles.panel} aria-live="polite">
      {blocked ? <h1>{blocked}</h1> : phase === 'confirm' && preview ? <>
        <h1>BEM-VINDO(A)</h1>
        <p>Confirme se suas informações estão corretas. Caso contrário, clique no botão Sair e solicite ajuda a um atendente.</p>
        {preview.category ? <p className={styles.banner}>{preview.category}</p> : null}
        <dl className={styles.facts}>
          <div>
            <dt>Nome</dt>
            <dd>{preview.name ?? 'Participante'}</dd>
          </div>
          {preview.company ? <div>
            <dt>Empresa</dt>
            <dd>{preview.company}</dd>
          </div> : null}
        </dl>
        {preview.alreadyCheckedIn && <p>Sua entrada já estava registrada. A etiqueta pode ser impressa de novo.</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={leave} disabled={busy}>Sair</button>
          <button type="button" onClick={() => void printLabel()} disabled={busy}>Imprimir</button>
        </div>
      </> : phase === 'success' && badge ? <>
        <h1>Sucesso!</h1>
        {badge.alreadyCheckedIn
          ? <p>Sua entrada já estava registrada. A etiqueta pode ser impressa de novo.</p>
          : <>
            <p>Check-in realizado com sucesso!</p>
            <p>Agradecemos sua participação e desejamos um ótimo evento!</p>
          </>}
        <div className={styles.actions}>
          {badge.alreadyCheckedIn && <button type="button" onClick={() => window.print()}>Imprimir de novo</button>}
          <button type="button" className={styles.secondary} onClick={leave}>Sair</button>
        </div>
      </> : <>
        {unavailable ? <h1>Autoatendimento indisponível neste evento.</h1> : !context ? <h1>Abrindo o totem…</h1> : methods.length === 0 ? <h1>As formas de identificação ainda não foram habilitadas.</h1> : <>
          {method === 'CPF' && documentMode === 'cpf' && <form onSubmit={submitCpf}>
            <h1>Insira o número do seu CPF.</h1>
            <p className={styles.hint}>(Válido para cidadãos brasileiros)</p>
            <p className={styles.readout} aria-live="off">{maskCpf(cpf)}</p>
            <div className={styles.keys}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => <button key={digit} type="button" onClick={() => setCpf((current) => `${current}${digit}`.slice(0, 11))}>{digit}</button>)}
              <button type="button" onClick={() => setCpf('')}>LIMPAR</button>
              <button type="button" onClick={() => setCpf((current) => `${current}0`.slice(0, 11))}>0</button>
              <button type="button" aria-label="Apagar" onClick={() => setCpf((current) => current.slice(0, -1))}>⌫</button>
            </div>
            <button type="button" className={styles.secondary} onClick={() => { setDocumentMode('passport'); setError(''); }}>Passaporte</button>
            <button type="submit" disabled={busy || cpf.length !== 11}>Enviar</button>
          </form>}
          {method === 'CPF' && documentMode === 'passport' && <form onSubmit={submitPassport}>
            <h1>Insira o número do seu passaporte.</h1>
            <p className={styles.hint}>Use o mesmo número informado na inscrição.</p>
            <input aria-label="Passaporte" value={passport} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={40} inputMode="none" onChange={(event) => setPassport(event.target.value.toUpperCase().replace(/[^A-Z0-9]/gu, '').slice(0, 40))} />
            <div className={styles.keyboard}>
              {'1234567890'.split('').map((key) => <button key={key} type="button" onClick={() => typePassport(key)}>{key}</button>)}
              {letterRows[1].split('').concat(letterRows[2].split(''), letterRows[3].split('')).map((key) => <button key={key} type="button" onClick={() => typePassport(key)}>{key.toUpperCase()}</button>)}
              <button type="button" onClick={() => setPassport((current) => current.slice(0, -1))}>Apagar</button>
              <button type="button" onClick={() => setPassport('')}>Limpar</button>
            </div>
            <button type="button" className={styles.secondary} onClick={() => { setDocumentMode('cpf'); setError(''); }}>CPF</button>
            <button type="submit" disabled={busy || passport.trim().length < 5}>Enviar</button>
          </form>}
          {method === 'EMAIL' && <form onSubmit={submitEmail}>
            <h1>Insira seu e-mail.</h1>
            <input aria-label="E-mail" value={email} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(event) => setEmail(event.target.value)} />
            <div className={styles.keyboard}>
              {letterRows.map((row) => row.split('').map((key) => <button key={key} type="button" onClick={() => typeEmail(key)}>{shift && /[a-z]/u.test(key) ? key.toUpperCase() : key}</button>))}
              <button type="button" onClick={() => setEmail((current) => current.slice(0, -1))}>Apagar</button>
              <button type="button" aria-pressed={shift} onClick={() => setShift((current) => !current)}>Shift</button>
              {emailShortcuts.map((token) => <button key={token} type="button" onClick={() => typeEmail(token)}>{token}</button>)}
            </div>
            <button type="submit" disabled={busy || !email.includes('@')}>Enviar</button>
          </form>}
          {method === 'PROTOCOL' && <form onSubmit={submitProtocol}>
            <h1>Digite o número da inscrição deste evento.</h1>
            <input aria-label="Número de inscrição" value={protocol} autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={64} onChange={(event) => setProtocol(event.target.value.toUpperCase())} />
            <button type="submit" disabled={busy || !/^EVO-[A-F0-9]{16}$/u.test(protocol.trim())}>Enviar</button>
          </form>}
          {method === 'QR' && <form onSubmit={submitQr}>
            <h1>Apresente seu QR Code para leitura.</h1>
            <p className={styles.hint}>O mesmo campo também lê o código de barras da etiqueta.</p>
            <input aria-label="QR Code" type="password" value={qr} autoFocus autoComplete="off" spellCheck={false} onChange={(event) => setQr(event.target.value)} />
            <button type="submit" disabled={busy || qr.trim().length < 8}>Enviar</button>
          </form>}
          {others.length > 0 && <div className={styles.methods}>
            {others.map((item) => <button key={item} type="button" onClick={() => choose(item)}>{methodLabel[item]}</button>)}
          </div>}
        </>}
      </>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
    {badge && phase === 'success' && <div className={styles.label}><CredentialLabel label={badge} /></div>}
    <EvaScreenSupport guide="kiosk" />
  </main>;
}
