'use client';

import { FormEvent, useMemo, useState } from 'react';
import { ApiError, api } from '../lib/api';
import styles from './registration-coupon-batch.module.css';

type Batch = { quantity: number; discountPercent: number; maxUses: number; validUntil: string; codes: string[] };

function defaultUntil(): string {
  const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function RegistrationCouponBatch({ eventId }: { eventId: string }) {
  const initialUntil = useMemo(defaultUntil, []);
  const [sponsor, setSponsor] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [discountPercent, setDiscountPercent] = useState('20');
  const [maxUses, setMaxUses] = useState('1');
  const [validUntil, setValidUntil] = useState(initialUntil);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [batch, setBatch] = useState<Batch | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const until = new Date(validUntil);
    if (Number.isNaN(until.getTime())) {
      setError('Informe até quando os cupons valem.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const created = await api<Batch>(`/events/${encodeURIComponent(eventId)}/registration-coupon-batches`, {
        method: 'POST',
        body: JSON.stringify({
          sponsor: sponsor.trim(),
          quantity: Number(quantity),
          discountPercent: Number(discountPercent),
          maxUses: Number(maxUses),
          validUntil: until.toISOString(),
        }),
      });
      setBatch(created);
      setNotice(`${created.quantity} cupons foram gerados. Copie os códigos agora; eles também entram na lista ao recarregar a página.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível gerar os cupons.');
    } finally {
      setSaving(false);
    }
  }

  async function copyCodes() {
    if (!batch) return;
    try {
      await navigator.clipboard.writeText(batch.codes.join('\n'));
      setNotice('Códigos copiados.');
    } catch {
      setError('Não foi possível copiar. Selecione a lista e copie manualmente.');
    }
  }

  return <section className={styles.panel} aria-labelledby="coupon-batch-title">
    <p className={styles.eyebrow}>PATROCINADOR</p>
    <h2 id="coupon-batch-title">Gerar cupons em quantidade</h2>
    <p>Cada código sai único, com o mesmo desconto e a mesma validade. Vale só em evento de inscrição paga. A atividade vendida à parte não entra neste lote.</p>
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.wide}>Patrocinador
        <input value={sponsor} minLength={2} maxLength={60} required autoComplete="organization" onChange={(event) => setSponsor(event.target.value)} />
      </label>
      <label>Quantidade
        <input value={quantity} inputMode="numeric" min={2} max={40} required onChange={(event) => setQuantity(event.target.value)} />
      </label>
      <label>Desconto (%)
        <input value={discountPercent} inputMode="numeric" min={1} max={100} required onChange={(event) => setDiscountPercent(event.target.value)} />
      </label>
      <label>Usos de cada código
        <input value={maxUses} inputMode="numeric" min={1} max={20} required onChange={(event) => setMaxUses(event.target.value)} />
      </label>
      <label>Válidos até
        <input type="datetime-local" value={validUntil} required onChange={(event) => setValidUntil(event.target.value)} />
      </label>
      <button className={`${styles.primary} ${styles.wide}`} type="submit" disabled={saving}>{saving ? 'Gerando…' : 'Gerar cupons'}</button>
    </form>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {batch && <>
      <button className={styles.secondary} type="button" onClick={copyCodes}>Copiar códigos</button>
      <ol className={styles.codes} aria-label="Códigos gerados">
        {batch.codes.map((code) => <li key={code}>{code}</li>)}
      </ol>
    </>}
  </section>;
}
