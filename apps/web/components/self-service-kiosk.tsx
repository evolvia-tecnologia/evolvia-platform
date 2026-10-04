'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import CredentialLabel, { CredentialLabelData } from './credential-label';
import styles from './self-service-kiosk.module.css';

type Method = 'CPF' | 'EMAIL' | 'QR' | 'PROTOCOL';
type Context = { eventName: string; logoUrl: string | null; methods: Method[] };
type Badge = CredentialLabelData & { alreadyCheckedIn: boolean };

const methodLabel: Record<Method, string> = { CPF: 'CPF', EMAIL: 'E-mail', QR: 'QR Code', PROTOCOL: 'Número de inscrição' };
const letterRows = ['1234567890-', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

function maskCpf(digits: string) {
  if (!digits) return 'XXX.XXX.XXX-XX';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export default function SelfServiceKiosk({ slug }: { slug: string }) {
  const [context, setContext] = useState<Context | null>(null);
  const [method, setMethod] = useState<Method>('QR');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [qr, setQr] = useState('');
  const [protocol, setProtocol] = useState('');
  const [shift, setShift] = useState(false);
  const [badge, setBadge] = useState<Badge | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const printed = useRef('');

  useEffect(() => {
    if (!slug) return;
    let active = true;
    api<Context>(`/public/events/${encodeURIComponent(slug)}/self-service`)
      .then((result) => {
        if (!active) return;
        setContext(result);
        setMethod(result.methods[0] ?? 'QR');
      })
      .catch(() => { if (active) setUnavailable(true); });
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (!badge) { printed.current = ''; return; }
    const key = badge.qr ?? badge.barcode ?? badge.protocol;
    if (printed.current === key) return;
    printed.current = key;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [badge]);

  useEffect(() => {
    if (!badge) return;
    const timer = window.setTimeout(() => setBadge(null), 20000);
    return () => window.clearTimeout(timer);
  }, [badge]);

  async function identify(nextMethod: Method, value: string) {
    setBusy(true); setError('');
    try {
      const result = await api<Badge>(`/public/events/${encodeURIComponent(slug)}/self-service`, {
        method: 'POST', body: JSON.stringify({ method: nextMethod, value }),
      });
      setBadge(result);
      setCpf(''); setEmail(''); setQr(''); setProtocol('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível imprimir a etiqueta.');
    } finally { setCpf(''); setEmail(''); setQr(''); setProtocol(''); setBusy(false); }
  }

  function submitCpf(event: FormEvent) {
    event.preventDefault();
    if (cpf.length === 11) void identify('CPF', cpf);
  }

  function submitEmail(event: FormEvent) {
    event.preventDefault();
    if (email.includes('@')) void identify('EMAIL', email);
  }

  function submitProtocol(event: FormEvent) {
    event.preventDefault();
    if (/^EVO-[A-F0-9]{16}$/u.test(protocol)) void identify('PROTOCOL', protocol);
  }

  function submitQr(event: FormEvent) {
    event.preventDefault();
    if (qr.trim()) void identify('QR', qr.trim());
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
        ? <img src={context.logoUrl} alt={context.eventName} onError={() => setLogoFailed(true)} />
        : context?.eventName ? <p className={styles.eventName}>{context.eventName}</p> : null}
      <p>AUTOATENDIMENTO</p>
    </section>
    <section className={styles.panel} aria-live="polite">
      {badge ? <>
        <p className={styles.kicker}>ETIQUETA</p>
        <h1>Check-in realizado com sucesso</h1>
        <p>{badge.alreadyCheckedIn
          ? `${badge.name ?? 'Participante'}, sua entrada já estava registrada. A etiqueta pode ser impressa de novo.`
          : `${badge.name ?? 'Participante'}, agradecemos sua participação e desejamos um ótimo evento.`}</p>
        <CredentialLabel label={badge} preview />
        <button type="button" onClick={() => window.print()}>Imprimir etiqueta</button>
        <button type="button" className={styles.secondary} onClick={() => setBadge(null)}>Sair</button>
      </> : <>
        <p className={styles.kicker}>AUTOATENDIMENTO</p>
        {unavailable ? <h1>Autoatendimento indisponível neste evento.</h1> : !context ? <h1>Abrindo o totem…</h1> : methods.length === 0 ? <h1>As formas de identificação ainda não foram habilitadas.</h1> : <>
          <h1>Imprima sua etiqueta</h1>
          {method === 'CPF' && <form onSubmit={submitCpf}>
            <p>Insira o número do seu CPF.</p>
            <p className={styles.readout}>{maskCpf(cpf)}</p>
            <div className={styles.keys}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => <button key={digit} type="button" onClick={() => setCpf((current) => `${current}${digit}`.slice(0, 11))}>{digit}</button>)}
              <button type="button" onClick={() => setCpf('')}>Limpar</button>
              <button type="button" onClick={() => setCpf((current) => `${current}0`.slice(0, 11))}>0</button>
              <button type="button" aria-label="Apagar" onClick={() => setCpf((current) => current.slice(0, -1))}>⌫</button>
            </div>
            <button type="submit" disabled={busy || cpf.length !== 11}>Enviar</button>
          </form>}
          {method === 'EMAIL' && <form onSubmit={submitEmail}>
            <p>Insira seu e-mail.</p>
            <input aria-label="E-mail" value={email} autoComplete="off" onChange={(event) => setEmail(event.target.value)} />
            <div className={styles.keyboard}>
              {letterRows.map((row) => row.split('').map((key) => <button key={key} type="button" onClick={() => typeEmail(key)}>{shift && /[a-z]/u.test(key) ? key.toUpperCase() : key}</button>))}
              <button type="button" onClick={() => setEmail((current) => current.slice(0, -1))}>Apagar</button>
              <button type="button" aria-pressed={shift} onClick={() => setShift((current) => !current)}>Shift</button>
              {['@gmail.com', '@hotmail.com', '.com', '.br', '@'].map((token) => <button key={token} type="button" onClick={() => typeEmail(token)}>{token}</button>)}
            </div>
            <button type="submit" disabled={busy || !email.includes('@')}>Enviar</button>
          </form>}
          {method === 'PROTOCOL' && <form onSubmit={submitProtocol}>
            <p>Digite o número da inscrição deste evento.</p>
            <input aria-label="Número de inscrição" value={protocol} autoComplete="off" spellCheck={false} maxLength={20} onChange={(event) => setProtocol(event.target.value.toUpperCase())} />
            <button type="submit" disabled={busy || !/^EVO-[A-F0-9]{16}$/u.test(protocol)}>Enviar</button>
          </form>}
          {method === 'QR' && <form onSubmit={submitQr}>
            <p>Apresente o QR Code ou o código de barras da etiqueta para leitura.</p>
            <input aria-label="QR Code" value={qr} autoFocus autoComplete="off" spellCheck={false} onChange={(event) => setQr(event.target.value)} />
            <button type="submit" disabled={busy || qr.trim().length < 8}>Enviar</button>
          </form>}
          {others.length > 0 && <div className={styles.methods}>
            {others.map((item) => <button key={item} type="button" onClick={() => { setMethod(item); setError(''); }}>{methodLabel[item]}</button>)}
          </div>}
        </>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </>}
    </section>
    {badge && <div className={styles.label}><CredentialLabel label={badge} /></div>}
  </main>;
}
