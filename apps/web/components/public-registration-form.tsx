'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import styles from './public-registration-form.module.css';

type Field = { code: string; label: string; type: string; required: boolean; help?: string; options?: Array<{ id: string; label: string }> };
type Lot = { id: string; name: string; priceCents: number; remaining: number | null; endsAt: string };
type Category = { id: string; name: string; description: string | null; proofRequirement: string; lots: Lot[] };
type Options = {
  event: { name: string; slug: string; registrationMode: 'FREE' | 'PAID' | 'INVITATION' };
  categories: Category[];
  fields: Field[];
  currency: 'BRL';
  reservationMinutes: number;
};
type Result = {
  protocol: string;
  status: 'PENDING_PAYMENT' | 'CONFIRMED';
  basePriceCents: number;
  discountPercent: number;
  finalPriceCents: number;
  expiresAt: string | null;
  nextStep: string;
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function initialAnswers(fields: Field[]): Record<string, string | boolean | string[]> {
  return Object.fromEntries(fields.map((field) => [field.code, field.type === 'CONSENT' ? false : field.type === 'CHECKBOX' ? [] : '']));
}

export default function PublicRegistrationForm({ slug }: { slug: string }) {
  const [options, setOptions] = useState<Options | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [lotId, setLotId] = useState('');
  const [benefitCode, setBenefitCode] = useState('');
  const [answers, setAnswers] = useState<Record<string, string | boolean | string[]>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
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
  }, [slug]);

  const category = useMemo(() => options?.categories.find((item) => item.id === categoryId), [options, categoryId]);
  const lot = useMemo(() => category?.lots.find((item) => item.id === lotId), [category, lotId]);

  function setAnswer(code: string, value: string | boolean | string[]) {
    setAnswers((current) => ({ ...current, [code]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryId || !lotId) { setError('Selecione uma categoria e um lote.'); return; }
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
          answers: { ...answers, registration_type: categoryId },
        }),
      });
      const payload = await response.json() as Result & { message?: string };
      if (!response.ok) throw new Error(payload.message ?? 'Não foi possível concluir a reserva.');
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível concluir a reserva.');
    } finally {
      setSending(false);
    }
  }

  if (loading) return <main className={styles.page}><p role="status">Carregando inscrição…</p></main>;
  if (error && !options) return <main className={styles.page}><div className={styles.notice} role="alert"><h1>Inscrição indisponível</h1><p>{error}</p><Link href={`/evento/${slug}`}>Voltar ao evento</Link></div></main>;
  if (!options) return null;

  if (result) return <main className={styles.page}>
    <section className={styles.success} aria-labelledby="success-title">
      <p className={styles.eyebrow}>RESERVA CONCLUÍDA</p>
      <h1 id="success-title">{result.status === 'CONFIRMED' ? 'Inscrição confirmada' : 'Vaga reservada'}</h1>
      <p>Protocolo</p><strong className={styles.protocol}>{result.protocol}</strong>
      <dl>
        <div><dt>Valor final</dt><dd>{money.format(result.finalPriceCents / 100)}</dd></div>
        {result.discountPercent > 0 && <div><dt>Desconto aplicado</dt><dd>{result.discountPercent}%</dd></div>}
        {result.expiresAt && <div><dt>Reserva válida até</dt><dd>{new Date(result.expiresAt).toLocaleString('pt-BR')}</dd></div>}
      </dl>
      <p>{result.nextStep}</p>
      <p>Guarde este protocolo. Por segurança, seus dados pessoais não são exibidos nesta página.</p>
      <Link href={`/evento/${slug}`}>Voltar ao evento</Link>
    </section>
  </main>;

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href={`/evento/${slug}`}>← Voltar ao evento</Link>
      <p className={styles.eyebrow}>INSCRIÇÃO</p>
      <h1>{options.event.name}</h1>
      <p>Escolha sua categoria, preencha a ficha e confira o valor antes de reservar.</p>
    </header>

    <form className={styles.form} onSubmit={submit}>
      <fieldset>
        <legend>1. Categoria e lote</legend>
        <label>Categoria
          <select required value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setLotId(''); }}>
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
          {options.fields.filter((field) => field.code !== 'registration_type' && field.type !== 'PHOTO').map((field) => {
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
              <input type={type} required={field.required} maxLength={type === 'text' || type === 'email' || type === 'tel' ? 254 : undefined} value={String(value ?? '')} onChange={(event) => setAnswer(field.code, type === 'number' ? event.target.value : event.target.value)} />
              {field.help && <small>{field.help}</small>}
            </label>;
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend>3. Benefício e confirmação</legend>
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
