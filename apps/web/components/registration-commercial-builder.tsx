'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './registration-commercial-builder.module.css';

type RegistrationMode = 'FREE' | 'PAID' | 'INVITATION';
type ProofRequirement = 'NONE' | 'OPTIONAL' | 'REQUIRED_BEFORE_PAYMENT';
type Lot = {
  id?: string;
  code: string;
  name: string;
  startsAt: string;
  endsAt: string;
  quantity: number | null;
  priceCents: number;
  priceInput?: string;
  active: boolean;
  sortOrder: number;
};
type Category = {
  id?: string;
  code: string;
  name: string;
  description: string | null;
  capacity: number | null;
  proofRequirement: ProofRequirement;
  active: boolean;
  sortOrder: number;
  lots: Lot[];
};
type Payload = {
  event: { id: string; name: string; status: string; registrationMode: RegistrationMode; endDate: string | null };
  revision: number;
  categories: Category[];
  currency: 'BRL';
  publicRegistrationEnabled: false;
  message: string;
};

const modeLabels: Record<RegistrationMode, string> = {
  FREE: 'Gratuita',
  PAID: 'Paga',
  INVITATION: 'Somente por convite',
};

function safeCode(value: string, fallback: string) {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/gu, '_').replace(/^_+|_+$/gu, '').slice(0, 60);
  const prefixed = /^[a-z]/u.test(normalized) ? normalized : `item_${normalized}`;
  return prefixed.length >= 2 ? prefixed : fallback;
}

function localDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function isoDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function hydrateCategories(categories: Category[]) {
  return categories.map((category) => ({
    ...category,
    description: category.description ?? '',
    lots: category.lots.map((lot) => ({
      ...lot,
      startsAt: localDateTime(lot.startsAt),
      endsAt: localDateTime(lot.endsAt),
      priceInput: (lot.priceCents / 100).toFixed(2).replace('.', ','),
    })),
  }));
}

function initialPeriod() {
  const startsAt = new Date();
  startsAt.setMinutes(startsAt.getMinutes() - startsAt.getMinutes() % 15, 0, 0);
  const endsAt = new Date(startsAt);
  endsAt.setDate(endsAt.getDate() + 7);
  return { startsAt: localDateTime(startsAt.toISOString()), endsAt: localDateTime(endsAt.toISOString()) };
}

function newLot(index: number): Lot {
  return {
    code: `lote_${index + 1}`,
    name: `Lote ${index + 1}`,
    ...initialPeriod(),
    quantity: null,
    priceCents: 0,
    priceInput: '0,00',
    active: true,
    sortOrder: index,
  };
}

function newCategory(index: number): Category {
  return {
    code: `categoria_${index + 1}`,
    name: `Categoria ${index + 1}`,
    description: '',
    capacity: null,
    proofRequirement: 'NONE',
    active: true,
    sortOrder: index,
    lots: [newLot(0)],
  };
}

function priceInCents(value: string) {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{0,2})?$/u.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents <= 1_000_000_000 ? cents : null;
}

export default function RegistrationCommercialBuilder({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function acceptPayload(result: Payload) {
    setPayload(result);
    setCategories(hydrateCategories(result.categories));
  }

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    let active = true;
    setLoading(true);
    api<Payload>(`/events/${eventId}/registration-commercial`)
      .then((result) => { if (active) acceptPayload(result); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar categorias e lotes.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // acceptPayload is intentionally local to this component lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, router]);

  const dirty = useMemo(() => payload
    ? JSON.stringify(categories) !== JSON.stringify(hydrateCategories(payload.categories))
    : false, [categories, payload]);
  const lotCount = categories.reduce((total, category) => total + category.lots.length, 0);

  function updateCategory(index: number, patch: Partial<Category>) {
    setCategories((current) => current.map((category, currentIndex) => currentIndex === index ? { ...category, ...patch } : category));
  }

  function updateLot(categoryIndex: number, lotIndex: number, patch: Partial<Lot>) {
    setCategories((current) => current.map((category, currentCategoryIndex) => currentCategoryIndex !== categoryIndex ? category : ({
      ...category,
      lots: category.lots.map((lot, currentLotIndex) => currentLotIndex === lotIndex ? { ...lot, ...patch } : lot),
    })));
  }

  async function save() {
    if (!payload || categories.length === 0) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const invalidPrice = registrationMode !== 'FREE' && categories.some((category) =>
        category.lots.some((lot) => priceInCents(lot.priceInput ?? '') === null));
      if (invalidPrice) {
        setError('Informe os preços em reais com no máximo duas casas decimais.');
        return;
      }
      const lotEndTimes = categories.flatMap((category) =>
        category.lots.map((lot) => Date.parse(isoDateTime(lot.endsAt))));
      if (lotEndTimes.some((time) => !Number.isFinite(time))) {
        setError('Informe uma data e hora válidas para encerrar cada lote.');
        return;
      }
      const eventEndDateMs = payload.event.endDate ? Date.parse(payload.event.endDate) : null;
      if (eventEndDateMs !== null && lotEndTimes.some((time) => time > eventEndDateMs)) {
        setError('O lote não pode encerrar depois da data final do evento.');
        return;
      }
      const normalized = categories.map((category, categoryIndex) => ({
        code: category.code,
        name: category.name,
        description: category.description?.trim() || null,
        capacity: category.capacity,
        active: category.active,
        sortOrder: categoryIndex,
        proofRequirement: payload.event.registrationMode === 'PAID' || category.proofRequirement !== 'REQUIRED_BEFORE_PAYMENT' ? category.proofRequirement : 'NONE',
        lots: category.lots.map((lot, lotIndex) => ({
          code: lot.code,
          name: lot.name,
          startsAt: isoDateTime(lot.startsAt),
          endsAt: isoDateTime(lot.endsAt),
          quantity: lot.quantity,
          priceCents: payload.event.registrationMode === 'FREE' ? 0 : priceInCents(lot.priceInput ?? '')!,
          active: lot.active,
          sortOrder: lotIndex,
        })),
      }));
      const result = await api<Payload>(`/events/${eventId}/registration-commercial`, {
        method: 'PUT',
        body: JSON.stringify({ expectedRevision: payload.revision, categories: normalized }),
      });
      acceptPayload(result);
      setNotice('Categorias e lotes salvos. As inscrições continuam fechadas.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar categorias e lotes.');
    } finally { setSaving(false); }
  }

  if (loading) return <main className={styles.page} aria-busy="true"><div className={styles.loading}>A EVA está organizando categorias e lotes...</div></main>;
  if (!payload) return <main className={styles.page}><div className={styles.error} role="alert">{error || 'Configuração comercial indisponível.'}</div></main>;

  const registrationMode = payload.event.registrationMode;
  const eventEndLocal = payload.event.endDate ? localDateTime(payload.event.endDate) : undefined;
  const canSave = dirty && !saving && categories.length > 0;
  function addCategory() {
    setCategories((current) => [...current, newCategory(current.length)]);
  }
  const saveButton = (
    <button className={styles.primary} type="button" disabled={!canSave} onClick={() => void save()}>
      {saving ? 'Salvando…' : 'Salvar configuração'}
    </button>
  );
  const addCategoryButton = (
    <button className={styles.secondary} type="button" onClick={addCategory}>Adicionar categoria</button>
  );
  return <main className={styles.page}>
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/painel">EVOLVIA</Link>
      <Link href={`/eventos/${eventId}/painel`}>Voltar ao menu do evento</Link>
    </header>

    <div className={styles.workspace}>
      <section className={styles.hero} aria-labelledby="commercial-title">
        <div>
          <p className={styles.eyebrow}>INSCRIÇÕES</p>
          <h1 id="commercial-title">Categorias e lotes</h1>
          <p>Defina quem pode se inscrever, os períodos e os limites de cada oferta.</p>
        </div>
        <div className={styles.summary}>
          <span>Inscrição {modeLabels[registrationMode].toLowerCase()}</span>
          <strong>{categories.length} categorias · {lotCount} lotes</strong>
          <small>Revisão {payload.revision || 'nova'}</small>
        </div>
      </section>

      <section className={styles.eva} aria-labelledby="eva-commercial-title">
        <span className={styles.evaMark} aria-hidden="true">EVA</span>
        <div><h2 id="eva-commercial-title">Organize primeiro; publique depois</h2><p>{payload.message}</p></div>
      </section>

      <p className={styles.safetyNote}><strong>Importante:</strong> salvar aqui não abre inscrições, não reserva vagas e não inicia cobranças.</p>
      {error && <div className={styles.error} role="alert">{error}</div>}
      {notice && <div className={styles.notice} role="status">{notice}</div>}

      <section className={styles.builder} aria-labelledby="categories-title">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>ESTRUTURA COMERCIAL</p><h2 id="categories-title">Categorias de inscrição</h2></div>
          {categories.length > 0 ? <div className={styles.headingActions}>{addCategoryButton}{saveButton}</div> : null}
        </div>

        {categories.length === 0 && <div className={styles.empty}>
          <h3>Comece pela primeira categoria</h3>
          <p>Exemplos: Participante, Estudante, Profissional ou Convidado.</p>
          <button className={styles.primary} type="button" onClick={() => setCategories([newCategory(0)])}>Criar primeira categoria</button>
        </div>}

        <div className={styles.categories}>
          {categories.map((category, categoryIndex) => <fieldset className={styles.category} key={category.id ?? `category-${categoryIndex}`}>
            <legend>Categoria {categoryIndex + 1}</legend>
            <div className={styles.categoryHeading}>
              <label className={styles.toggle}><input type="checkbox" checked={category.active} onChange={(event) => updateCategory(categoryIndex, { active: event.target.checked })} /> Categoria ativa</label>
              <button className={styles.danger} type="button" onClick={() => setCategories((current) => current.filter((_, index) => index !== categoryIndex))}>Remover categoria</button>
            </div>
            <div className={styles.grid}>
              <label>Nome<input required minLength={2} maxLength={120} value={category.name} onChange={(event) => {
                const name = event.target.value;
                updateCategory(categoryIndex, category.id ? { name } : { name, code: safeCode(name, category.code) });
              }} /></label>
              <label>Código interno<input required disabled={Boolean(category.id)} minLength={2} maxLength={60} pattern="[a-z][a-z0-9_]+" value={category.code} onChange={(event) => updateCategory(categoryIndex, { code: event.target.value.toLowerCase() })} /><small>{category.id ? 'Identificador preservado após o primeiro salvamento.' : 'Gerado pelo nome; pode ser ajustado antes de salvar.'}</small></label>
              <label className={styles.wide}>Descrição opcional<textarea maxLength={500} value={category.description ?? ''} onChange={(event) => updateCategory(categoryIndex, { description: event.target.value })} /></label>
              <label>Capacidade total<input type="number" min="1" max="10000000" inputMode="numeric" placeholder="Sem limite" value={category.capacity ?? ''} onChange={(event) => updateCategory(categoryIndex, { capacity: event.target.value ? Number(event.target.value) : null })} /></label>
              <label>Comprovante<select value={registrationMode === 'PAID' || category.proofRequirement !== 'REQUIRED_BEFORE_PAYMENT' ? category.proofRequirement : 'NONE'} onChange={(event) => updateCategory(categoryIndex, { proofRequirement: event.target.value as ProofRequirement })}><option value="NONE">Não solicitar</option><option value="OPTIONAL">Solicitar, envio opcional</option><option value="REQUIRED_BEFORE_PAYMENT" disabled={registrationMode !== 'PAID'}>Exigir aprovação antes do pagamento</option></select><small>{category.proofRequirement === 'REQUIRED_BEFORE_PAYMENT' && registrationMode === 'PAID' ? 'O pagamento só abre depois que a organização aprovar o PDF.' : category.proofRequirement === 'OPTIONAL' ? 'O participante pode enviar um PDF. A inscrição segue sem ele.' : 'A categoria não pede comprovante.'}</small></label>
            </div>

            <div className={styles.lotHeading}><h3>Lotes</h3></div>
            <div className={styles.lots}>
              {category.lots.map((lot, lotIndex) => <fieldset className={styles.lot} key={lot.id ?? `lot-${lotIndex}`}>
                <legend>Lote {lotIndex + 1}</legend>
                <div className={styles.lotTop}><label className={styles.toggle}><input type="checkbox" checked={lot.active} onChange={(event) => updateLot(categoryIndex, lotIndex, { active: event.target.checked })} /> Lote ativo</label><button className={styles.danger} type="button" disabled={category.lots.length === 1} onClick={() => updateCategory(categoryIndex, { lots: category.lots.filter((_, index) => index !== lotIndex) })}>Remover lote</button></div>
                <div className={styles.grid}>
                  <label>Nome<input required minLength={2} maxLength={120} value={lot.name} onChange={(event) => {
                    const name = event.target.value;
                    updateLot(categoryIndex, lotIndex, lot.id ? { name } : { name, code: safeCode(name, lot.code) });
                  }} /></label>
                  <label>Código interno<input required disabled={Boolean(lot.id)} minLength={2} maxLength={60} pattern="[a-z][a-z0-9_]+" value={lot.code} onChange={(event) => updateLot(categoryIndex, lotIndex, { code: event.target.value.toLowerCase() })} /><small>{lot.id ? 'Identificador preservado após o primeiro salvamento.' : 'Gerado pelo nome; pode ser ajustado antes de salvar.'}</small></label>
                  <label>Início<input required type="datetime-local" value={lot.startsAt} onChange={(event) => updateLot(categoryIndex, lotIndex, { startsAt: event.target.value })} /></label>
                  <label>Encerramento<input required type="datetime-local" max={eventEndLocal} value={lot.endsAt} onChange={(event) => updateLot(categoryIndex, lotIndex, { endsAt: event.target.value })} /><small>{eventEndLocal ? 'Não pode ultrapassar o fim do evento.' : 'Defina a data final do evento para validar este limite.'}</small></label>
                  <label>Quantidade<input type="number" min="1" max="10000000" inputMode="numeric" placeholder="Sem limite" value={lot.quantity ?? ''} onChange={(event) => updateLot(categoryIndex, lotIndex, { quantity: event.target.value ? Number(event.target.value) : null })} /></label>
                  <label>Preço em reais<input type="text" inputMode="decimal" disabled={registrationMode === 'FREE'} value={registrationMode === 'FREE' ? '0,00' : lot.priceInput ?? ''} onChange={(event) => updateLot(categoryIndex, lotIndex, { priceInput: event.target.value })} placeholder="0,00" /><small>{registrationMode === 'FREE' ? 'Evento gratuito: preço fixado em R$ 0,00.' : 'Use até duas casas decimais; o valor será armazenado em centavos.'}</small></label>
                </div>
              </fieldset>)}
            </div>
            <div className={styles.lotActions}>
              <button className={styles.secondary} type="button" onClick={() => updateCategory(categoryIndex, { lots: [...category.lots, newLot(category.lots.length)] })}>Adicionar lote</button>
            </div>
          </fieldset>)}
        </div>

        {categories.length > 0 ? <div className={styles.footerActions}>{addCategoryButton}{saveButton}</div> : null}
      </section>
    </div>
  </main>;
}

