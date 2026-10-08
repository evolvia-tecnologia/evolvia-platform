'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import EvaScreenSupport from './eva-screen-support';
import styles from './participant-area.module.css';
import CredentialQr from './credential-qr';
import EventEvaluationForm from './event-evaluation-form';
import ScientificAuthorPanel from './scientific-author-panel';
import ParticipantAgenda from './participant-agenda';
import ParticipantRegistrationEditor from './participant-registration-editor';
import { paymentLabel, registrationLabel, sessionDelay } from './participant-status';
import type { PaymentStatus, RegistrationStatus } from './participant-status';

type Area = {
  event: { name: string; slug: string; profileCode: string; startDate: string | null; endDate: string | null; format: string; venue: string | null };
  registration: { protocol: string; status: RegistrationStatus; category: string; lot: string; finalPriceCents: number; confirmedAt: string | null; expiresAt: string | null };
  payment: { status: PaymentStatus; paidAt: string | null } | null;
  paymentReceipt: { number: string; amountCents: number; paidAt: string; issuedAt: string; seller: { legalName: string; taxId: string; kind: string; revision: number } } | null;
  fiscalDocument: { status: 'NOT_CONFIGURED' };
  credential: { code: string; checkedInAt: string | null } | null;
  certificate: { eligible: boolean; code: string | null; hours: number | null; issuedAt: string | null; feeCents: 0 };
  transmission: { kind: 'VIDEOCONFERENCE' | 'LIVE' | 'RECORDED'; title: string; url: string } | null;
  sessionExpiresAt: string;
};

const transmissionLabel = {
  VIDEOCONFERENCE: 'Abrir videoconferência',
  LIVE: 'Assistir ao vivo',
  RECORDED: 'Assistir à gravação',
} as const;

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
async function readJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const raw = await response.text();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(fallbackMessage);
    return parsed as T;
  } catch { throw new Error(fallbackMessage); }
}

const participantEva = [
  { question: 'Você mostra informações de outros autores?', answer: 'Não mostro parecer, nota ou o trabalho de outra pessoa.' },
  { question: 'Como funciona a agenda?', answer: 'As atividades confirmadas aparecem na agenda. A inscrição em atividade depende de vaga e não pode colidir com outra atividade ou apresentação sua.' },
{ question: 'O certificado é cobrado?', answer: 'Não. O download do certificado de participação não é cobrado.' },
{ question: 'Quando posso emitir?', answer: 'Quando a organização libera e a sua entrada neste evento já foi registrada. Sem presença, o certificado não sai.' },
{ question: 'A consulta pública mostra meu documento?', answer: 'Não. Quem tem o código vê o nome publicado, o evento, a carga horária e a data. E-mail, CPF e protocolo ficam de fora.' },
{ question: 'Quando a carta aparece?', answer: 'Depois que a comissão aceita ou recusa o seu trabalho. Trabalho em avaliação ainda não tem carta.' },
{ question: 'A carta é um certificado?', answer: 'Não. Ela confirma a decisão do trabalho. Certificado e credencial de entrada são documentos diferentes.' },
{ question: 'A carta sai da plataforma?', answer: 'Não. Ela é gerada na hora com os dados desta inscrição e pode ser lida ou baixada aqui. A EVA não envia e-mail nem parecer.' },
{ question: 'Onde acho o código?', answer: 'Use o código recebido quando a inscrição foi criada, junto do mesmo documento informado na ficha.' },
{ question: 'O certificado aparece aqui?', answer: 'Depois de entrar, se a organização tiver liberado e a presença estiver registrada. O download não é cobrado.' },
];

export default function ParticipantArea(props: { slug: string; initialAccessToken?: string; onExit?: (message?: string) => void }) {
  return <>
    <EvaScreenSupport guide="participant" additionalQuestions={participantEva} />
    <ParticipantAreaView {...props} />
  </>;
}

function ParticipantAreaView({ slug, initialAccessToken, onExit }: { slug: string; initialAccessToken?: string; onExit?: (message?: string) => void }) {
  const requestEpoch = useRef(0);
  const [protocol, setProtocol] = useState('');
  const [document, setDocument] = useState('');
  const [token, setToken] = useState<string | null>(initialAccessToken ?? null);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!initialAccessToken) return;
    const controller = new AbortController();
    fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/me`, {
      cache: 'no-store', headers: { authorization: `Bearer ${initialAccessToken}` }, signal: controller.signal,
    }).then(async (response) => {
      if (response.status === 401) {
        if (!controller.signal.aborted) {
          const message = 'Sua sessão expirou. Entre novamente para consultar a inscrição.';
          if (onExit) onExit(message);
          else { setToken(null); setError(message); }
        }
        return;
      }
      const payload = await readJson<Area & { message?: string }>(response, 'Não foi possível carregar sua inscrição.');
      if (!response.ok) throw new Error(payload.message ?? 'Não foi possível carregar sua inscrição.');
      if (!controller.signal.aborted) setArea(payload);
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar sua inscrição.');
    });
    return () => controller.abort();
  }, [slug, initialAccessToken, onExit]);

  useEffect(() => {
    if (!area) return;
    const delay = sessionDelay(area.sessionExpiresAt, Date.now());
    if (delay === 0) {
      requestEpoch.current += 1;
      if (onExit) onExit('Sua sessão expirou. Entre novamente para consultar a inscrição.');
      else { setToken(null); setArea(null); setBusy(false); setError('Sua sessão expirou. Entre novamente para consultar a inscrição.'); }
      return;
    }
    const timer = window.setTimeout(() => {
      requestEpoch.current += 1;
      if (onExit) onExit('Sua sessão expirou. Entre novamente para consultar a inscrição.');
      else { setToken(null); setArea(null); setBusy(false); setError('Sua sessão expirou. Entre novamente para consultar a inscrição.'); }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [area, onExit]);

  async function enter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const sessionResponse = await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/sessions`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ protocol, identityDocument: document }),
      });
      const session = await readJson<{ accessToken?: string; message?: string }>(sessionResponse, 'Não foi possível entrar.');
      if (!sessionResponse.ok || !session.accessToken) throw new Error(session.message ?? 'Não foi possível entrar.');
      const areaResponse = await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/me`, {
        cache: 'no-store', headers: { authorization: `Bearer ${session.accessToken}` },
      });
      const payload = await readJson<Area & { message?: string }>(areaResponse, 'Não foi possível carregar sua inscrição.');
      if (!areaResponse.ok) throw new Error(payload.message ?? 'Não foi possível carregar sua inscrição.');
      setToken(session.accessToken); setArea(payload); setDocument('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível entrar.'); }
    finally { setBusy(false); }
  }

  async function refresh() {
    if (!token || busy) return;
    const request = ++requestEpoch.current;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/me`, {
        cache: 'no-store', headers: { authorization: `Bearer ${token}` },
      });
      if (request !== requestEpoch.current) return;
      if (response.status === 401) {
        requestEpoch.current += 1;
        if (onExit) onExit('Sua sessão expirou. Entre novamente para consultar a inscrição.');
        else { setToken(null); setArea(null); setBusy(false); setError('Sua sessão expirou. Entre novamente para consultar a inscrição.'); }
        return;
      }
      const payload = await readJson<Area & { message?: string }>(response, 'Não foi possível atualizar sua inscrição.');
      if (request !== requestEpoch.current) return;
      if (!response.ok) throw new Error('Não foi possível atualizar sua inscrição.');
      if (sessionDelay(payload.sessionExpiresAt, Date.now()) === 0) {
        requestEpoch.current += 1;
        if (onExit) onExit('Sua sessão expirou. Entre novamente para consultar a inscrição.');
        else { setToken(null); setArea(null); setBusy(false); setError('Sua sessão expirou. Entre novamente para consultar a inscrição.'); }
        return;
      }
      setArea(payload);
    } catch (caught) {
      if (request === requestEpoch.current || !token) {
        setError(caught instanceof Error ? caught.message : 'Não foi possível atualizar sua inscrição.');
      }
    } finally { if (request === requestEpoch.current) setBusy(false); }
  }

  async function issueCertificate() {
    if (!token || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/certificate`, {
        method: 'POST', headers: { authorization: `Bearer ${token}` },
      });
      const payload = await readJson<{ code?: string; hours?: number | null; issuedAt?: string; message?: string; error?: { message?: string } }>(response, 'Não foi possível emitir o certificado.');
      if (!response.ok || !payload.code || !/^[a-f0-9]{32}$/u.test(payload.code)) {
        throw new Error(payload.error?.message ?? payload.message ?? 'Não foi possível emitir o certificado.');
      }
      const issued = { eligible: true as const, code: payload.code, hours: payload.hours ?? null, issuedAt: payload.issuedAt ?? null, feeCents: 0 as const };
      setArea((current) => current ? { ...current, certificate: issued } : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível emitir o certificado.');
    } finally { setBusy(false); }
  }

  function downloadReceipt(receipt: NonNullable<Area['paymentReceipt']>) {
    const content = [
      'EVOLVIA — COMPROVANTE DE PAGAMENTO DA INSCRIÇÃO',
      'Este comprovante não é uma nota fiscal.',
      `Número: ${receipt.number}`,
      `Evento: ${area?.event.name ?? ''}`,
      `Inscrição: ${area?.registration.protocol ?? ''}`,
      `Organizador vendedor: ${receipt.seller.legalName}`,
      `Documento do vendedor: ${receipt.seller.taxId}`,
      `Valor pago: ${money.format(receipt.amountCents / 100)}`,
      `Pagamento confirmado em: ${new Date(receipt.paidAt).toLocaleString('pt-BR')}`,
      `Comprovante gerado em: ${new Date(receipt.issuedAt).toLocaleString('pt-BR')}`,
    ].join('\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `comprovante-evolvia-${receipt.number}.txt`;
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  async function leave() {
    const activeToken = token;
    requestEpoch.current += 1;
    setToken(null); setArea(null); setProtocol(''); setDocument(''); setError(''); setBusy(false);
    onExit?.();
    if (!activeToken) return;
    try {
      const response = await fetch(`/api/public/events/${encodeURIComponent(slug)}/participant/sessions/current`, {
        method: 'DELETE', headers: { authorization: `Bearer ${activeToken}` },
      });
      if (!response.ok) throw new Error('Falha ao revogar.');
    } catch {
      setError('A sessão saiu deste navegador, mas a revogação no servidor não pôde ser confirmada. Ela expira em até 15 minutos.');
    }
  }

  if (initialAccessToken && token && !area) return <main className={styles.page}>{error ? <><p role="alert">{error}</p><button type="button" onClick={refresh} disabled={busy}>Tentar novamente</button></> : <p role="status">Carregando inscrição…</p>}</main>;

  if (area) return <main className={styles.page}>
    <section className={styles.card} aria-labelledby="participant-title">
      <p className={styles.eyebrow}>ÁREA DO PARTICIPANTE</p>
      <h1 id="participant-title">{area.event.name}</h1>
      <p>Consulte abaixo o estado atual da sua inscrição. Acompanhe sua inscrição e apresente sua credencial no evento.</p>
      <dl className={styles.details}>
        <div><dt>Código da inscrição</dt><dd>{area.registration.protocol}</dd></div>
        <div><dt>Inscrição</dt><dd>{registrationLabel(area.registration.status)}</dd></div>
        <div><dt>Categoria</dt><dd>{area.registration.category}</dd></div>
        <div><dt>Lote</dt><dd>{area.registration.lot}</dd></div>
        <div><dt>Valor</dt><dd>{money.format(area.registration.finalPriceCents / 100)}</dd></div>
        <div><dt>Pagamento</dt><dd>{paymentLabel(area.payment?.status ?? null)}</dd></div>
      </dl>
      {area.paymentReceipt && <section aria-labelledby="payment-receipt-title">
        <h2 id="payment-receipt-title">Comprovante de pagamento</h2>
        <p>Pagamento confirmado pelo provedor. Este comprovante não é uma nota fiscal.</p>
        <dl className={styles.details}>
          <div><dt>Número</dt><dd>{area.paymentReceipt.number}</dd></div>
          <div><dt>Organizador vendedor</dt><dd>{area.paymentReceipt.seller.legalName}</dd></div>
          <div><dt>Documento do vendedor</dt><dd>{area.paymentReceipt.seller.taxId}</dd></div>
          <div><dt>Valor pago</dt><dd>{money.format(area.paymentReceipt.amountCents / 100)}</dd></div>
          <div><dt>Confirmado em</dt><dd suppressHydrationWarning>{new Date(area.paymentReceipt.paidAt).toLocaleString('pt-BR')}</dd></div>
        </dl>
        <button type="button" onClick={() => downloadReceipt(area.paymentReceipt!)}>Baixar comprovante (.txt)</button>
        <p>Nota fiscal: emissão ainda não configurada para este evento.</p>
      </section>}
      {area.transmission && <section aria-labelledby="transmission-title">
        <h2 id="transmission-title">Transmissão</h2>
        <p>{area.transmission.title}</p>
        <p><a href={area.transmission.url} target="_blank" rel="noopener noreferrer">{transmissionLabel[area.transmission.kind]}</a></p>
      </section>}
      {area.credential && <section aria-labelledby="credential-title">
        <h2 id="credential-title">Credencial de acesso</h2>
        <p>Apresente este QR à equipe de credenciamento. Ele é válido apenas para este evento.</p>
        <CredentialQr code={area.credential.code} />
        <p><small>Código para leitura manual: <code style={{ overflowWrap: 'anywhere' }}>{area.credential.code}</code></small></p>
        {area.credential.checkedInAt && <p role="status">Entrada registrada em {new Date(area.credential.checkedInAt).toLocaleString('pt-BR')}.</p>}
      </section>}
      {area.certificate?.eligible && <section aria-labelledby="certificate-title">
        <h2 id="certificate-title">Certificado de participação</h2>
        <p>O download não é cobrado. Ele só existe porque a entrada neste evento foi registrada.</p>
        {area.certificate.code
          ? <p><a className={styles.certificateLink} href={`/certificado/${area.certificate.code}`}>Baixar certificado</a> <a className={styles.certificateLink} href={`/api/public/certificates/${area.certificate.code}/pdf`}>Baixar PDF</a></p>
          : <button type="button" onClick={() => void issueCertificate()} disabled={busy}>Emitir certificado</button>}
      </section>}
      {token && <ParticipantRegistrationEditor slug={slug} token={token} />}
      {token && area.registration.status === 'CONFIRMED' && <EventEvaluationForm slug={slug} token={token} />}
      {token && area.event.profileCode === 'SCIENTIFIC_EVENT' && area.registration.status === 'CONFIRMED' && <ScientificAuthorPanel slug={slug} token={token} />}
      <p className={styles.session}>Por segurança, sua sessão termina às {new Date(area.sessionExpiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</p>
      {area.registration.status === 'PENDING_PAYMENT' && <p>Após concluir o pagamento, atualize a situação para conferir a confirmação.</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button type="button" onClick={refresh} disabled={busy}>{busy ? 'Atualizando…' : 'Atualizar situação'}</button>
        <button type="button" onClick={leave}>Sair com segurança</button>
      </div>
      
    </section>
    {token && area.registration.status === 'CONFIRMED' && <ParticipantAgenda slug={slug} token={token} embedded />}
    
  </main>;

  return <main className={styles.page}>
    <section className={styles.card} aria-labelledby="access-title">
      <Link href={`/evento/${slug}`}>← Voltar ao evento</Link>
      <p className={styles.eyebrow}>ÁREA DO PARTICIPANTE</p>
      <h1 id="access-title">Acompanhe sua inscrição</h1>
      <p>Use o código recebido na inscrição e o mesmo CPF ou documento estrangeiro informado na ficha. Na sua conta Evolvia, os próximos acessos usam e-mail e senha.</p>
      <form onSubmit={enter} className={styles.form}>
        <label>Código da inscrição<input autoComplete="off" required maxLength={20} value={protocol} onChange={(event) => setProtocol(event.target.value.toUpperCase())} /></label>
        <label>CPF ou documento estrangeiro<input autoComplete="off" required maxLength={50} value={document} onChange={(event) => setDocument(event.target.value)} /></label>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Validando…' : 'Entrar'}</button>
      </form>
      <p className={styles.privacy}>O documento é usado somente para validar o acesso e não é armazenado por esta tela.</p>
      
    </section>
  </main>;
}
