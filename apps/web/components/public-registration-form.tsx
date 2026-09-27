'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './public-registration-form.module.css';

type Field = { code: string; label: string; type: string; required: boolean; help?: string; options?: Array<{ id: string; label: string }>; appliesToCategoryIds?: string[] };
type Lot = { id: string; name: string; priceCents: number; remaining: number | null; endsAt: string };
type Category = { id: string; name: string; description: string | null; proofRequirement: string; lots: Lot[] };
type Options = {
  event: { name: string; slug: string; registrationMode: 'FREE' | 'PAID' | 'INVITATION' };
  categories: Category[];
  fields: Field[];
  currency: 'BRL';
  reservationMinutes: number;
  paymentEnabled: boolean;
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
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function initialAnswers(fields: Field[]): Record<string, string | number | boolean | string[]> {
  return Object.fromEntries(fields.map((field) => [field.code, field.type === 'CONSENT' ? false : field.type === 'CHECKBOX' ? [] : '']));
}

export default function PublicRegistrationForm({ slug, initialProtocol }: { slug: string; initialProtocol?: string }) {
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
  const [idempotencyKey] = useState(() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  });
  const [checkoutIdempotencyKey] = useState(() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  });

  useEffect(() => {
    if (initialProtocol) return;
    let active = true;
    fetch(`/api/public/events/${encodeURIComponent(slug)}/registration`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 404 ? 'As inscrições ainda não estão disponíveis.' : 'Não foi possível carregar a inscrição.');
        return response.json() as Promise<Options>;
      })
      .then((payload) => {
        if (!active) return;
        setOptions(payload);
        setAnswers(initialAnswers(payload.fields));
      })
      .catch((caught: Error) => { if (active) setError(caught.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialProtocol, slug]);

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
          paymentEnabled: true,
          checkoutUrl: payload.checkoutUrl,
        });
      })
      .catch((caught: Error) => { if (active) setError(caught.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialProtocol, slug]);

  const category = useMemo(() => options?.categories.find((item) => item.id === categoryId), [options, categoryId]);
  const lot = useMemo(() => category?.lots.find((item) => item.id === lotId), [category, lotId]);
  const visibleFields = useMemo(() => options?.fields.filter((field) => !field.appliesToCategoryIds?.length || (Boolean(categoryId) && field.appliesToCategoryIds.includes(categoryId))) ?? [], [options, categoryId]);

  function setAnswer(code: string, value: string | number | boolean | string[]) {
    setAnswers((current) => ({ ...current, [code]: value }));
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryId || !lotId) { setError('Selecione uma categoria e um lote.'); return; }
    const visibleCodes = new Set(visibleFields.map((field) => field.code));
    const scopedAnswers = Object.fromEntries(Object.entries(answers).filter(([code]) => visibleCodes.has(code)));
    setSending(true);
    setError('');
    try {
      const response = await fetch(`/api/public/events/${encodeURIComponent(slug)}/registration/reservations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
        body: JSON.stringify({
          categoryId,
          lotId,
          benefitCode: benefitCode.trim() || undefined,
          answers: { ...scopedAnswers, registration_type: categoryId },
          ...(options?.event.registrationMode === 'PAID' && lot && lot.priceCents > 0 ? { billing } : {}),
        }),
      });
      const payload = await response.json() as Result & { message?: string };
      if (!response.ok) throw new Error(payload.message ?? 'Não foi possível concluir a reserva.');
      setBillingSummary(payload.status === 'PENDING_PAYMENT' ? billing : null);
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível concluir a reserva.');
    } finally {
      setSending(false);
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

  if (loading) return <main className={styles.page}><p role="status">Carregando inscrição…</p></main>;
  if (error && !options) return <main className={styles.page}><div className={styles.notice} role="alert"><h1>Inscrição indisponível</h1><p>{error}</p><Link href={`/${encodeURIComponent(slug)}`}>Voltar ao evento</Link></div></main>;

  if (result) return <main className={styles.page}>
    <section className={styles.success} aria-labelledby="success-title">
      <p className={styles.eyebrow}>{result.status === 'CONFIRMED' ? 'INSCRIÇÃO CONFIRMADA' : 'RESERVA DE INSCRIÇÃO'}</p>
      <h1 id="success-title">{result.status === 'CONFIRMED' ? 'Pagamento confirmado' : result.status === 'PENDING_PAYMENT' ? 'Vaga reservada' : 'Reserva encerrada'}</h1>
      <p>Protocolo</p><strong className={styles.protocol}>{result.protocol}</strong>
      <dl>
        <div><dt>Valor final</dt><dd>{money.format(result.finalPriceCents / 100)}</dd></div>
        {result.discountPercent > 0 && <div><dt>Desconto aplicado</dt><dd>{result.discountPercent}%</dd></div>}
        {result.expiresAt && <div><dt>Reserva válida até</dt><dd>{new Date(result.expiresAt).toLocaleString('pt-BR')}</dd></div>}
      </dl>
      {billingSummary && result.status === 'PENDING_PAYMENT' && <div className={styles.billingSummary}><h2>Confira antes de pagar</h2><p>Participante: {String(answers.full_name ?? '')}</p><p>Pagador: {billingSummary.payer.name} ({billingSummary.payer.document})</p><p>Tomador indicado: {billingSummary.recipient.name} ({billingSummary.recipient.document})</p><p>Valor: {money.format(result.finalPriceCents / 100)}</p><small>Esses dados foram declarados na reserva. A emissão do documento fiscal dependerá da etapa fiscal do evento.</small></div>}
      <p>{result.nextStep}</p>
      {result.status === 'PENDING_PAYMENT' && result.paymentEnabled && <button className={styles.paymentButton} type="button" disabled={paying} onClick={startPayment}>
        {paying ? 'Abrindo pagamento…' : 'Ir para o pagamento seguro'}
      </button>}
      {result.status === 'PENDING_PAYMENT' && !result.paymentEnabled && <p className={styles.warning}>Pagamento temporariamente indisponível. Sua reserva permanece válida até o horário informado.</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {result.status === 'PENDING_PAYMENT' && <button className={styles.secondaryButton} type="button" onClick={() => window.location.reload()}>Atualizar confirmação</button>}
      <p>Guarde este protocolo. Por segurança, seus dados pessoais não são exibidos nesta página.</p>
      <Link href={`/evento/${slug}/participante`}>Acessar a Área do Participante</Link>
      <Link href={`/${encodeURIComponent(slug)}`}>Voltar ao evento</Link>
    </section>
  </main>;

  if (!options) return null;

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href={`/${encodeURIComponent(slug)}`}>← Voltar ao evento</Link>
      <p className={styles.eyebrow}>INSCRIÇÃO</p>
      <h1>{options.event.name}</h1>
      <p>Escolha sua categoria, preencha a ficha e confira o valor antes de reservar.</p>
    </header>

    <form className={styles.form} onSubmit={submit}>
      <fieldset>
        <legend>1. Categoria e lote</legend>
        <label>Categoria
          <select required value={categoryId} onChange={(event) => {
            const selected = event.target.value;
            const allowed = new Set(options.fields.filter((field) => !field.appliesToCategoryIds?.length || field.appliesToCategoryIds.includes(selected)).map((field) => field.code));
            setAnswers((current) => Object.fromEntries(Object.entries(current).filter(([code]) => allowed.has(code))));
            setCategoryId(selected); setLotId('');
          }}>
            <option value="">Selecione</option>
            {options.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        {category?.description && <p>{category.description}</p>}
        {category && <label>Lote
          <select required value={lotId} onChange={(event) => setLotId(event.target.value)}>
            <option value="">Selecione</option>
            {category.lots.map((item) => <option key={item.id} value={item.id}>{item.name} — {money.format(item.priceCents / 100)}{item.remaining === null ? '' : ` — ${item.remaining} vagas`}</option>)}
          </select>
        </label>}
        {lot && <p className={styles.price}>Valor antes do benefício: <strong>{money.format(lot.priceCents / 100)}</strong></p>}
        {category?.proofRequirement === 'REQUIRED_BEFORE_PAYMENT' && <p className={styles.warning}>Esta categoria exige comprovante antes do pagamento. A coleta segura será apresentada antes da cobrança.</p>}
      </fieldset>

      <fieldset>
        <legend>2. Seus dados</legend>
        <div className={styles.grid}>
          {visibleFields.filter((field) => field.code !== 'registration_type' && field.type !== 'PHOTO').map((field) => {
            const value = answers[field.code];
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
            const type = field.type === 'EMAIL' ? 'email' : field.type === 'DATE' ? 'date' : field.type === 'NUMBER' ? 'number' : field.type === 'PHONE' ? 'tel' : 'text';
            return <label key={field.code}>{field.label}
              <input type={type} required={field.required} maxLength={type === 'text' || type === 'email' || type === 'tel' ? 254 : undefined} value={String(value ?? '')} onChange={(event) => setAnswer(field.code, type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)} />
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
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button type="submit" disabled={sending}>{sending ? 'Reservando…' : 'Reservar minha vaga'}</button>
        <p className={styles.privacy}>Seus dados são usados somente para esta inscrição, conforme a Política de Privacidade. A chave de idempotência impede reservas duplicadas por reenvio.</p>
      </fieldset>
    </form>
  </main>;
}
