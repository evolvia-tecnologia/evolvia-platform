'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { interpretKioskDocument, kioskCopy, kioskLanguage, type KioskLanguage } from '../lib/kiosk-copy';
import CredentialLabel, { CredentialLabelData } from './credential-label';
import EvaScreenSupport from './eva-screen-support';
import styles from './self-service-kiosk.module.css';

type Method = 'CPF' | 'EMAIL' | 'QR' | 'PROTOCOL';
type Phase = 'entry' | 'confirm' | 'success';
type Context = { eventName: string; logoUrl: string | null; logoAlt: string | null; methods: Method[] };
type Preview = { name: string | null; category: string; company: string | null; alreadyCheckedIn: boolean };
type Pending = { method: Method; value: string };
type Badge = CredentialLabelData & { alreadyCheckedIn: boolean };

const letterRows = ['1234567890-', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const documentRows = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const emailShortcuts = ['.', ',', '@gmail.com', '@hotmail.com', '.com', '.br', '@'];

function logoAltText(alt: string | null, eventName: string) {
  const text = alt?.trim() ?? '';
  if (!text || text.toLowerCase() === eventName.trim().toLowerCase()) return '';
  return text;
}

export default function SelfServiceKiosk({ slug, accessToken }: { slug: string; accessToken?: string }) {
  return <SelfServiceKioskSession key={`${slug}:${accessToken ?? ''}`} slug={slug} accessToken={accessToken} />;
}

function SelfServiceKioskSession({ slug, accessToken }: { slug: string; accessToken?: string }) {
  const [context, setContext] = useState<Context | null>(null);
  const [method, setMethod] = useState<Method>('QR');
  const [documentValue, setDocumentValue] = useState('');
  const [language, setLanguage] = useState<KioskLanguage>('pt');
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
  const copy = kioskCopy(language);
  const methodLabel: Record<Method, string> = { CPF: copy.methodCpf, EMAIL: copy.methodEmail, QR: copy.methodQr, PROTOCOL: copy.methodProtocol };

  useEffect(() => {
    setLanguage(kioskLanguage(new URLSearchParams(window.location.search).get('idioma')));
  }, []);

  function chooseLanguage(next: KioskLanguage) {
    setLanguage(next);
    const url = new URL(window.location.href);
    if (next === 'pt') url.searchParams.delete('idioma');
    else url.searchParams.set('idioma', next);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

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
    setDocumentValue('');
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
    if (busy) return;
    setMethod(next);
    setError('');
    setDocumentValue('');
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
      setError(reason instanceof Error ? reason.message : copy.notFound);
    } finally {
      setDocumentValue('');
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

  function submitDocument(event: FormEvent) {
    event.preventDefault();
    const read = interpretKioskDocument(documentValue);
    if (busy || !read.ok && read.error === 'empty') return;
    if (!read.ok) {
      setError(read.error === 'cpf' ? copy.invalidCpf : copy.shortDocument);
      return;
    }
    void lookup('CPF', read.value);
  }

  function editDocument(next: (current: string) => string) {
    setDocumentValue((current) => next(current).toUpperCase().replace(/[^A-Z0-9]/gu, '').slice(0, 40));
    setError((current) => current === copy.shortDocument || current === copy.invalidCpf ? '' : current);
  }

  function typeDocument(token: string) {
    editDocument((current) => `${current}${token}`);
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

  return <main className={styles.stage} lang={language === 'pt' ? 'pt-BR' : language}>
    <div className={styles.langs} role="group" aria-label={copy.language}>
      {(['pt', 'es', 'en'] as const).map((item) => <button key={item} type="button" className={styles.lang} aria-pressed={language === item} lang={item === 'pt' ? 'pt-BR' : item} onClick={() => chooseLanguage(item)}>{item.toUpperCase()}</button>)}
    </div>
    <section className={styles.brand} aria-label="Identidade do evento">
      {context?.logoUrl && !logoFailed
        ? <img src={context.logoUrl} alt={logoAltText(context.logoAlt, context.eventName)} onError={() => setLogoFailed(true)} />
        : null}
      {context?.eventName ? <p className={styles.eventName}>{context.eventName}</p> : null}
      <p>{copy.selfService}</p>
    </section>
    <section className={styles.panel} aria-live="polite">
      {blocked ? <h1>{blocked}</h1> : phase === 'confirm' && preview ? <>
        <h1>{copy.welcome}</h1>
        <p>{copy.confirm}</p>
        {preview.category ? <p className={styles.banner}>{preview.category}</p> : null}
        <dl className={styles.facts}>
          <div>
            <dt>{copy.name}</dt>
            <dd>{preview.name ?? 'Participante'}</dd>
          </div>
          {preview.company ? <div>
            <dt>{copy.company}</dt>
            <dd>{preview.company}</dd>
          </div> : null}
        </dl>
        {preview.alreadyCheckedIn && <p>{copy.already}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={leave} disabled={busy}>{copy.leave}</button>
          <button type="button" onClick={() => void printLabel()} disabled={busy}>{copy.print}</button>
        </div>
      </> : phase === 'success' && badge ? <>
        <h1>{copy.success}</h1>
        {badge.alreadyCheckedIn
          ? <p>{copy.already}</p>
          : <>
            <p>{copy.checkedIn}</p>
            <p>{copy.thanks}</p>
          </>}
        <div className={styles.actions}>
          {badge.alreadyCheckedIn && <button type="button" onClick={() => window.print()}>{copy.printAgain}</button>}
          <button type="button" className={styles.secondary} onClick={leave}>{copy.leave}</button>
        </div>
      </> : <>
        {unavailable ? <h1>{copy.unavailable}</h1> : !context ? <h1>{copy.opening}</h1> : methods.length === 0 ? <h1>{copy.noMethods}</h1> : <>
          {method === 'CPF' && <form onSubmit={submitDocument}>
            <h1>{copy.documentTitle}</h1>
            <p className={styles.hint}>{copy.documentHint}</p>
            <input aria-label={copy.documentLabel} value={documentValue} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={40} inputMode="none" disabled={busy} onChange={(event) => editDocument(() => event.target.value)} />
            <div className={styles.keyboard}>
              {documentRows.map((row) => <div key={row} className={styles.keyboardRow}>
                {row.split('').map((key) => <button key={key} type="button" disabled={busy} onClick={() => typeDocument(key)}>{key.toUpperCase()}</button>)}
              </div>)}
              <div className={styles.keyboardRow}>
                <button type="button" disabled={busy} onClick={() => editDocument((current) => current.slice(0, -1))}>{copy.backspace}</button>
                <button type="button" disabled={busy} onClick={() => editDocument(() => '')}>{copy.clear}</button>
              </div>
            </div>
            <button type="submit" disabled={busy || documentValue.trim().length === 0}>{copy.send}</button>
          </form>}
          {method === 'EMAIL' && <form onSubmit={submitEmail}>
            <h1>{copy.emailTitle}</h1>
            <input aria-label={copy.emailLabel} value={email} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(event) => setEmail(event.target.value)} />
            <div className={styles.keyboard}>
              {letterRows.map((row) => row.split('').map((key) => <button key={key} type="button" onClick={() => typeEmail(key)}>{shift && /[a-z]/u.test(key) ? key.toUpperCase() : key}</button>))}
              <button type="button" onClick={() => setEmail((current) => current.slice(0, -1))}>{copy.backspace}</button>
              <button type="button" aria-pressed={shift} onClick={() => setShift((current) => !current)}>Shift</button>
              {emailShortcuts.map((token) => <button key={token} type="button" onClick={() => typeEmail(token)}>{token}</button>)}
            </div>
            <button type="submit" disabled={busy || !email.includes('@')}>{copy.send}</button>
          </form>}
          {method === 'PROTOCOL' && <form onSubmit={submitProtocol}>
            <h1>{copy.protocolTitle}</h1>
            <input aria-label={copy.protocolLabel} value={protocol} autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={64} onChange={(event) => setProtocol(event.target.value.toUpperCase())} />
            <button type="submit" disabled={busy || !/^EVO-[A-F0-9]{16}$/u.test(protocol.trim())}>{copy.send}</button>
          </form>}
          {method === 'QR' && <form onSubmit={submitQr}>
            <h1>{copy.qrTitle}</h1>
            <p className={styles.hint}>{copy.qrHint}</p>
            <input aria-label={copy.qrLabel} type="password" value={qr} autoFocus autoComplete="off" spellCheck={false} onChange={(event) => setQr(event.target.value)} />
            <button type="submit" disabled={busy || qr.trim().length < 8}>{copy.send}</button>
          </form>}
          {others.length > 0 && <div className={styles.methods}>
            {others.map((item) => <button key={item} type="button" disabled={busy} onClick={() => choose(item)}>{methodLabel[item]}</button>)}
          </div>}
        </>}
      </>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
    {badge && phase === 'success' && <div className={styles.label}><CredentialLabel label={badge} /></div>}
    <EvaScreenSupport guide="kiosk" />
  </main>;
}
