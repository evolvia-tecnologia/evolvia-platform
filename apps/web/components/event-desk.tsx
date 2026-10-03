'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';
import CheckInConsole from './check-in-console';
import CredentialQr from './credential-qr';
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
type Context = {
  event: { id: string; name: string; slug: string; status: string; registrationMode: string };
  capabilities: Capability[];
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
type Badge = { eventName: string; name: string; category: string; protocol: string; code: string };

const statusLabels: Record<string, string> = {
  CONFIRMED: 'Confirmada',
  PENDING_PAYMENT: 'Aguardando pagamento',
  EXPIRED: 'Expirada',
  CANCELLED: 'Cancelada',
};

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
  const [benefitCode, setBenefitCode] = useState('');
  const [answers, setAnswers] = useState<Record<string, Answer>>({});

  useEffect(() => {
    if (!eventId) return;
    if (!getToken()) {
      window.location.assign('/login');
      return;
    }
    let active = true;
    api<Context>(`/events/${encodeURIComponent(eventId)}/desk`)
      .then((result) => { if (active) setContext(result); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a portaria.'); });
    return () => { active = false; };
  }, [eventId]);

  const capabilities = new Set(context?.capabilities ?? []);
  const canSearch = capabilities.has('credential') || capabilities.has('access_control') || capabilities.has('material_delivery');
  const published = context?.event.status === 'PUBLISHED';
  const category = context?.categories.find((item) => item.id === categoryId);
  const lot = category?.lots.find((item) => item.id === lotId);
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
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({
          categoryId,
          lotId,
          ...(benefitCode.trim() ? { benefitCode: benefitCode.trim() } : {}),
          answers: payloadAnswers,
        }),
      });
      setNotice(result.status === 'CONFIRMED'
        ? `Inscrição confirmada. Protocolo ${result.protocol}.`
        : `Reserva criada com o protocolo ${result.protocol}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível inscrever.');
    }
  }

  return <div className={styles.page}>
    <CheckInConsole eventId={eventId} />
    {!context && error && <p className={styles.error} role="alert">{error}</p>}
    {context && <section className={styles.panel} aria-labelledby="desk-title">
      <header>
        <p className={styles.eyebrow}>PORTARIA</p>
        <h2 id="desk-title">Credenciamento e acesso</h2>
        <p>As ações seguem os recursos ativos deste evento. O perfil não libera nada por conta própria.</p>
      </header>
      {published ? null : <p>A portaria registra entrada, credencial, material e inscrição quando o evento está publicado.</p>}
      {published && capabilities.has('access_control') && context.event.slug && <a href={`/evento/${encodeURIComponent(context.event.slug)}/autoatendimento`}>Abrir autoatendimento</a>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

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
          <strong>{person.name}</strong>
          <span>{person.category} · {statusLabels[person.status] ?? person.status} · {person.protocol}</span>
          <span>{person.checkedInAt ? `Entrada em ${new Date(person.checkedInAt).toLocaleString('pt-BR')}` : 'Sem entrada no evento'}</span>
          <span>{person.materialDeliveredAt ? `Material retirado em ${new Date(person.materialDeliveredAt).toLocaleString('pt-BR')}` : 'Material não retirado'}</span>
          <div className={styles.actions}>
            {capabilities.has('access_control') && person.status === 'CONFIRMED' && <button type="button" disabled={!published || busyId === person.reservationId} onClick={() => void run(person, 'check-in', { reservationId: person.reservationId }, 'Entrada do evento registrada.')}>Registrar entrada</button>}
            {capabilities.has('credential') && person.status === 'CONFIRMED' && <button type="button" disabled={!published || busyId === person.reservationId} onClick={() => void run(person, 'badge', { reservationId: person.reservationId }, 'Credencial pronta para impressão.')}>Imprimir credencial</button>}
            {capabilities.has('material_delivery') && person.status === 'CONFIRMED' && <button type="button" disabled={!published || busyId === person.reservationId} onClick={() => void run(person, 'material', { reservationId: person.reservationId }, 'Retirada de material registrada.')}>Registrar material</button>}
          </div>
          {capabilities.has('access_control') && context.activities.length > 0 && person.status === 'CONFIRMED' && <form className={styles.activity} onSubmit={(event) => {
            event.preventDefault();
            if (!activityId) return;
            void run(person, 'activity-access', { reservationId: person.reservationId, activityId }, 'Acesso à atividade registrado.');
          }}>
            <label>Atividade da programação
              <select value={activityId} onChange={(event) => setActivityId(event.target.value)} required>
                <option value="">Selecione</option>
                {context.activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.title}</option>)}
              </select>
            </label>
            <button type="submit" disabled={!published || busyId === person.reservationId}>Registrar acesso à atividade</button>
          </form>}
        </li>)}
      </ul>}

      {badge && <section className={styles.printSheet} aria-label="Credencial para impressão">
        <p>{badge.eventName}</p>
        <h3>{badge.name}</h3>
        <p>{badge.category}</p>
        <p>Protocolo {badge.protocol}</p>
        <CredentialQr code={badge.code} />
        <button type="button" onClick={() => window.print()}>Imprimir agora</button>
      </section>}

      {capabilities.has('registration') && <form className={styles.register} onSubmit={register}>
        <h3>Nova inscrição no posto</h3>
        <p>Somente lote gratuito confirma a vaga aqui. Inscrição paga segue na página pública.</p>
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
  </div>;
}
