'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';
import CheckInConsole from './check-in-console';
import CredentialLabel, { CredentialLabelData } from './credential-label';
import CredentialLabelSettings, { LabelSettings } from './credential-label-settings';
import styles from './event-desk.module.css';

type Capability = 'credential' | 'access_control' | 'material_delivery' | 'registration';
type Field = {
  code: string;
  label: string;
  type: string;
  required: boolean;
  options?: Array<{ id: string; label: string }>;
  appliesToCategoryIds?: string[];
};
type Answer = string | boolean | string[] | number;
type Lot = { id: string; name: string; priceCents: number };
type SelfServiceMethod = 'CPF' | 'EMAIL' | 'QR' | 'PROTOCOL';
type Context = {
  event: { id: string; name: string; slug: string; status: string; registrationMode: string };
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'OPERATOR';
  capabilities: Capability[];
  selfService: SelfServiceMethod[];
  label: LabelSettings;
  labelFields: Array<{ code: string; label: string }>;
  activities: Array<{ id: string; title: string; startAt: string }>;
  categories: Array<{ id: string; name: string; lots: Lot[] }>;
  fields: Field[];
};
type Person = {
  reservationId: string;
  protocol: string;
  name: string;
  category: string;
  status: string;
  checkedInAt: string | null;
  materialDeliveredAt: string | null;
};
type Badge = CredentialLabelData;
type DeskMode = 'search' | 'reader' | 'register' | 'settings';
type EditField = Field & { value: Answer | null };
type EditRecord = { revision: number; fields: EditField[]; locked: string[] };

const statusLabels: Record<string, string> = {
  CONFIRMED: 'Confirmada',
  PENDING_PAYMENT: 'Aguardando pagamento',
  EXPIRED: 'Expirada',
  CANCELLED: 'Cancelada',
};

function absoluteUrl(origin: string, path: string) {
  return origin ? `${origin}${path}` : path;
}

function CredentialLinks({
  origin, eventId, slug, totemReady, onOpenReader, onCopied,
}: {
  origin: string;
  eventId: string;
  slug: string;
  totemReady: boolean;
  onOpenReader: () => void;
  onCopied: (message: string) => void;
}) {
  const deskPath = `/eventos/${encodeURIComponent(eventId)}/painel/check-in`;
  const readerPath = `${deskPath}#leitor`;
  const totemPath = slug ? `/evento/${encodeURIComponent(slug)}/autoatendimento` : '';
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      onCopied('Endereço copiado.');
    } catch {
      onCopied('Selecione o endereço exibido e copie.');
    }
  }
  return <section className={styles.links} aria-labelledby="credential-links-title">
    <h3 id="credential-links-title">Links do credenciamento</h3>
    <p>A equipe usa estes endereços neste evento. A etiqueta continua saindo na busca, pessoa a pessoa.</p>
    <ul>
      <li>
        <strong>Posto da equipe</strong>
        <span>Quem opera a portaria entra com a conta da organização.</span>
        <input readOnly aria-label="Link do posto da equipe" value={absoluteUrl(origin, deskPath)} />
        <div>
          <button type="button" onClick={() => void copy(absoluteUrl(origin, deskPath))}>Copiar posto</button>
          <a href={deskPath}>Abrir posto</a>
        </div>
      </li>
      <li>
        <strong>Leitor de QR</strong>
        <span>A entrada lê o QR Code ou o código de barras da etiqueta.</span>
        <input readOnly aria-label="Link do leitor de QR" value={absoluteUrl(origin, readerPath)} />
        <div>
          <button type="button" onClick={() => void copy(absoluteUrl(origin, readerPath))}>Copiar leitor</button>
          <a href={readerPath} onClick={onOpenReader}>Abrir leitor</a>
        </div>
      </li>
      <li>
        <strong>Totem de autoatendimento</strong>
        {totemReady && totemPath ? <>
          <span>A pessoa encontra a própria inscrição e imprime a etiqueta.</span>
          <input readOnly aria-label="Link do totem de autoatendimento" value={absoluteUrl(origin, totemPath)} />
          <div>
            <button type="button" onClick={() => void copy(absoluteUrl(origin, totemPath))}>Copiar totem</button>
            <a href={totemPath} target="_blank" rel="noopener noreferrer">Abrir totem</a>
          </div>
        </> : <span>O totem aparece aqui quando o evento está publicado e ao menos uma busca do autoatendimento está ligada.</span>}
      </li>
    </ul>
  </section>;
}

function money(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function DeskField({ field, value, onChange }: { field: Field; value: Answer | undefined; onChange: (value: Answer) => void }) {
  if (field.type === 'CONSENT') {
    return <label>{field.label}
      <input type="checkbox" checked={value === true} required={field.required} onChange={(event) => onChange(event.target.checked)} />
    </label>;
  }
  if (field.type === 'TEXTAREA') {
    return <label>{field.label}
      <textarea required={field.required} maxLength={2000} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} />
    </label>;
  }
  if ((field.type === 'SELECT' || field.type === 'RADIO') && field.options) {
    return <label>{field.label}
      <select required={field.required} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)}>
        <option value="">Selecione</option>
        {field.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>;
  }
  if (field.type === 'CHECKBOX' && field.options) {
    const selected = Array.isArray(value) ? value : [];
    return <fieldset>
      <legend>{field.label}</legend>
      {field.options.map((option) => <label key={option.id}>
        <input type="checkbox" checked={selected.includes(option.id)} onChange={(event) => onChange(event.target.checked ? [...selected, option.id] : selected.filter((item) => item !== option.id))} />
        {option.label}
      </label>)}
    </fieldset>;
  }
  const type = field.type === 'EMAIL' ? 'email' : field.type === 'DATE' ? 'date' : field.type === 'NUMBER' ? 'number' : field.type === 'PHONE' ? 'tel' : 'text';
  return <label>{field.label}
    <input type={type} required={field.required} autoComplete="off" value={typeof value === 'string' || typeof value === 'number' ? value : ''} onChange={(event) => onChange(type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)} />
  </label>;
}

function deskIdempotencyKey(): string {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Este navegador não permite uma operação segura. Use um navegador atualizado.');
  }
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')).join('');
}

export default function EventDesk({ eventId }: { eventId: string }) {
  const [context, setContext] = useState<Context | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [kind, setKind] = useState<'NAME' | 'EMAIL' | 'DOCUMENT' | 'PROTOCOL'>('NAME');
  const [value, setValue] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [busyId, setBusyId] = useState('');
  const [badge, setBadge] = useState<Badge | null>(null);
  const [activityId, setActivityId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [lotId, setLotId] = useState('');
  const [selfService, setSelfService] = useState<SelfServiceMethod[]>([]);
  const [benefitCode, setBenefitCode] = useState('');
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [mode, setMode] = useState<DeskMode>('search');
  const [origin, setOrigin] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [edit, setEdit] = useState<EditRecord | null>(null);
  const [editAnswers, setEditAnswers] = useState<Record<string, Answer>>({});

  useEffect(() => {
    if (!eventId) return;
    if (!getToken()) {
      window.location.assign('/login');
      return;
    }
    let active = true;
    api<Context>(`/events/${encodeURIComponent(eventId)}/desk`)
      .then((result) => { if (active) { setContext(result); setSelfService(result.selfService); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a portaria.'); });
    return () => { active = false; };
  }, [eventId]);

  useEffect(() => {
    setOrigin(window.location.origin);
    if (window.location.hash === '#leitor') setMode('reader');
  }, []);

  const capabilities = new Set(context?.capabilities ?? []);
  const canSearch = capabilities.has('credential') || capabilities.has('access_control') || capabilities.has('material_delivery');
  const published = context?.event.status === 'PUBLISHED';
  const category = context?.categories.find((item) => item.id === categoryId);
  const lot = category?.lots.find((item) => item.id === lotId);
  const organizer = context?.role === 'OWNER' || context?.role === 'ADMIN' || context?.role === 'MANAGER';
  const selected = people.find((person) => person.reservationId === selectedId) ?? null;
  const fields = (context?.fields ?? []).filter((field) => {
    if (field.code === 'registration_type' || field.type === 'PHOTO') return false;
    if (field.appliesToCategoryIds?.length && (!categoryId || !field.appliesToCategoryIds.includes(categoryId))) return false;
    return true;
  });

  async function search(event: FormEvent) {
    event.preventDefault();
    setError(''); setNotice(''); setBadge(null);
    try {
      const result = await api<{ items: Person[] }>(`/events/${encodeURIComponent(eventId)}/desk/search`, {
        method: 'POST', body: JSON.stringify({ kind, value }),
      });
      setPeople(result.items);
      setSelectedId(result.items[0]?.reservationId ?? '');
      setEdit(null);
      setNotice(result.items.length === 0 ? 'Nenhuma inscrição encontrada.' : `${result.items.length} inscrição(ões) encontrada(s).`);
    } catch (reason) {
      setPeople([]);
      setError(reason instanceof Error ? reason.message : 'Não foi possível buscar.');
    }
  }

  async function run(person: Person, path: string, body: unknown, success: string) {
    setBusyId(person.reservationId); setError(''); setNotice('');
    try {
      const result = await api<Record<string, unknown>>(`/events/${encodeURIComponent(eventId)}/desk/${path}`, {
        method: 'POST', body: JSON.stringify(body),
      });
      if (path === 'badge') setBadge(result as unknown as Badge);
      const repeated = result.alreadyCheckedIn === true || result.alreadyDelivered === true || result.alreadyRecorded === true;
      setNotice(repeated ? `${success} Este registro já existia.` : success);
      if (path === 'check-in') {
        setPeople((current) => current.map((item) => item.reservationId === person.reservationId
          ? { ...item, checkedInAt: String(result.checkedInAt ?? item.checkedInAt) } : item));
      }
      if (path === 'material') {
        setPeople((current) => current.map((item) => item.reservationId === person.reservationId
          ? { ...item, materialDeliveredAt: String(result.deliveredAt ?? item.materialDeliveredAt) } : item));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível concluir.');
    } finally { setBusyId(''); }
  }

  async function saveSelfService() {
    setError(''); setNotice('');
    try {
      const result = await api<{ methods: SelfServiceMethod[] }>(`/events/${encodeURIComponent(eventId)}/desk/self-service`, {
        method: 'POST',
        body: JSON.stringify({
          cpf: selfService.includes('CPF'),
          email: selfService.includes('EMAIL'),
          qr: selfService.includes('QR'),
          protocol: selfService.includes('PROTOCOL'),
        }),
      });
      setSelfService(result.methods);
      setNotice(result.methods.length === 0
        ? 'Autoatendimento do totem desligado.'
        : 'Buscas do totem atualizadas.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o autoatendimento.');
    }
  }

  async function register(event: FormEvent) {
    event.preventDefault();
    if (!categoryId || !lotId) return;
    setError(''); setNotice('');
    const payloadAnswers: Record<string, Answer> = { registration_type: categoryId };
    for (const field of fields) {
      const current = answers[field.code];
      if (field.type === 'CONSENT') payloadAnswers[field.code] = current === true;
      else if (current !== undefined && current !== '') payloadAnswers[field.code] = current;
    }
    try {
      const result = await api<{ protocol: string; status: string }>(`/events/${encodeURIComponent(eventId)}/desk/registrations`, {
        method: 'POST',
        headers: { 'Idempotency-Key': deskIdempotencyKey() },
        body: JSON.stringify({
          categoryId,
          lotId,
          ...(benefitCode.trim() ? { benefitCode: benefitCode.trim() } : {}),
          answers: payloadAnswers,
        }),
      });
      setNotice(result.status === 'CONFIRMED'
        ? `Inscrição confirmada. Protocolo ${result.protocol}. Busque esse protocolo para imprimir a etiqueta.`
        : `Reserva criada com o protocolo ${result.protocol}. O pagamento segue com a pessoa inscrita.`);
      setMode('search');
      setKind('PROTOCOL');
      setValue(result.protocol);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível inscrever.');
    }
  }

  async function openEdit(person: Person) {
    setBusyId(person.reservationId); setError(''); setNotice('');
    try {
      const record = await api<EditRecord>(`/events/${encodeURIComponent(eventId)}/desk/registrations/${encodeURIComponent(person.reservationId)}`);
      const next: Record<string, Answer> = {};
      for (const field of record.fields) {
        if (field.value !== null) next[field.code] = field.value;
      }
      setEdit(record);
      setEditAnswers(next);
    } catch (reason) {
      setEdit(null);
      setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a ficha.');
    } finally { setBusyId(''); }
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !edit) return;
    setBusyId(selected.reservationId); setError(''); setNotice('');
    const updates: Record<string, Answer> = {};
    for (const field of edit.fields) {
      const current = editAnswers[field.code];
      updates[field.code] = field.type === 'CONSENT'
        ? current === true
        : field.type === 'CHECKBOX'
          ? (Array.isArray(current) ? current : [])
          : current ?? '';
    }
    try {
      const record = await api<EditRecord>(`/events/${encodeURIComponent(eventId)}/desk/registrations/${encodeURIComponent(selected.reservationId)}/corrections`, {
        method: 'POST',
        headers: { 'Idempotency-Key': deskIdempotencyKey() },
        body: JSON.stringify({ expectedRevision: edit.revision, updates }),
      });
      setEdit(record);
      const nameField = record.fields.find((field) => field.code === 'preferred_name') ?? record.fields.find((field) => field.code === 'full_name');
      if (nameField && typeof nameField.value === 'string' && nameField.value.trim()) {
        setPeople((current) => current.map((item) => item.reservationId === selected.reservationId ? { ...item, name: nameField.value as string } : item));
      }
      setNotice('Cadastro atualizado. Imprima a etiqueta de novo se o crachá mudou.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o cadastro.');
    } finally { setBusyId(''); }
  }

  return <div className={styles.page}>
    {!context && error && <p className={styles.error} role="alert">{error}</p>}
    {context && <section className={styles.panel} aria-labelledby="desk-title">
      <header>
        <p className={styles.eyebrow}>POSTO DO OPERADOR</p>
        <h2 id="desk-title">Credenciamento</h2>
        <p>Busque a inscrição, imprima a etiqueta, registre entrada e material, corrija a ficha ou faça uma inscrição gratuita. O organizador libera cada uma dessas ações no evento.</p>
      </header>
      {published ? null : <p>A portaria registra entrada, credencial, material e inscrição quando o evento está publicado.</p>}
      <CredentialLinks
        origin={origin}
        eventId={eventId}
        slug={context.event.slug}
        totemReady={published && selfService.length > 0}
        onOpenReader={() => setMode('reader')}
        onCopied={(message) => { setNotice(message); setError(''); }}
      />
      <div className={styles.modes} role="tablist" aria-label="Funções do posto">
        <button type="button" role="tab" aria-selected={mode === 'search'} onClick={() => setMode('search')}>Buscar</button>
        <button type="button" role="tab" aria-selected={mode === 'reader'} onClick={() => setMode('reader')}>Leitor</button>
        {capabilities.has('registration') && <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => setMode('register')}>Nova inscrição</button>}
        {organizer && capabilities.has('credential') && <button type="button" role="tab" aria-selected={mode === 'settings'} onClick={() => setMode('settings')}>Configuração</button>}
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      {mode === 'reader' && <CheckInConsole eventId={eventId} embedded />}

      {mode === 'settings' && organizer && capabilities.has('credential') && <>
        <fieldset className={`${styles.register} ${styles.choices}`}>
          <legend>Autoatendimento do totem</legend>
          <p>A pessoa encontra a própria inscrição e imprime a etiqueta. A logo do evento fica à esquerda. À direita ficam só as buscas ligadas aqui.</p>
          {(['CPF', 'EMAIL', 'QR', 'PROTOCOL'] as const).map((method) => <label key={method}>
            <input type="checkbox" checked={selfService.includes(method)} onChange={(event) => setSelfService((current) => event.target.checked ? [...current, method] : current.filter((item) => item !== method))} />
            {method === 'CPF' ? 'CPF' : method === 'EMAIL' ? 'E-mail' : method === 'QR' ? 'QR Code' : 'Número de inscrição'}
          </label>)}
          <button type="button" onClick={() => void saveSelfService()}>Salvar autoatendimento</button>
          {published && selfService.length > 0 && context.event.slug && <a href={`/evento/${encodeURIComponent(context.event.slug)}/autoatendimento`}>Abrir totem</a>}
        </fieldset>
        <CredentialLabelSettings
          eventId={eventId}
          initial={context.label}
          fields={context.labelFields}
          onSaved={setNotice}
          onError={setError}
        />
      </>}

      {mode === 'search' && <>
        {canSearch ? <form className={styles.search} onSubmit={search}>
          <label>Buscar por
            <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              <option value="NAME">Nome</option>
              <option value="EMAIL">E-mail</option>
              <option value="DOCUMENT">Documento</option>
              <option value="PROTOCOL">Protocolo</option>
            </select>
          </label>
          <label>Termo
            <input value={value} onChange={(event) => setValue(event.target.value)} required minLength={3} autoComplete="off" />
          </label>
          <button type="submit">Buscar inscrição</button>
        </form> : <p>Ative credenciamento, controle de acesso ou entrega de material para buscar participantes.</p>}

        {people.length > 0 && <ul className={styles.results}>
          {people.map((person) => <li key={person.reservationId}>
            <button type="button" className={person.reservationId === selectedId ? styles.selectedPerson : styles.person} onClick={() => { setSelectedId(person.reservationId); setEdit(null); }}>
              <strong>{person.name}</strong>
              <span>{person.category} · {statusLabels[person.status] ?? person.status} · {person.protocol}</span>
            </button>
          </li>)}
        </ul>}

        {selected && <article className={styles.workspace} aria-label="Inscrição selecionada">
          <h3>{selected.name}</h3>
          <p>{selected.category} · {statusLabels[selected.status] ?? selected.status} · {selected.protocol}</p>
          <p>{selected.checkedInAt ? `Entrada em ${new Date(selected.checkedInAt).toLocaleString('pt-BR')}` : 'Sem entrada no evento'}</p>
          <p>{selected.materialDeliveredAt ? `Material retirado em ${new Date(selected.materialDeliveredAt).toLocaleString('pt-BR')}` : 'Material não retirado'}</p>
          <div className={styles.actions}>
            {capabilities.has('access_control') && selected.status === 'CONFIRMED' && <button type="button" disabled={!published || busyId === selected.reservationId} onClick={() => void run(selected, 'check-in', { reservationId: selected.reservationId }, 'Entrada do evento registrada.')}>Registrar entrada</button>}
            {capabilities.has('credential') && selected.status === 'CONFIRMED' && <button type="button" disabled={!published || busyId === selected.reservationId} onClick={() => void run(selected, 'badge', { reservationId: selected.reservationId }, 'Credencial pronta para impressão.')}>Imprimir credencial</button>}
            {capabilities.has('material_delivery') && selected.status === 'CONFIRMED' && <button type="button" disabled={!published || busyId === selected.reservationId} onClick={() => void run(selected, 'material', { reservationId: selected.reservationId }, 'Retirada de material registrada.')}>Registrar material</button>}
            {(capabilities.has('credential') || capabilities.has('registration')) && <button type="button" disabled={!published || busyId === selected.reservationId} onClick={() => void openEdit(selected)}>Alterar cadastro</button>}
          </div>
          {capabilities.has('access_control') && context.activities.length > 0 && selected.status === 'CONFIRMED' && <form className={styles.activity} onSubmit={(event) => {
            event.preventDefault();
            if (!activityId) return;
            void run(selected, 'activity-access', { reservationId: selected.reservationId, activityId }, 'Acesso à atividade registrado.');
          }}>
            <label>Atividade da programação
              <select value={activityId} onChange={(event) => setActivityId(event.target.value)} required>
                <option value="">Selecione</option>
                {context.activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.title}</option>)}
              </select>
            </label>
            <button type="submit" disabled={!published || busyId === selected.reservationId}>Registrar acesso à atividade</button>
          </form>}
          {edit && <form className={styles.register} onSubmit={saveEdit}>
            <h3>Alteração de cadastro</h3>
            <p>Documento, e-mail, categoria, lote e pagamento permanecem protegidos. A correção fica registrada em nome de quem opera o posto.</p>
            {edit.fields.map((field) => <DeskField key={field.code} field={field} value={editAnswers[field.code]} onChange={(next) => setEditAnswers((current) => ({ ...current, [field.code]: next }))} />)}
            {edit.fields.length === 0 && <p>Esta ficha não tem campos que o posto possa corrigir.</p>}
            <button type="submit" disabled={!published || busyId === selected.reservationId || edit.fields.length === 0}>Salvar cadastro</button>
          </form>}
        </article>}
      </>}

      {mode === 'register' && capabilities.has('registration') && <form className={styles.register} onSubmit={register}>
        <h3>Nova inscrição no posto</h3>
        <p>Somente lote gratuito confirma a vaga aqui. Inscrição paga segue na página pública, e o protocolo volta para a busca.</p>
        {context.event.registrationMode === 'INVITATION' && <p>Este evento exige um código de convite válido.</p>}
        <label>Categoria
          <select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setLotId(''); }} required>
            <option value="">Selecione</option>
            {context.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>Lote
          <select value={lotId} onChange={(event) => setLotId(event.target.value)} required>
            <option value="">Selecione</option>
            {(category?.lots ?? []).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.priceCents === 0 ? 'Gratuito' : money(item.priceCents)}</option>)}
          </select>
        </label>
        <label>Código de benefício ou convite
          <input value={benefitCode} onChange={(event) => setBenefitCode(event.target.value)} autoComplete="off" required={context.event.registrationMode === 'INVITATION'} />
        </label>
        {fields.map((field) => <DeskField key={field.code} field={field} value={answers[field.code]} onChange={(next) => setAnswers((current) => ({ ...current, [field.code]: next }))} />)}
        <button type="submit" disabled={!published || !lot || lot.priceCents > 0}>Confirmar inscrição gratuita</button>
        {lot && lot.priceCents > 0 && <p>Este lote é pago. A confirmação não acontece no posto.</p>}
      </form>}
    </section>}
    {badge && <section className={styles.printSheet} aria-label="Credencial para impressão">
      <CredentialLabel label={badge} preview />
      <button type="button" onClick={() => window.print()}>Imprimir etiqueta</button>
      <CredentialLabel label={badge} />
    </section>}
  </div>;
}
