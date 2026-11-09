'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import InternationalPhoneInput from './international-phone-input';
import { phoneError, updateRegistrationAnswer } from '../lib/registration-input';
import { getToken } from '../lib/api';
import { formatEventDate } from '../lib/event-time-zone';
import {
  publicRegistrationFormEyebrow,
  publicRegistrationNoun,
  publicRegistrationSubmitLabel,
  publicRegistrationSuccessEyebrow,
  publicRegistrationSuccessTitle,
  publicRegistrationSummaryTitle,
} from '../lib/public-registration-cta';
import EvaScreenSupport from './eva-screen-support';
import RegistrationRefundNotice from './registration-refund-notice';
import styles from './public-registration-form.module.css';

type Field = { code: string; label: string; type: string; required: boolean; help?: string; options?: Array<{ id: string; label: string }>; appliesToCategoryIds?: string[] };
type Lot = { id: string; name: string; priceCents: number; remaining: number | null; endsAt: string };
type Category = { id: string; name: string; description: string | null; proofRequirement: string; lots: Lot[] };
type WaitlistLot = { categoryId: string; categoryName: string; lotId: string; lotName: string; priceCents: number };
type Options = {
  event: { name: string; slug: string; profileCode?: string | null; eventType?: string | null; registrationMode: 'FREE' | 'PAID' | 'INVITATION'; timeZone?: string | null };
  categories: Category[];
  waitlist?: WaitlistLot[];
  offerExpiresAt?: string;
  fields: Field[];
  terms: { fileName: string; version: number; url: string } | null;
  currency: 'BRL';
  reservationMinutes: number;
  paymentEnabled: boolean;
  platformCommission?: {
    percent: number | null;
    bearer: 'ORGANIZER' | 'PARTICIPANT';
    certificateCents: 0;
    submissionCents: 0;
  };
};
type BillingParty = { kind: 'PERSON' | 'COMPANY'; name: string; document: string; email: string };
type BillingDeclaration = { payer: BillingParty; recipient: BillingParty };
type BillingChoice = 'PARTICIPANT' | 'PAYER' | 'OTHER_PERSON' | 'COMPANY';
const emptyParty = (): BillingParty => ({ kind: 'PERSON', name: '', document: '', email: '' });

type Result = {
  protocol: string;
  status: 'PENDING_PAYMENT' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';
  basePriceCents: number;
  discountPercent: number;
  finalPriceCents: number;
  expiresAt: string | null;
  nextStep: string;
  paymentEnabled: boolean;
  checkoutUrl?: string | null;
  categoryProof?: { required: boolean; state: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | null };
};

type CheckoutResponse = {
  protocol: string;
  reservationStatus: Result['status'];
  checkoutStatus: string | null;
  amountCents: number | null;
  checkoutUrl: string | null;
  expiresAt: string | null;
  paymentConfirmed: boolean;
  nextStep: string;
  categoryProof?: Result['categoryProof'];
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const registrationEva = [
  {
    question: 'A Evolvia cobra alguma taxa?',
    answer: 'Só se a inscrição for paga. A comissão fica entre 10% e 15%. Inscrição gratuita, certificado e envio de trabalho científico não têm taxa da plataforma.',
  },
  {
    question: 'Como eu pago?',
    answer: 'Se o país da ficha for o Brasil, o checkout oferece Pix e cartão, com parcelamento em até 6 vezes. Se for outro país, oferece cartão internacional. O valor é em reais. A EVA não vê nem guarda o cartão.',
  },
];

function priceLabel(cents: number): string {
  return cents <= 0 ? 'Gratuito' : money.format(cents / 100);
}

function lowestPriceLabel(category: Category): string {
  const open = category.lots.filter((item) => item.remaining !== 0);
  const source = open.length > 0 ? open : category.lots;
  if (source.length === 0) return 'Sem lote';
  const min = Math.min(...source.map((item) => item.priceCents));
  return min <= 0 ? 'Gratuito' : `A partir de ${priceLabel(min)}`;
}

function lotAvailability(item: Lot, timeZone: string | null): string | null {
  if (item.remaining === 0) return 'Esgotado';
  const seats = item.remaining === null ? null : item.remaining === 1 ? '1 vaga' : `${item.remaining} vagas`;
  const end = formatEventDate(item.endsAt, timeZone, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  const parts = [seats, end ? `até ${end}` : null].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' · ') : null;
}

function responseMessage(payload: { message?: unknown; error?: { message?: unknown } }, fallback: string): string {
  if (typeof payload.message === 'string' && payload.message) return payload.message;
  if (typeof payload.error?.message === 'string' && payload.error.message) return payload.error.message;
  return fallback;
}

function initialAnswers(fields: Field[]): Record<string, string | number | boolean | string[]> {
  return Object.fromEntries(fields.map((field) => [field.code, field.type === 'CONSENT' ? false : field.type === 'CHECKBOX' ? [] : '']));
}

export default function PublicRegistrationForm(props: {
  slug: string;
  initialProtocol?: string;
  offerLotId?: string;
  initialProfileCode?: string | null;
  initialEventType?: string | null;
}) {
  return <>
    <EvaScreenSupport guide="registration" additionalQuestions={registrationEva} />
    <RegistrationForm {...props} />
  </>;
}

function RegistrationForm({
  slug,
  initialProtocol,
  offerLotId,
  initialProfileCode,
  initialEventType,
}: {
  slug: string;
  initialProtocol?: string;
  offerLotId?: string;
  initialProfileCode?: string | null;
  initialEventType?: string | null;
}) {
  const preferredNameEdited = useRef(false);
  const submitting = useRef(false);
  const [options, setOptions] = useState<Options | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [lotId, setLotId] = useState('');
  const [benefitCode, setBenefitCode] = useState('');
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | string[]>>({});
  const [payerChoice, setPayerChoice] = useState<'PARTICIPANT' | 'OTHER_PERSON' | 'COMPANY'>('PARTICIPANT');
  const [recipientChoice, setRecipientChoice] = useState<BillingChoice>('PARTICIPANT');
  const [otherPayer, setOtherPayer] = useState<BillingParty>(emptyParty);
  const [otherRecipient, setOtherRecipient] = useState<BillingParty>(emptyParty);
  const [billingSummary, setBillingSummary] = useState<BillingDeclaration | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofBusy, setProofBusy] = useState(false);
  const [idempotencyKey] = useState(() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  });
  const [checkoutIdempotencyKey] = useState(() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  });

  const waitlistHref = `/evento/${encodeURIComponent(slug)}/inscricao/fila`;

  function offerHeaders(): Record<string, string> {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  useEffect(() => {
    if (initialProtocol) return;
    let active = true;
    if (offerLotId && !getToken()) {
      setError('Entre na sua conta para confirmar a vaga oferecida pela fila.');
      setLoading(false);
      return;
    }
    const source = offerLotId
      ? `/api/participant/events/${encodeURIComponent(slug)}/waitlist/${encodeURIComponent(offerLotId)}/offer`
      : `/api/public/events/${encodeURIComponent(slug)}/registration`;
    fetch(source, { cache: 'no-store', headers: offerLotId ? offerHeaders() : {} })
      .then(async (response) => {
        if (offerLotId && !response.ok) {
          const payload = await response.json().catch(() => ({})) as { message?: string; error?: { message?: string } };
          throw new Error(response.status === 401 ? 'Entre na sua conta para confirmar a vaga oferecida pela fila.' : responseMessage(payload, 'A vaga oferecida pela fila não está mais disponível.'));
        }
        if (!response.ok) throw new Error(response.status === 404 ? 'As inscrições ainda não estão disponíveis.' : 'Não foi possível carregar a inscrição.');
        return response.json() as Promise<Options>;
      })
      .then((payload) => {
        if (!active) return;
        setOptions(payload);
        setAnswers(initialAnswers(payload.fields));
        preferredNameEdited.current = false;
        if (offerLotId && payload.categories.length === 1 && payload.categories[0].lots.length === 1) {
          setCategoryId(payload.categories[0].id);
          setLotId(payload.categories[0].lots[0].id);
        }
      })
      .catch((caught: Error) => { if (active) setError(caught.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialProtocol, offerLotId, slug]);

  useEffect(() => {
    if (!initialProtocol) return;
    let active = true;
    setLoading(true);
    fetch(`/api/public/events/${encodeURIComponent(slug)}/registration/reservations/${encodeURIComponent(initialProtocol)}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as CheckoutResponse & { message?: string };
        if (!response.ok) throw new Error(payload.message ?? 'Não foi possível consultar o pagamento.');
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        setResult({
          protocol: payload.protocol,
          status: payload.reservationStatus,
          basePriceCents: payload.amountCents ?? 0,
          discountPercent: 0,
          finalPriceCents: payload.amountCents ?? 0,
          expiresAt: payload.expiresAt,
          nextStep: payload.nextStep,
          paymentEnabled: payload.categoryProof?.required === true && payload.categoryProof.state !== 'APPROVED' ? false : true,
          checkoutUrl: payload.checkoutUrl,
          categoryProof: payload.categoryProof,
        });
      })
      .catch((caught: Error) => { if (active) setError(caught.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialProtocol, slug]);

  const category = useMemo(() => options?.categories.find((item) => item.id === categoryId), [options, categoryId]);
  const lot = useMemo(() => category?.lots.find((item) => item.id === lotId), [category, lotId]);
  const visibleFields = useMemo(() => options?.fields.filter((field) => !field.appliesToCategoryIds?.length || (Boolean(categoryId) && field.appliesToCategoryIds.includes(categoryId))) ?? [], [options, categoryId]);

  function chooseCategory(selected: string) {
    if (!options) return;
    const allowed = new Set(options.fields.filter((field) => !field.appliesToCategoryIds?.length || field.appliesToCategoryIds.includes(selected)).map((field) => field.code));
    setAnswers((current) => Object.fromEntries(Object.entries(current).filter(([code]) => allowed.has(code))));
    setCategoryId(selected);
    const next = options.categories.find((item) => item.id === selected);
    const open = next?.lots.filter((item) => item.remaining !== 0) ?? [];
    setLotId(open.length === 1 ? open[0].id : '');
  }

  function setAnswer(code: string, value: string | number | boolean | string[]) {
    if (code === 'preferred_name') preferredNameEdited.current = true;
    setAnswers((current) => updateRegistrationAnswer(current, code, value, preferredNameEdited.current));
  }

  const participantParty: BillingParty = {
    kind: 'PERSON',
    name: String(answers.full_name ?? ''),
    document: String(answers.identity_document ?? ''),
    email: String(answers.email ?? ''),
  };
  const payer = payerChoice === 'PARTICIPANT' ? participantParty : { ...otherPayer, kind: payerChoice === 'COMPANY' ? 'COMPANY' as const : 'PERSON' as const };
  const recipient = recipientChoice === 'PARTICIPANT' ? participantParty
    : recipientChoice === 'PAYER' ? payer
    : { ...otherRecipient, kind: recipientChoice === 'COMPANY' ? 'COMPANY' as const : 'PERSON' as const };
  const billing: BillingDeclaration = { payer, recipient };

  async function fileBase64(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  }

  async function sendProof(protocol: string, file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 5 * 1024 * 1024) {
      throw new Error('Envie um PDF de até 5 MB.');
    }
    const response = await fetch(`/api/public/events/${encodeURIComponent(slug)}/registration/reservations/${encodeURIComponent(protocol)}/category-proof`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contentBase64: await fileBase64(file), fileName: file.name }),
    });
    const payload = await response.json() as { state?: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED'; message?: string };
    if (!response.ok || !payload.state) throw new Error(payload.message ?? 'Não foi possível enviar o comprovante.');
    return payload.state;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (!options?.terms) { setError('A organização ainda precisa disponibilizar os termos. Tente novamente depois da configuração.'); return; }
    if (answers.terms_acceptance !== true) { setError('Leia e aceite os termos para concluir a inscrição.'); return; }
    for (const field of visibleFields.filter((item) => item.type === 'PHONE')) {
      const value = String(answers[field.code] ?? '');
      const problem = value || field.required ? phoneError(value) : null;
      if (problem) { setError(`${field.label}: ${problem}`); return; }
    }
    if (!categoryId || !lotId) { setError('Selecione uma categoria e um lote.'); return; }
    const proofMode = category?.proofRequirement;
    const proofRequired = proofMode === 'REQUIRED_BEFORE_PAYMENT';
    if (proofRequired && !proofFile) {
      setError('Anexe o PDF que comprova esta categoria.');
      return;
    }
    const visibleCodes = new Set(visibleFields.map((field) => field.code));
    const scopedAnswers = Object.fromEntries(Object.entries(answers).filter(([code]) => visibleCodes.has(code)));
    submitting.current = true;
    setSending(true);
    setError('');
    try {
      const target = offerLotId
        ? `/api/participant/events/${encodeURIComponent(slug)}/waitlist/${encodeURIComponent(offerLotId)}/accept`
        : `/api/public/events/${encodeURIComponent(slug)}/registration/reservations`;
      const response = await fetch(target, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey, ...(offerLotId ? offerHeaders() : {}) },
        body: JSON.stringify({
          categoryId,
          lotId,
          benefitCode: benefitCode.trim() || undefined,
          answers: { ...scopedAnswers, registration_type: categoryId },
          ...(options?.event.registrationMode === 'PAID' && lot && lot.priceCents > 0 ? { billing } : {}),
        }),
      });
      const payload = await response.json() as Result & { message?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(responseMessage(payload, 'Não foi possível concluir a reserva.'));
      setBillingSummary(payload.status === 'PENDING_PAYMENT' ? billing : null);
      if ((proofMode === 'OPTIONAL' || proofRequired) && proofFile) {
        try {
          const state = await sendProof(payload.protocol, proofFile);
          setResult({
            ...payload,
            paymentEnabled: proofRequired ? false : payload.paymentEnabled,
            categoryProof: { required: proofRequired, state },
            nextStep: proofRequired ? 'Comprovante recebido. O pagamento abre depois que a organização aprovar.' : payload.nextStep,
          });
        } catch (caught) {
          if (proofRequired) {
            setResult({ ...payload, paymentEnabled: false, categoryProof: { required: true, state: null }, nextStep: 'A vaga foi reservada, mas o comprovante ainda não foi enviado.' });
          } else {
            setResult(payload);
          }
          setError(caught instanceof Error ? caught.message : 'Não foi possível enviar o comprovante.');
        }
      } else {
        setResult(payload);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível concluir a reserva.');
    } finally {
      submitting.current = false;
      setSending(false);
    }
  }

  async function replaceProof() {
    if (!result || !proofFile) { setError('Anexe o PDF que comprova esta categoria.'); return; }
    setProofBusy(true);
    setError('');
    try {
      const state = await sendProof(result.protocol, proofFile);
      const required = result.categoryProof?.required === true;
      setResult({
        ...result,
        categoryProof: { required, state },
        paymentEnabled: required ? false : result.paymentEnabled,
        nextStep: required ? 'Comprovante recebido. O pagamento abre depois que a organização aprovar.' : result.nextStep,
      });
      setProofFile(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível enviar o comprovante.');
    } finally {
      setProofBusy(false);
    }
  }

  async function startPayment() {
    if (!result || result.status !== 'PENDING_PAYMENT') return;
    if (result.checkoutUrl) {
      window.location.assign(result.checkoutUrl);
      return;
    }
    setPaying(true);
    setError('');
    try {
      const response = await fetch(`/api/public/events/${encodeURIComponent(slug)}/registration/reservations/${encodeURIComponent(result.protocol)}/checkout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': checkoutIdempotencyKey },
      });
      const payload = await response.json() as CheckoutResponse & { message?: string };
      if (!response.ok || !payload.checkoutUrl) throw new Error(payload.message ?? 'Não foi possível iniciar o pagamento.');
      setResult((current) => current ? { ...current, checkoutUrl: payload.checkoutUrl, nextStep: payload.nextStep } : current);
      window.location.assign(payload.checkoutUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível iniciar o pagamento.');
    } finally {
      setPaying(false);
    }
  }

  const profileCode = options?.event.profileCode ?? initialProfileCode;
  const eventType = options?.event.eventType ?? initialEventType;
  const registrationNoun = publicRegistrationNoun(profileCode, eventType);

  if (loading) return <main className={styles.page}><p role="status">Carregando {registrationNoun}…</p></main>;
  if (error && !options) return <main className={styles.page}><div className={styles.notice} role="alert"><h1>{offerLotId ? 'Vaga da fila indisponível' : registrationNoun === 'ingresso' ? 'Ingresso indisponível' : 'Inscrição indisponível'}</h1><p>{error}</p>{offerLotId && <Link href={waitlistHref}>Ver minha fila de espera</Link>}<Link href={`/${encodeURIComponent(slug)}`}>Voltar ao evento</Link></div></main>;

  if (result) return <main className={styles.page}>
    <section className={styles.success} aria-labelledby="success-title">
      <p className={styles.eyebrow}>{publicRegistrationSuccessEyebrow(result.status, options?.event.profileCode, options?.event.eventType)}</p>
      <h1 id="success-title">{publicRegistrationSuccessTitle(result.status, result.finalPriceCents, options?.event.profileCode, options?.event.eventType)}</h1>
      <p>Protocolo</p><strong className={styles.protocol}>{result.protocol}</strong>
      <dl>
        <div><dt>Valor final</dt><dd>{money.format(result.finalPriceCents / 100)}</dd></div>
        {result.discountPercent > 0 && <div><dt>Desconto aplicado</dt><dd>{result.discountPercent}%</dd></div>}
        {result.expiresAt && <div><dt>Reserva válida até</dt><dd>{new Date(result.expiresAt).toLocaleString('pt-BR')}</dd></div>}
      </dl>
      {billingSummary && result.status === 'PENDING_PAYMENT' && <div className={styles.billingSummary}><h2>Confira antes de pagar</h2><p>Participante: {String(answers.full_name ?? '')}</p><p>Pagador: {billingSummary.payer.name} ({billingSummary.payer.document})</p><p>Tomador indicado: {billingSummary.recipient.name} ({billingSummary.recipient.document})</p><p>Valor: {money.format(result.finalPriceCents / 100)}</p><small>Esses dados foram declarados na reserva. A emissão do documento fiscal dependerá da etapa fiscal do evento.</small></div>}
      <p>{result.nextStep}</p>
      {result.categoryProof && result.categoryProof.state !== 'APPROVED' && (result.categoryProof.required || result.categoryProof.state !== 'PENDING_REVIEW') && <div className={styles.warning}>
        <p>{result.categoryProof.state === 'REJECTED' ? 'A organização recusou o comprovante. Envie outro PDF.' : 'O comprovante fica guardado como arquivo. Ele não executa nada no Evolvia.'}</p>
        <label>Substituir comprovante
          <input type="file" accept="application/pdf,.pdf" onChange={(event) => setProofFile(event.target.files?.[0] ?? null)} />
        </label>
        <button className={styles.secondaryButton} type="button" disabled={proofBusy || !proofFile} onClick={() => void replaceProof()}>{proofBusy ? 'Enviando…' : 'Enviar comprovante'}</button>
      </div>}
      {result.status === 'PENDING_PAYMENT' && result.paymentEnabled && (!result.categoryProof?.required || result.categoryProof.state === 'APPROVED') && <button className={styles.paymentButton} type="button" disabled={paying} onClick={startPayment}>
        {paying ? 'Abrindo pagamento…' : 'Ir para o pagamento seguro'}
      </button>}
      {result.status === 'PENDING_PAYMENT' && !result.paymentEnabled && !result.categoryProof?.required && <p className={styles.warning}>Pagamento temporariamente indisponível. Sua reserva permanece válida até o horário informado.</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {result.status === 'PENDING_PAYMENT' && <button className={styles.secondaryButton} type="button" onClick={() => window.location.reload()}>Atualizar confirmação</button>}
      <p>Guarde este protocolo. Por segurança, seus dados pessoais não são exibidos nesta página.</p>
      <Link href={`/evento/${encodeURIComponent(slug)}/participante`}>Acessar a Área do Participante</Link>
      <Link href={`/${encodeURIComponent(slug)}`}>Voltar ao evento</Link>
    </section>
    
  </main>;

  if (!options) return null;

  const waitlistLots = offerLotId ? [] : options.waitlist ?? [];
  const waitlistNotice = waitlistLots.length > 0 && <aside className={styles.warning} aria-labelledby="registration-waitlist-title">
    <h2 id="registration-waitlist-title">{waitlistLots.length === 1 ? 'Lote esgotado com fila de espera' : 'Lotes esgotados com fila de espera'}</h2>
    <p>{waitlistLots.map((item) => `${item.categoryName} · ${item.lotName}`).join('; ')}. Entre na fila pela sua conta. Se uma vaga for liberada, a organização oferece pela ordem de entrada e você confirma pela ficha.</p>
    <Link className={styles.waitlistLink} href={waitlistHref}>Entrar na fila de espera</Link>
  </aside>;

  if (options.categories.length === 0) return <main className={styles.page}>
    <div className={styles.notice}>
      <p className={styles.eyebrow}>{publicRegistrationFormEyebrow(options.event.profileCode, options.event.eventType)}</p>
      <h1>{options.event.name}</h1>
      <p>As vagas disponíveis acabaram.</p>
      {waitlistNotice}
      <Link href={`/${encodeURIComponent(slug)}`}>Voltar ao evento</Link>
    </div>
  </main>;

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href={offerLotId ? waitlistHref : `/${encodeURIComponent(slug)}`}>{offerLotId ? '← Voltar à fila de espera' : '← Voltar ao evento'}</Link>
      <p className={styles.eyebrow}>{offerLotId ? 'VAGA DA FILA DE ESPERA' : publicRegistrationFormEyebrow(options.event.profileCode, options.event.eventType)}</p>
      <h1>{options.event.name}</h1>
      {offerLotId && options.offerExpiresAt
        ? <p className={styles.warning}>Esta vaga está reservada para você até {new Date(options.offerExpiresAt).toLocaleString('pt-BR')}. Preencha a ficha com o mesmo documento informado na fila e o e-mail da sua conta.</p>
        : <p>Escolha a categoria e o lote. O resumo acompanha o valor antes de reservar.</p>}
      {!offerLotId && options.event.registrationMode === 'PAID' && options.categories.some((item) => item.lots.some((offer) => offer.priceCents > 0)) &&
        <Link className={styles.waitlistLink} href={'/evento/' + encodeURIComponent(slug) + '/inscricao/grupo'}>Inscrever de 2 a 10 pessoas em um único pedido</Link>}
      {waitlistNotice}
    </header>

    <form className={styles.form} onSubmit={submit}>
      <div className={styles.checkout}>
      <div className={styles.steps}>
      <fieldset>
        <legend>1. Categoria e lote</legend>
        <p className={styles.groupLabel} id="registration-category-label">Categoria</p>
        <div className={styles.choices} role="radiogroup" aria-labelledby="registration-category-label">
          {options.categories.map((item) => {
            const soldOut = item.lots.length > 0 && item.lots.every((lotItem) => lotItem.remaining === 0);
            return <label className={categoryId === item.id ? `${styles.choice} ${styles.choiceSelected}` : styles.choice} key={item.id}>
              <input type="radio" name="registration-category" value={item.id} required checked={categoryId === item.id} disabled={soldOut} onChange={() => chooseCategory(item.id)} />
              <span className={styles.choiceBody}>
                <span className={styles.choiceTitle}>{item.name}</span>
                {item.description && <span className={styles.choiceMeta}>{item.description}</span>}
                <span className={styles.choicePrice}>{soldOut ? 'Esgotado' : lowestPriceLabel(item)}</span>
              </span>
            </label>;
          })}
        </div>
        {category && <p className={styles.groupLabel} id="registration-lot-label">Lote</p>}
        {category && <div className={styles.choices} role="radiogroup" aria-labelledby="registration-lot-label">
          {category.lots.map((item) => {
            const soldOut = item.remaining === 0;
            const availability = lotAvailability(item, options.event.timeZone ?? null);
            return <label className={lotId === item.id ? `${styles.choice} ${styles.choiceSelected}` : styles.choice} key={item.id}>
              <input type="radio" name="registration-lot" value={item.id} required checked={lotId === item.id} disabled={soldOut} onChange={() => setLotId(item.id)} />
              <span className={styles.choiceBody}>
                <span className={styles.choiceTitle}>{item.name}</span>
                {availability && <span className={styles.choiceMeta}>{availability}</span>}
                <span className={styles.choicePrice}>{soldOut ? 'Esgotado' : priceLabel(item.priceCents)}</span>
              </span>
            </label>;
          })}
        </div>}
        {(category?.proofRequirement === 'OPTIONAL' || category?.proofRequirement === 'REQUIRED_BEFORE_PAYMENT') && <div className={styles.warning}>
          <p>{category.proofRequirement === 'OPTIONAL'
            ? 'Esta categoria pode receber um PDF de comprovação, como carteirinha de associado ou declaração de estudante. O envio é opcional e a inscrição segue sem ele.'
            : 'Esta categoria pede um PDF de comprovação, como carteirinha de associado ou declaração de estudante. O pagamento só abre depois que a organização aprovar o arquivo.'}</p>
          <label>Comprovante em PDF{category.proofRequirement === 'OPTIONAL' ? ' (opcional)' : ''}
            <input type="file" accept="application/pdf,.pdf" required={category.proofRequirement === 'REQUIRED_BEFORE_PAYMENT'} onChange={(event) => setProofFile(event.target.files?.[0] ?? null)} />
          </label>
        </div>}
      </fieldset>

      <fieldset>
        <legend>2. Seus dados</legend>
        <div className={styles.grid}>
          {visibleFields.filter((field) => field.code !== 'registration_type' && field.type !== 'PHOTO').map((field) => {
            const value = answers[field.code];
            if (field.type === 'CONSENT' && field.code === 'terms_acceptance') return <div className={styles.check} key={field.code}>
              <input id="terms-acceptance" type="checkbox" required disabled={!options.terms} checked={value === true} onChange={(event) => setAnswer(field.code, event.target.checked)} />
              <div>
                <label htmlFor="terms-acceptance">{field.label}{field.required ? ' *' : ''}</label>
                {options.terms
                  ? <a className={styles.termsLink} href={options.terms.url} target="_blank" rel="noopener noreferrer">Abrir {options.terms.fileName}</a>
                  : <small>O documento dos termos ainda não foi publicado. A inscrição não pode ser concluída.</small>}
              </div>
            </div>;
            if (field.type === 'CONSENT') return <label className={styles.check} key={field.code}>
              <input type="checkbox" required={field.required} checked={value === true} onChange={(event) => setAnswer(field.code, event.target.checked)} /> {field.label}
            </label>;
            if (field.type === 'TEXTAREA') return <label key={field.code}>{field.label}
              <textarea required={field.required} maxLength={2000} value={String(value ?? '')} onChange={(event) => setAnswer(field.code, event.target.value)} />
              {field.help && <small>{field.help}</small>}
            </label>;
            if ((field.type === 'SELECT' || field.type === 'RADIO') && field.options) return <label key={field.code}>{field.label}
              <select required={field.required} value={String(value ?? '')} onChange={(event) => setAnswer(field.code, event.target.value)}>
                <option value="">Selecione</option>{field.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>;
            if (field.type === 'CHECKBOX' && field.options) return <fieldset className={styles.options} key={field.code}><legend>{field.label}</legend>
              {field.options.map((option) => <label className={styles.check} key={option.id}><input type="checkbox" checked={Array.isArray(value) && value.includes(option.id)} onChange={(event) => {
                const current = Array.isArray(value) ? value : [];
                setAnswer(field.code, event.target.checked ? [...current, option.id] : current.filter((item) => item !== option.id));
              }} /> {option.label}</label>)}
            </fieldset>;
            if (field.type === 'PHONE') return <InternationalPhoneInput key={field.code} label={field.label} value={String(value ?? '')} required={field.required} onChange={(next) => setAnswer(field.code, next)} />;
            const type = field.type === 'EMAIL' ? 'email' : field.type === 'DATE' ? 'date' : field.type === 'NUMBER' ? 'number' : 'text';
            return <label key={field.code}>{field.label}
              <input type={type} required={field.required} maxLength={type === 'text' || type === 'email' ? 254 : undefined} value={String(value ?? '')} onChange={(event) => setAnswer(field.code, type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)} />
              {field.code === 'preferred_name' && <small>Sugerimos seu primeiro nome. Edite como preferir; sua escolha será preservada.</small>}
              {field.help && <small>{field.help}</small>}
            </label>;
          })}
        </div>
      </fieldset>

      {options.event.registrationMode === 'PAID' && lot && lot.priceCents > 0 && <fieldset>
        <legend>3. Pagador e dados para documento fiscal</legend>
        <p>Informe quem pagará e em nome de quem deseja solicitar o documento fiscal. O participante continua sendo a pessoa da ficha acima.</p>
        <label>Quem pagará?
          <select value={payerChoice} onChange={(event) => setPayerChoice(event.target.value as typeof payerChoice)}>
            <option value="PARTICIPANT">O próprio participante</option><option value="OTHER_PERSON">Outra pessoa física</option><option value="COMPANY">Empresa (pessoa jurídica)</option>
          </select>
        </label>
        {payerChoice !== 'PARTICIPANT' && <div className={styles.grid}>
          <label>{payerChoice === 'COMPANY' ? 'Razão social do pagador' : 'Nome completo do pagador'}<input required maxLength={180} value={otherPayer.name} onChange={(event) => setOtherPayer({ ...otherPayer, name: event.target.value })} /></label>
          <label>{payerChoice === 'COMPANY' ? 'CNPJ do pagador (14 dígitos)' : 'CPF ou documento do pagador'}<input required maxLength={40} inputMode={payerChoice === 'COMPANY' ? 'numeric' : 'text'} value={otherPayer.document} onChange={(event) => setOtherPayer({ ...otherPayer, document: event.target.value })} /></label>
          <label>E-mail do pagador<input required type="email" maxLength={254} value={otherPayer.email} onChange={(event) => setOtherPayer({ ...otherPayer, email: event.target.value })} /></label>
        </div>}
        <label>Em nome de quem solicitar o documento fiscal?
          <select value={recipientChoice} onChange={(event) => setRecipientChoice(event.target.value as BillingChoice)}>
            <option value="PARTICIPANT">Participante</option><option value="PAYER">Pagador informado acima</option>
            <option value="OTHER_PERSON">Outra pessoa física</option><option value="COMPANY">Empresa (pessoa jurídica)</option>
          </select>
        </label>
        {(recipientChoice === 'OTHER_PERSON' || recipientChoice === 'COMPANY') && <div className={styles.grid}>
          <label>{recipientChoice === 'COMPANY' ? 'Razão social' : 'Nome completo'}<input required maxLength={180} value={otherRecipient.name} onChange={(event) => setOtherRecipient({ ...otherRecipient, name: event.target.value })} /></label>
          <label>{recipientChoice === 'COMPANY' ? 'CNPJ (14 dígitos)' : 'CPF ou documento'}<input required maxLength={40} inputMode={recipientChoice === 'COMPANY' ? 'numeric' : 'text'} value={otherRecipient.document} onChange={(event) => setOtherRecipient({ ...otherRecipient, document: event.target.value })} /></label>
          <label>E-mail para o documento<input required type="email" maxLength={254} value={otherRecipient.email} onChange={(event) => setOtherRecipient({ ...otherRecipient, email: event.target.value })} /></label>
        </div>}
        <p>Confira os dados antes de reservar. A solicitação do documento fiscal não equivale à emissão.</p>
      </fieldset>}

      <fieldset>
        <legend>{options.event.registrationMode === 'PAID' && lot && lot.priceCents > 0 ? '4' : '3'}. Benefício e confirmação</legend>
        <label>Cupom, convite ou cortesia
          <input autoCapitalize="characters" maxLength={32} value={benefitCode} onChange={(event) => setBenefitCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/gu, ''))} />
          <small>{options.event.registrationMode === 'INVITATION' ? 'Obrigatório para este evento.' : 'Opcional. O valor final será calculado com segurança no servidor.'}</small>
        </label>
      </fieldset>
      </div>
      <aside className={styles.summary} aria-labelledby="registration-summary-title">
        <h2 id="registration-summary-title">{publicRegistrationSummaryTitle(options.event.profileCode, options.event.eventType)}</h2>
        <p className={styles.summaryEvent}>{options.event.name}</p>
        <dl>
          <div><dt>Categoria</dt><dd>{category?.name ?? 'Escolha uma categoria'}</dd></div>
          <div><dt>Lote</dt><dd>{lot?.name ?? 'Escolha um lote'}</dd></div>
          <div><dt>Valor antes do benefício</dt><dd className={styles.price}>{lot ? priceLabel(lot.priceCents) : '—'}</dd></div>
        </dl>
        <p className={styles.summaryNote}>O valor final, com cupom ou cortesia, é calculado no servidor ao reservar.</p>
        {options.event.registrationMode === 'PAID' && lot && lot.priceCents > 0 && <p className={styles.summaryNote}>{options.platformCommission?.percent && options.platformCommission.bearer === 'PARTICIPANT' ? `O pagamento inclui ${options.platformCommission.percent}% de comissão da Evolvia sobre este valor.` : options.platformCommission?.percent ? `A comissão de ${options.platformCommission.percent}% da Evolvia fica com a plataforma e não aumenta este valor.` : 'A comissão da Evolvia sobre inscrição paga fica entre 10% e 15%.'} Certificado e trabalho científico não têm taxa. No Brasil, Pix e cartão; em outro país, cartão. O recebimento é em reais.</p>}
        {options.event.registrationMode === 'PAID' && lot && lot.priceCents > 0 && <RegistrationRefundNotice slug={options.event.slug} paid />}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button type="submit" aria-describedby="registration-submit-guidance" disabled={sending || !options.terms}>{sending ? 'Reservando…' : publicRegistrationSubmitLabel(options.event.profileCode, options.event.eventType, Boolean(offerLotId))}</button>
        <p id="registration-submit-guidance" role="status">{!options.terms ? 'Inscrição indisponível: a organização precisa anexar os termos. Nenhum dado foi enviado.' : answers.terms_acceptance !== true ? 'Leia o documento e marque o aceite dos termos para concluir.' : 'Confira os campos obrigatórios e conclua sua inscrição.'}</p>
        <p className={styles.privacy}>Seus dados são usados somente para {publicRegistrationNoun(options.event.profileCode, options.event.eventType) === 'ingresso' ? 'este ingresso' : 'esta inscrição'}, conforme a Política de Privacidade. Reenviar o formulário não cria outra reserva.</p>
      </aside>
      </div>
    </form>
    
  </main>;
}

