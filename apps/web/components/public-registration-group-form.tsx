'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './public-registration-form.module.css';

type Answer = string | number | boolean | string[];
type Field = { code: string; label: string; type: string; required: boolean; help?: string; options?: Array<{ id: string; label: string }>; appliesToCategoryIds?: string[] };
type Lot = { id: string; name: string; priceCents: number; remaining: number | null };
type Category = { id: string; name: string; proofRequirement: string; remaining?: number | null; lots: Lot[] };
type Options = {
  event: { name: string; registrationMode: 'FREE' | 'PAID' | 'INVITATION' };
  categories: Category[];
  fields: Field[];
  terms: { url: string; fileName: string } | null;
  paymentEnabled: boolean;
};
type Entry = { categoryId: string; lotId: string; answers: Record<string, Answer> };
type Party = { kind: 'PERSON' | 'COMPANY'; name: string; document: string; email: string };
type Order = {
  orderId: string; status: string; entryCount: number; subtotalCents: number; expiresAt: string | null;
  entries: Array<{ position: number; protocol: string | null; status: string | null }>;
  checkout?: { status: string; checkoutUrl: string | null; amountCents: number; paidAt: string | null } | null;
};
type Preview = { entryCount: number; subtotalCents: number; stockReserved: false };
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const emptyEntry = (): Entry => ({ categoryId: '', lotId: '', answers: { terms_acceptance: false } });
const emptyParty = (): Party => ({ kind: 'PERSON', name: '', document: '', email: '' });
const safeError = (body: { message?: unknown; error?: { message?: unknown } }, fallback: string) =>
  typeof body.error?.message === 'string' ? body.error.message :
  typeof body.message === 'string' ? body.message : fallback;

export default function PublicRegistrationGroupForm({ slug, initialOrderId }: { slug: string; initialOrderId?: string }) {
  const [options, setOptions] = useState<Options | null>(null);
  const [entries, setEntries] = useState<Entry[]>([emptyEntry(), emptyEntry()]);
  const [payerMode, setPayerMode] = useState<'PARTICIPANT' | 'OTHER_PERSON' | 'COMPANY'>('PARTICIPANT');
  const [payerDetails, setPayerDetails] = useState<Party>(emptyParty);
  const [recipientMode, setRecipientMode] = useState<'PAYER' | 'OTHER_PERSON' | 'COMPANY'>('PAYER');
  const [recipientDetails, setRecipientDetails] = useState<Party>(emptyParty);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [orderLoading, setOrderLoading] = useState(Boolean(initialOrderId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const keyRef = useRef<string | null>(null);
  const base = '/api/public/events/' + encodeURIComponent(slug) + '/registration/orders';
  const returnHref = '/evento/' + encodeURIComponent(slug) + '/inscricao';
  const storageKey = (id: string) => 'evolvia_group_order_' + slug + '_' + id;

  useEffect(() => {
    let active = true;
    fetch('/api/public/events/' + encodeURIComponent(slug) + '/registration', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(safeError(payload, 'Não foi possível carregar as inscrições.'));
        return payload as Options;
      })
      .then((payload) => { if (active) setOptions(payload); })
      .catch((caught: Error) => { if (active) setError(caught.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (!initialOrderId) return;
    const key = sessionStorage.getItem(storageKey(initialOrderId));
    if (!key) {
      setError('Para consultar esta compra, volte ao navegador e à aba usados na reserva. A chave privada não é enviada na URL.');
      setOrderLoading(false);
      return;
    }
    keyRef.current = key;
    let active = true;
    fetch(base + '/' + encodeURIComponent(initialOrderId), { headers: { 'idempotency-key': key }, cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(safeError(payload, 'Não foi possível consultar o pedido.'));
        return payload as Order;
      })
      .then((payload) => { if (active) { setOrder(payload); setError(''); } })
      .catch((caught: Error) => { if (active) setError(caught.message); })
      .finally(() => { if (active) setOrderLoading(false); });
    return () => { active = false; };
  }, [base, initialOrderId, slug]);

  function changeEntry(index: number, patch: Partial<Entry>) {
    setEntries((current) => current.map((entry, i) => i === index ? { ...entry, ...patch } : entry));
    setPreview(null);
    keyRef.current = null;
  }
  function changeAnswer(index: number, code: string, value: Answer) {
    setEntries((current) => current.map((entry, i) => i === index
      ? { ...entry, answers: { ...entry.answers, [code]: value } } : entry));
    setPreview(null);
    keyRef.current = null;
  }
  function changeBilling() {
    setPreview(null);
    keyRef.current = null;
  }
  function billing() {
    const first = entries[0]?.answers;
    const participant: Party = {
      kind: 'PERSON', name: String(first?.full_name ?? ''),
      document: String(first?.identity_document ?? ''), email: String(first?.email ?? ''),
    };
    const payer: Party = payerMode === 'PARTICIPANT' ? participant
      : { ...payerDetails, kind: payerMode === 'COMPANY' ? 'COMPANY' : 'PERSON' };
    const recipient: Party = recipientMode === 'PAYER' ? payer
      : { ...recipientDetails, kind: recipientMode === 'COMPANY' ? 'COMPANY' : 'PERSON' };
    return { payer, recipient };
  }
  function requestBody() {
    if (!options?.terms) throw new Error('Os termos precisam estar publicados para reservar.');
    if (entries.length < 2 || entries.length > 10) throw new Error('Informe de 2 a 10 participantes.');
    if (entries.some((entry) => !entry.categoryId || !entry.lotId || entry.answers.terms_acceptance !== true)) {
      throw new Error('Selecione categoria, lote e aceite os termos em cada ficha.');
    }
    const selected = entries.map((entry) => {
      const category = options.categories.find((item) => item.id === entry.categoryId);
      const lot = category?.lots.find((item) => item.id === entry.lotId);
      if (!lot || lot.remaining === 0 || category?.proofRequirement === 'REQUIRED_BEFORE_PAYMENT' || lot.priceCents <= 0) {
        throw new Error('A compra agrupada exige lotes pagos disponíveis, sem comprovante prévio.');
      }
      const allowed = new Set(options.fields.filter((field) =>
        !field.appliesToCategoryIds?.length || field.appliesToCategoryIds.includes(entry.categoryId),
      ).map((field) => field.code));
      return {
        categoryId: entry.categoryId, lotId: entry.lotId,
        answers: {
          ...Object.fromEntries(Object.entries(entry.answers).filter(([code]) => allowed.has(code))),
          terms_acceptance: true, registration_type: entry.categoryId,
        },
      };
    });
    const identities = entries.map((entry) => String(entry.answers.identity_document ?? '').replace(/[^a-z0-9]/giu, '').toUpperCase());
    if (new Set(identities).size !== identities.length) throw new Error('Cada participante precisa ter documento diferente.');
    return { entries: selected, billing: billing() };
  }
  async function post(path: string, body: unknown, key?: string) {
    const response = await fetch(path, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(safeError(payload, 'Não foi possível concluir a operação.'));
    return payload;
  }
  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setPreview(null);
    try { setPreview(await post(base + '/preview', requestBody()) as Preview); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Falha ao calcular a compra.'); }
    finally { setBusy(false); }
  }
  async function reserve() {
    if (!preview || busy) return;
    setBusy(true); setError('');
    try {
      const key = keyRef.current ?? crypto.randomUUID();
      keyRef.current = key;
      const created = await post(base, requestBody(), key) as Order;
      sessionStorage.setItem(storageKey(created.orderId), key);
      setOrder(created);
      setPreview(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível reservar.'); }
    finally { setBusy(false); }
  }
  async function refresh() {
    if (!order || !keyRef.current || busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(base + '/' + encodeURIComponent(order.orderId), {
        headers: { 'idempotency-key': keyRef.current }, cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(safeError(payload, 'Não foi possível atualizar o pedido.'));
      setOrder(payload as Order);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Falha na consulta.'); }
    finally { setBusy(false); }
  }
  async function pay() {
    if (!order || !keyRef.current || busy || order.status !== 'PENDING_PAYMENT') return;
    setBusy(true); setError('');
    try {
      const checkout = await post(base + '/' + encodeURIComponent(order.orderId) + '/checkout', {}, keyRef.current) as { checkoutUrl?: string | null };
      if (!checkout.checkoutUrl) throw new Error('Pagamento ainda não disponível. Atualize o estado do pedido.');
      const url = new URL(checkout.checkoutUrl);
      const trusted = url.protocol === 'https:' && ['asaas.com', 'www.asaas.com', 'sandbox.asaas.com'].includes(url.hostname);
      const local = ['localhost', '127.0.0.1'].includes(window.location.hostname)
        && ['localhost', '127.0.0.1'].includes(url.hostname);
      if (!trusted && !local) throw new Error('Endereço de pagamento não reconhecido.');
      window.location.assign(url.toString());
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível abrir o pagamento.'); }
    finally { setBusy(false); }
  }

  if (loading || orderLoading) return <main className={styles.page}><p role="status">Carregando compra múltipla…</p></main>;
  if (initialOrderId && !order) return <main className={styles.page}>
    <section className={styles.notice} role="alert">
      <h1>Não foi possível recuperar este pedido</h1>
      <p>{error || 'Confira o navegador e a aba utilizados para reservar.'}</p>
      <p>Não faça uma segunda compra antes de confirmar o estado da primeira com a organização.</p>
      <Link href={returnHref}>Voltar às inscrições</Link>
    </section>
  </main>;
  if (!options || options.event.registrationMode !== 'PAID') return <main className={styles.page}>
    <div className={styles.notice} role="alert"><h1>Compra múltipla indisponível</h1>
      <p>{error || 'Esta modalidade está disponível apenas para eventos com inscrição paga.'}</p>
      <Link href={returnHref}>Voltar à inscrição individual</Link>
    </div>
  </main>;

  if (order) return <main className={styles.page}>
    <section className={styles.success} aria-labelledby="group-order-title">
      <p className={styles.eyebrow}>COMPRA MÚLTIPLA</p>
      <h1 id="group-order-title">Pedido de {order.entries.length} participantes</h1>
      <p role="status">Situação: <strong>{order.status === 'CONFIRMED' ? 'Inscrições confirmadas' : order.status === 'PENDING_PAYMENT' ? 'Aguardando pagamento' : order.status}</strong></p>
      <p>Valor das inscrições: {money.format(order.subtotalCents / 100)}</p>
      {order.expiresAt && <p>Reserva válida até {new Date(order.expiresAt).toLocaleString('pt-BR')}</p>}
      <ol>{order.entries.map((entry) => <li key={entry.position}>
        Participante {entry.position + 1}: protocolo {entry.protocol ?? 'em processamento'} · {entry.status ?? 'pendente'}
      </li>)}</ol>
      {order.status === 'PENDING_PAYMENT' && (!order.checkout || order.checkout.status === 'ACTIVE') &&
        <button type="button" className={styles.paymentButton} disabled={busy || !options.paymentEnabled} onClick={() => void pay()}>
          {busy ? 'Aguarde…' : 'Ir para o pagamento único seguro'}
        </button>}
      {order.checkout && ['CREATING', 'UNKNOWN', 'PAID_REVIEW'].includes(order.checkout.status) &&
        <p role="status">Pagamento em processamento ou conciliação. Não crie outro pedido nem tente nova cobrança.</p>}
      {order.status === 'PENDING_PAYMENT' && !options.paymentEnabled &&
        <p>Pagamento indisponível neste evento. A reserva expira no horário informado.</p>}
      <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void refresh()}>Atualizar confirmação</button>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <p>Somente o servidor confirma o pagamento. Guarde os protocolos; os dados pessoais não são exibidos aqui.</p>
      <Link href={returnHref}>Voltar às inscrições</Link>
    </section>
  </main>;

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href={returnHref}>← Inscrição individual</Link>
      <p className={styles.eyebrow}>COMPRA MÚLTIPLA</p>
      <h1>{options.event.name}</h1>
      <p>Inscreva de 2 a 10 pessoas com fichas e documentos individuais, em um único pedido e pagamento.</p>
      <p>Vagas e valores só ficam reservados após confirmação do servidor.</p>
    </header>
    <form className={styles.form} onSubmit={(event) => void calculate(event)}>
      <div className={styles.steps}>
        {entries.map((entry, index) => {
          const category = options.categories.find((item) => item.id === entry.categoryId);
          const fields = options.fields.filter((field) =>
            field.code !== 'terms_acceptance' && field.code !== 'registration_type' && field.type !== 'PHOTO'
            && (!field.appliesToCategoryIds?.length || field.appliesToCategoryIds.includes(entry.categoryId)));
          return <fieldset key={index}>
            <legend>Participante {index + 1}</legend>
            <div className={styles.grid}>
              <label>Categoria
                <select required value={entry.categoryId} onChange={(event) => changeEntry(index, { categoryId: event.target.value, lotId: '', answers: { terms_acceptance: false } })}>
                  <option value="">Selecione</option>
                  {options.categories.filter((item) => item.proofRequirement !== 'REQUIRED_BEFORE_PAYMENT'
                    && item.lots.some((lot) => lot.priceCents > 0 && lot.remaining !== 0)).map((item) =>
                    <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label>Lote
                <select required value={entry.lotId} onChange={(event) => changeEntry(index, { lotId: event.target.value })}>
                  <option value="">Selecione</option>
                  {category?.lots.filter((lot) => lot.priceCents > 0 && lot.remaining !== 0).map((lot) =>
                    <option key={lot.id} value={lot.id}>{lot.name} · {money.format(lot.priceCents / 100)}</option>)}
                </select>
              </label>
              {fields.map((field) => {
                const value = entry.answers[field.code];
                if (field.type === 'CONSENT') return <label className={styles.check} key={field.code}>
                  <input type="checkbox" required={field.required} checked={value === true} onChange={(event) => changeAnswer(index, field.code, event.target.checked)} /> {field.label}
                </label>;
                if (field.type === 'CHECKBOX' && field.options) return <fieldset key={field.code} className={styles.options}>
                  <legend>{field.label}</legend>
                  {field.options.map((option) => <label className={styles.check} key={option.id}>
                    <input type="checkbox" checked={Array.isArray(value) && value.includes(option.id)}
                      onChange={(event) => changeAnswer(index, field.code, event.target.checked
                        ? [...(Array.isArray(value) ? value : []), option.id]
                        : (Array.isArray(value) ? value : []).filter((item) => item !== option.id))} /> {option.label}
                  </label>)}
                </fieldset>;
                if (field.type === 'TEXTAREA') return <label key={field.code}>{field.label}
                  <textarea required={field.required} maxLength={2000} value={String(value ?? '')}
                    onChange={(event) => changeAnswer(index, field.code, event.target.value)} />
                </label>;
                if ((field.type === 'SELECT' || field.type === 'RADIO') && field.options) return <label key={field.code}>{field.label}
                  <select required={field.required} value={String(value ?? '')} onChange={(event) => changeAnswer(index, field.code, event.target.value)}>
                    <option value="">Selecione</option>
                    {field.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </label>;
                const type = field.type === 'EMAIL' ? 'email' : field.type === 'PHONE' ? 'tel' :
                  field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text';
                return <label key={field.code}>{field.label}
                  <input required={field.required} type={type} maxLength={type === 'text' ? 180 : undefined}
                    value={String(value ?? '')} onChange={(event) => changeAnswer(index, field.code,
                      type === 'number' && event.target.value ? Number(event.target.value) : event.target.value)} />
                  {field.help && <small>{field.help}</small>}
                </label>;
              })}
              <label className={styles.check}>
                <input type="checkbox" required disabled={!options.terms} checked={entry.answers.terms_acceptance === true}
                  onChange={(event) => changeAnswer(index, 'terms_acceptance', event.target.checked)} />
                Aceito os termos e a Política de Privacidade para este participante.
              </label>
            </div>
          </fieldset>;
        })}
        <div>
          <button type="button" className={styles.secondaryButton} disabled={entries.length >= 10}
            onClick={() => { setEntries((current) => [...current, emptyEntry()]); setPreview(null); keyRef.current = null; }}>Adicionar participante</button>
          <button type="button" className={styles.secondaryButton} disabled={entries.length <= 2}
            onClick={() => { setEntries((current) => current.slice(0, -1)); setPreview(null); keyRef.current = null; }}>Remover último</button>
        </div>
        <fieldset>
          <legend>Pagador e tomador do documento fiscal</legend>
          <label>Quem pagará o pedido?
            <select value={payerMode} onChange={(event) => { setPayerMode(event.target.value as typeof payerMode); changeBilling(); }}>
              <option value="PARTICIPANT">Primeiro participante</option>
              <option value="OTHER_PERSON">Outra pessoa física</option>
              <option value="COMPANY">Empresa</option>
            </select>
          </label>
          {payerMode !== 'PARTICIPANT' && <div className={styles.grid}>
            <label>Nome ou razão social<input required value={payerDetails.name} onChange={(event) => { setPayerDetails({ ...payerDetails, name: event.target.value }); changeBilling(); }} /></label>
            <label>CPF, documento ou CNPJ<input required value={payerDetails.document} onChange={(event) => { setPayerDetails({ ...payerDetails, document: event.target.value }); changeBilling(); }} /></label>
            <label>E-mail<input required type="email" value={payerDetails.email} onChange={(event) => { setPayerDetails({ ...payerDetails, email: event.target.value }); changeBilling(); }} /></label>
          </div>}
          <label>Tomador do documento fiscal
            <select value={recipientMode} onChange={(event) => { setRecipientMode(event.target.value as typeof recipientMode); changeBilling(); }}>
              <option value="PAYER">Mesmo pagador</option>
              <option value="OTHER_PERSON">Outra pessoa física</option>
              <option value="COMPANY">Empresa</option>
            </select>
          </label>
          {recipientMode !== 'PAYER' && <div className={styles.grid}>
            <label>Nome ou razão social<input required value={recipientDetails.name} onChange={(event) => { setRecipientDetails({ ...recipientDetails, name: event.target.value }); changeBilling(); }} /></label>
            <label>CPF, documento ou CNPJ<input required value={recipientDetails.document} onChange={(event) => { setRecipientDetails({ ...recipientDetails, document: event.target.value }); changeBilling(); }} /></label>
            <label>E-mail<input required type="email" value={recipientDetails.email} onChange={(event) => { setRecipientDetails({ ...recipientDetails, email: event.target.value }); changeBilling(); }} /></label>
          </div>}
          <p>A indicação do tomador não equivale à emissão de nota fiscal.</p>
        </fieldset>
      </div>
      <aside className={styles.summary}>
        <h2>Resumo da compra</h2>
        <p>{entries.length} participantes · 1 pedido</p>
        {options.terms
          ? <a href={options.terms.url} target="_blank" rel="noopener noreferrer">Abrir {options.terms.fileName}</a>
          : <p role="alert">Termos não publicados. Não é possível reservar.</p>}
        {preview ? <>
          <p role="status">Prévia: {money.format(preview.subtotalCents / 100)} · vagas ainda não reservadas</p>
          <button type="button" disabled={busy || !options.paymentEnabled} onClick={() => void reserve()}>
            {busy ? 'Reservando…' : 'Confirmar reserva de todas as entradas'}
          </button>
        </> : <button type="submit" disabled={busy || !options.terms || !options.paymentEnabled}>
          {busy ? 'Calculando…' : 'Calcular valor do pedido'}
        </button>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <p className={styles.privacy}>O valor final e a disponibilidade são revalidados pelo servidor. O pagamento só será confirmado por webhook autenticado.</p>
      </aside>
    </form>
  </main>;
}
