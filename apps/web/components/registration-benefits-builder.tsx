'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './registration-benefits-builder.module.css';

type RegistrationMode = 'FREE' | 'PAID' | 'INVITATION';
type BenefitKind = 'COUPON' | 'INVITATION' | 'COURTESY';
type Benefit = {
  id?: string;
  code: string;
  name: string;
  kind: BenefitKind;
  discountPercent: number;
  maxUses: number;
  usedCount: number;
  validFrom: string;
  validUntil: string;
  active: boolean;
  sortOrder: number;
};
type BenefitUsage = {
  id: string;
  code: string;
  name: string;
  usedCount: number;
  remaining: number;
  uses: Array<{ protocol: string; status: string; category: string; createdAt: string }>;
};
type Payload = {
  event: { id: string; name: string; status: string; registrationMode: RegistrationMode };
  revision: number;
  benefits: Benefit[];
  publicRedemptionEnabled: false;
  message: string;
};

const kindLabels: Record<BenefitKind, string> = {
  COUPON: 'Cupom',
  INVITATION: 'Convite',
  COURTESY: 'Cortesia',
};

const kindDescriptions: Record<BenefitKind, string> = {
  COUPON: 'Aplica desconto percentual em uma futura reserva paga.',
  INVITATION: 'Autoriza o acesso por código, sem desconto automático.',
  COURTESY: 'Concede 100% de desconto e mantém rastreabilidade própria.',
};

function reservationStatusLabel(status: string): string {
  if (status === 'CONFIRMED') return 'Confirmada';
  if (status === 'PENDING_PAYMENT') return 'Aguardando pagamento';
  if (status === 'EXPIRED') return 'Expirada';
  if (status === 'CANCELLED') return 'Cancelada';
  return 'Em verificação';
}

function localDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function hydrateBenefits(benefits: Benefit[]) {
  return benefits.map((benefit) => ({
    ...benefit,
    validFrom: localDateTime(benefit.validFrom),
    validUntil: localDateTime(benefit.validUntil),
  }));
}

function nextCode(kind: BenefitKind, benefits: Benefit[]) {
  const prefix = kind === 'COUPON' ? 'CUPOM' : kind === 'INVITATION' ? 'CONVITE' : 'CORTESIA';
  let index = benefits.length + 1;
  while (benefits.some((benefit) => benefit.code === `${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function newBenefit(kind: BenefitKind, benefits: Benefit[]): Benefit {
  const validFrom = new Date();
  validFrom.setMinutes(validFrom.getMinutes() - validFrom.getMinutes() % 15, 0, 0);
  const validUntil = new Date(validFrom);
  validUntil.setDate(validUntil.getDate() + 30);
  const code = nextCode(kind, benefits);
  return {
    code,
    name: kind === 'COUPON' ? 'Cupom promocional' : kind === 'INVITATION' ? 'Convite' : 'Cortesia',
    kind,
    discountPercent: kind === 'COURTESY' ? 100 : kind === 'COUPON' ? 10 : 0,
    maxUses: 1,
    usedCount: 0,
    validFrom: localDateTime(validFrom.toISOString()),
    validUntil: localDateTime(validUntil.toISOString()),
    active: true,
    sortOrder: benefits.length,
  };
}

function isoDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export default function RegistrationBenefitsBuilder({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uses, setUses] = useState<BenefitUsage[]>([]);

  function acceptPayload(result: Payload) {
    setPayload(result);
    setBenefits(hydrateBenefits(result.benefits));
  }

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    let active = true;
    Promise.all([
      api<Payload>(`/events/${eventId}/registration-benefits`),
      api<{ benefits: BenefitUsage[] }>(`/events/${eventId}/registration-benefits/uses`).catch(() => ({ benefits: [] as BenefitUsage[] })),
    ])
      .then(([result, usage]) => {
        if (!active) return;
        acceptPayload(result);
        setUses(usage.benefits);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os benefícios.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // acceptPayload pertence ao ciclo de vida desta tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, router]);

  const dirty = useMemo(() => payload
    ? JSON.stringify(benefits) !== JSON.stringify(hydrateBenefits(payload.benefits))
    : false, [benefits, payload]);
  const counts = useMemo(() => ({
    coupons: benefits.filter((benefit) => benefit.kind === 'COUPON').length,
    invitations: benefits.filter((benefit) => benefit.kind === 'INVITATION').length,
    courtesies: benefits.filter((benefit) => benefit.kind === 'COURTESY').length,
  }), [benefits]);

  function updateBenefit(index: number, patch: Partial<Benefit>) {
    setBenefits((current) => current.map((benefit, currentIndex) => currentIndex === index ? { ...benefit, ...patch } : benefit));
  }

  async function save() {
    if (!payload) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const normalized = benefits.map((benefit, index) => ({
        code: benefit.code.trim().toUpperCase(),
        name: benefit.name,
        kind: benefit.kind,
        discountPercent: benefit.kind === 'COURTESY' ? 100 : benefit.kind === 'INVITATION' ? 0 : benefit.discountPercent,
        maxUses: benefit.maxUses,
        validFrom: isoDateTime(benefit.validFrom),
        validUntil: isoDateTime(benefit.validUntil),
        active: benefit.active,
        sortOrder: index,
      }));
      const result = await api<Payload>(`/events/${eventId}/registration-benefits`, {
        method: 'PUT',
        body: JSON.stringify({ expectedRevision: payload.revision, benefits: normalized }),
      });
      acceptPayload(result);
      setNotice('Cupons, convites e cortesias salvos. O resgate público continua bloqueado.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar os benefícios.');
    } finally { setSaving(false); }
  }

  if (loading) return <main className={styles.page} aria-busy="true"><div className={styles.loading}>A EVA está preparando os benefícios comerciais...</div></main>;
  if (!payload) return <main className={styles.page}><div className={styles.error} role="alert">{error || 'Benefícios indisponíveis.'}</div></main>;

  const paid = payload.event.registrationMode === 'PAID';
  const add = (kind: BenefitKind) => setBenefits((current) => [...current, newBenefit(kind, current)]);

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/painel">EVOLVIA</Link>
      <Link href={`/eventos/${eventId}/painel`}>Voltar ao menu do evento</Link>
    </header>

    <div className={styles.workspace}>
      <section className={styles.hero} aria-labelledby="benefits-title">
        <div><p className={styles.eyebrow}>FASE 2 · BENEFÍCIOS COMERCIAIS</p><h1 id="benefits-title">Cupons, convites e cortesias</h1><p>Prepare códigos com regras claras, validade e limite de usos para {payload.event.name}.</p></div>
        <div className={styles.summary}><span>Revisão {payload.revision || 'nova'}</span><strong>{benefits.length} códigos</strong><small>{counts.coupons} cupons · {counts.invitations} convites · {counts.courtesies} cortesias</small></div>
      </section>

      <section className={styles.eva} aria-labelledby="eva-benefits-title"><span aria-hidden="true">EVA</span><div><h2 id="eva-benefits-title">Controle antes da liberação</h2><p>{payload.message}</p></div></section>
      <p className={styles.safety}><strong>Importante:</strong> salvar códigos não abre inscrições, não cria reservas e não realiza cobranças.</p>
      {!paid && <p className={styles.modeNote}>Este evento não possui inscrição paga. Convites estão disponíveis; cupons e cortesias serão habilitados se o modo do evento passar a pago.</p>}
      {error && <div className={styles.error} role="alert">{error}</div>}
      {notice && <div className={styles.notice} role="status">{notice}</div>}

      <form className={styles.builder} aria-labelledby="benefit-list-title" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>CÓDIGOS CONFIGURADOS</p><h2 id="benefit-list-title">Benefícios do evento</h2></div><button className={styles.primary} type="submit" disabled={!dirty || saving}>{saving ? 'Salvando…' : 'Salvar benefícios'}</button></div>

        <div className={styles.actions} aria-label="Adicionar benefício">
          <button type="button" disabled={!paid} onClick={() => add('COUPON')}><strong>+ Cupom</strong><span>Desconto de 1% a 100%</span></button>
          <button type="button" onClick={() => add('INVITATION')}><strong>+ Convite</strong><span>Acesso controlado por código</span></button>
          <button type="button" disabled={!paid} onClick={() => add('COURTESY')}><strong>+ Cortesia</strong><span>Isenção total e auditável</span></button>
        </div>

        {benefits.length === 0 && <div className={styles.empty}><h3>Nenhum código configurado</h3><p>Use uma das opções acima. Você pode começar por convites mesmo antes da reserva pública estar disponível.</p></div>}

        <div className={styles.cards}>
          {benefits.map((benefit, index) => <fieldset className={styles.card} key={benefit.id ?? `benefit-${index}`}>
            <legend>{kindLabels[benefit.kind]} {index + 1}</legend>
            <div className={styles.cardHeading}><div><strong>{kindLabels[benefit.kind]}</strong><p>{kindDescriptions[benefit.kind]}</p></div><label className={styles.toggle}><input type="checkbox" checked={benefit.active} onChange={(event) => updateBenefit(index, { active: event.target.checked })} /> Código ativo</label></div>
            <div className={styles.grid}>
              <label>Nome<input required minLength={2} maxLength={120} value={benefit.name} onChange={(event) => updateBenefit(index, { name: event.target.value })} /></label>
              <label>Código<input required disabled={Boolean(benefit.id)} minLength={3} maxLength={32} pattern="[A-Z0-9][A-Z0-9_-]+" value={benefit.code} onChange={(event) => updateBenefit(index, { code: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/gu, '') })} /><small>{benefit.id ? 'Preservado após o primeiro salvamento.' : 'Use letras, números, hífen ou sublinhado.'}</small></label>
              <label>Desconto (%)<input type="number" min={benefit.kind === 'COUPON' ? 1 : benefit.discountPercent} max="100" inputMode="numeric" disabled={benefit.kind !== 'COUPON'} value={benefit.discountPercent} onChange={(event) => updateBenefit(index, { discountPercent: Number(event.target.value) })} /><small>{benefit.kind === 'INVITATION' ? 'Convite não aplica desconto.' : benefit.kind === 'COURTESY' ? 'Cortesia concede 100%.' : 'Entre 1% e 100%.'}</small></label>
              <label>Limite de usos<input required type="number" min={Math.max(1, benefit.usedCount)} max="1000000" inputMode="numeric" value={benefit.maxUses} onChange={(event) => updateBenefit(index, { maxUses: Number(event.target.value) })} /><small>{benefit.usedCount} utilizados · {Math.max(0, benefit.maxUses - benefit.usedCount)} disponíveis</small></label>
              <label>Válido a partir de<input required type="datetime-local" value={benefit.validFrom} onChange={(event) => updateBenefit(index, { validFrom: event.target.value })} /></label>
              <label>Válido até<input required type="datetime-local" value={benefit.validUntil} onChange={(event) => updateBenefit(index, { validUntil: event.target.value })} /></label>
            </div>
            <button className={styles.danger} type="button" disabled={benefit.usedCount > 0} onClick={() => setBenefits((current) => current.filter((_, currentIndex) => currentIndex !== index))}>{benefit.usedCount > 0 ? 'Desative: código já utilizado' : 'Remover código'}</button>
          </fieldset>)}
        </div>
        <div className={styles.sectionHeading}>
          <p style={{ margin: 0 }}>Concluiu as alterações? Salve os benefícios antes de sair desta página.</p>
          <button className={styles.primary} type="submit" disabled={!dirty || saving}>
            {saving ? 'Salvando…' : 'Salvar benefícios'}
          </button>
        </div>
      </form>
      <section aria-labelledby="benefit-uses-title">
        <h2 id="benefit-uses-title">Utilizações recentes dos benefícios</h2>
        <p>Esta lista reúne os 100 usos mais recentes do evento. Os contadores de cada benefício incluem todos os usos; protocolos mais antigos podem não aparecer aqui.</p>
        {uses.length === 0 ? <p>Nenhum código salvo ainda.</p> : uses.map((benefit) => <article key={benefit.id}>
          <h3>{benefit.name} · {benefit.code}</h3>
          <p>{benefit.usedCount} utilizados · {benefit.remaining} disponíveis</p>
          {benefit.uses.length === 0 ? <p>Nenhuma utilização entre as 100 mais recentes do evento.</p> : <ul>
            {benefit.uses.map((item) => <li key={item.protocol}>{item.protocol} · {item.category} · {reservationStatusLabel(item.status)} · {new Date(item.createdAt).toLocaleString('pt-BR')}</li>)}
          </ul>}
        </article>)}
      </section>
    </div>
  </main>;
}
