'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';
import CheckInConsole from './check-in-console';
import CredentialLabel, { CredentialLabelData } from './credential-label';
import CredentialLabelSettings, { LabelSettings } from './credential-label-settings';
import CredentialOperations from './credential-operations';
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
type TotemLinkView = { state: 'absent' | 'active' | 'expired'; expiresAt: string | null };
type Context = {
  event: { id: string; name: string; slug: string; status: string; profileCode: string; registrationMode: string };
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'OPERATOR';
  capabilities: Capability[];
  scientificStationAvailable?: boolean;
  selfService: SelfServiceMethod[];
  totemLink: TotemLinkView;
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
type DeskMode = 'search' | 'reader' | 'register' | 'settings' | 'labels' | 'report' | 'print' | 'raffle' | 'kiosk';

const hashMode: Record<string, DeskMode> = {
  '#leitor': 'reader',
  '#celular': 'search',
  '#etiquetas': 'labels',
  '#relatorio': 'report',
  '#impressao': 'print',
  '#sorteio': 'raffle',
  '#configuracao': 'settings',
  '#nova-inscricao': 'register',
  '#totens': 'kiosk',
};
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

function validityLabel(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function localInputValue(date: Date) {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function CredentialLinks({
  origin, eventId, slug, totemReady, scientificStation, organizer, totemLink, issuedPath, onOpen, onCopied, onIssueTotemLink, onRevokeTotemLink, onTotemError,
}: {
  origin: string;
  eventId: string;
  slug: string;
  totemReady: boolean;
  scientificStation: boolean;
  organizer: boolean;
  totemLink: TotemLinkView;
  issuedPath: string;
  onOpen: (mode: DeskMode) => void;
  onCopied: (message: string) => void;
  onIssueTotemLink: (expiresAt: string) => Promise<void>;
  onRevokeTotemLink: () => Promise<void>;
  onTotemError: (message: string) => void;
}) {
  const deskPath = `/eventos/${encodeURIComponent(eventId)}/painel/check-in`;
  const totemPath = slug ? `/evento/${encodeURIComponent(slug)}/autoatendimento` : '';
  const stationPath = slug ? `/evento/${encodeURIComponent(slug)}/estacao` : '';
  const links: Array<{ title: string; text: string; hash: string; mode: DeskMode; copy: string }> = [
    { title: 'Posto da equipe', text: 'Quem opera a portaria entra com a conta da organização.', hash: '', mode: 'search', copy: 'Copiar posto' },
    { title: 'Credenciamento no celular', text: 'A equipe abre este endereço no navegador do celular.', hash: '#celular', mode: 'search', copy: 'Copiar celular' },
    { title: 'Leitor de QR', text: 'A entrada lê o QR Code ou o código de barras da etiqueta.', hash: '#leitor', mode: 'reader', copy: 'Copiar leitor' },
    { title: 'Lista de etiquetas', text: 'Imprime a etiqueta de cada inscrição confirmada.', hash: '#etiquetas', mode: 'labels', copy: 'Copiar etiquetas' },
    { title: 'Relatório de credenciamento', text: 'Mostra inscrições, entradas e material deste evento.', hash: '#relatorio', mode: 'report', copy: 'Copiar relatório' },
    { title: 'Impressão', text: 'Imprime a lista de participantes deste evento.', hash: '#impressao', mode: 'print', copy: 'Copiar impressão' },
    { title: 'Sorteio', text: 'Sorteia entre as inscrições confirmadas, sem publicar o resultado.', hash: '#sorteio', mode: 'raffle', copy: 'Copiar sorteio' },
  ];
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      onCopied('Endereço copiado.');
    } catch {
      onCopied('Selecione o endereço exibido e copie.');
    }
  }
  function open(hash: string, mode: DeskMode) {
    window.history.replaceState(null, '', `${deskPath}${window.location.search}${hash}`);
    onOpen(mode);
  }
  return <section className={styles.links} aria-labelledby="credential-links-title">
    <h3 id="credential-links-title">Links do credenciamento</h3>
    <p>A equipe usa estes endereços neste evento.</p>
    <ul>
      {links.map((link) => {
        const path = `${deskPath}${link.hash}`;
        return <li key={link.title}>
          <strong>{link.title}</strong>
          <span>{link.text}</span>
          <input readOnly aria-label={`Link de ${link.title}`} value={absoluteUrl(origin, path)} />
          <div>
            <button type="button" onClick={() => void copy(absoluteUrl(origin, path))}>{link.copy}</button>
            <a href={path} onClick={(event) => { event.preventDefault(); open(link.hash, link.mode); }}>Abrir</a>
          </div>
        </li>;
      })}
      <li>
        <strong>Totem de autoatendimento</strong>
        <span>A pessoa confirma nome, categoria e empresa, e só então imprime. Sair não registra a entrada. Os tipos de consulta ficam na função Totens.</span>
        {totemPath ? <>
          <input readOnly aria-label="Link do totem de autoatendimento" value={absoluteUrl(origin, totemPath)} />
          <div>
            <button type="button" onClick={() => void copy(absoluteUrl(origin, totemPath))}>Copiar totem</button>
            <a href={totemPath} target="_blank" rel="noopener noreferrer">Abrir totem</a>
            <a href={`${deskPath}#totens`} onClick={(event) => { event.preventDefault(); open('#totens', 'kiosk'); }}>Configurar consultas</a>
          </div>
          {!totemReady && <span>O endereço já pode ser copiado. O totem só encontra inscrições quando o evento está publicado e ao menos um tipo de consulta está ligado.</span>}
        </> : <span>O evento ainda não tem endereço público para o totem.</span>}
      </li>
      {scientificStation && <li>
        <strong>Estação científica</strong>
        {stationPath ? <>
          <span>Abre os trabalhos aprovados no totem: busca por título, autor, área, subárea, instituição ou id do resumo.</span>
          <input readOnly aria-label="Link da estação científica" value={absoluteUrl(origin, stationPath)} />
          <div>
            <button type="button" onClick={() => void copy(absoluteUrl(origin, stationPath))}>Copiar estação</button>
            <a href={stationPath} target="_blank" rel="noopener noreferrer">Abrir estação</a>
          </div>
        </> : <span>A estação científica aparece aqui quando o evento publicado tem endereço público.</span>}
      </li>}
      <TotemValidityLink
        origin={origin}
        totemReady={totemReady}
        organizer={organizer}
        link={totemLink}
        issuedPath={issuedPath}
        onCopied={onCopied}
        onIssue={onIssueTotemLink}
        onRevoke={onRevokeTotemLink}
        onError={onTotemError}
      />
    </ul>
  </section>;
}

function TotemValidityLink({
  origin, totemReady, organizer, link, issuedPath, onCopied, onIssue, onRevoke, onError,
}: {
  origin: string;
  totemReady: boolean;
  organizer: boolean;
  link: TotemLinkView;
  issuedPath: string;
  onCopied: (message: string) => void;
  onIssue: (expiresAt: string) => Promise<void>;
  onRevoke: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [preset, setPreset] = useState<'1' | '7' | '30' | 'custom'>('7');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const earliest = new Date(Date.now() + 30 * 60_000);
  const latest = new Date(Date.now() + 90 * 24 * 60 * 60_000);
  const status = link.state === 'active'
    ? `Válido até ${validityLabel(link.expiresAt)}.`
    : link.state === 'expired'
      ? `Expirou em ${validityLabel(link.expiresAt)}.`
      : 'Ainda não há um link com validade.';

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      onCopied('Endereço copiado.');
    } catch {
      onCopied('Selecione o endereço exibido e copie.');
    }
  }

  async function issue(event: FormEvent) {
    event.preventDefault();
    if (preset === 'custom' && Number.isNaN(Date.parse(custom))) {
      onError('Informe a data de validade do link.');
      return;
    }
    const expiresAt = preset === 'custom'
      ? new Date(custom).toISOString()
      : new Date(Date.now() + Number(preset) * 24 * 60 * 60_000).toISOString();
    setBusy(true);
    try { await onIssue(expiresAt); } finally { setBusy(false); }
  }

  async function revoke() {
    setBusy(true);
    try { await onRevoke(); } finally { setBusy(false); }
  }

  return <li>
    <strong>Link do totem com validade</strong>
    <span>Este endereço abre o mesmo autoatendimento e deixa de funcionar na data de validade. O link estável acima continua. O endereço completo só aparece na hora em que é gerado. Um link novo encerra o anterior.</span>
    <p>{status}</p>
    {issuedPath ? <>
      <input readOnly aria-label="Link do totem com validade" value={absoluteUrl(origin, issuedPath)} />
      <div>
        <button type="button" onClick={() => void copy(absoluteUrl(origin, issuedPath))}>Copiar link com validade</button>
        <a href={issuedPath} target="_blank" rel="noopener noreferrer">Abrir link com validade</a>
      </div>
    </> : link.state === 'active' ? <span>O endereço completo não fica guardado. Gere outro link para substituir o que está valendo.</span> : null}
    {organizer && totemReady ? <form onSubmit={(event) => void issue(event)}>
      <div>
        {(['1', '7', '30'] as const).map((days) => <button key={days} type="button" aria-pressed={preset === days} onClick={() => setPreset(days)}>{days === '1' ? '1 dia' : `${days} dias`}</button>)}
        <button type="button" aria-pressed={preset === 'custom'} onClick={() => setPreset('custom')}>Escolher data</button>
      </div>
      {preset === 'custom' && <label>Validade
        <input aria-label="Data de validade do link" type="datetime-local" required value={custom} min={localInputValue(earliest)} max={localInputValue(latest)} onChange={(event) => setCustom(event.target.value)} />
      </label>}
      <div>
        <button type="submit" disabled={busy}>{link.state === 'active' ? 'Substituir link' : 'Gerar link'}</button>
        {link.state !== 'absent' && <button type="button" disabled={busy} onClick={() => void revoke()}>Encerrar link</button>}
      </div>
      <span>A validade fica entre 30 minutos e 90 dias.</span>
    </form> : organizer ? <>
      <span>O link com validade aparece aqui quando o evento está publicado e ao menos uma busca do autoatendimento está ligada.</span>
      {link.state !== 'absent' && <button type="button" disabled={busy} onClick={() => void revoke()}>Encerrar link</button>}
    </> : <span>O organizador gera e encerra este link.</span>}
  </li>;
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
  if (!eventId) return <p>Escolha um evento para abrir o credenciamento.</p>;
  return <EventDeskSession key={eventId} eventId={eventId} />;
}

function EventDeskSession({ eventId }: { eventId: string }) {
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
  const [totemLink, setTotemLink] = useState<TotemLinkView>({ state: 'absent', expiresAt: null });
  const [totemAccessPath, setTotemAccessPath] = useState('');
  const [benefitCode, setBenefitCode] = useState('');
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [mode, setMode] = useState<DeskMode>('search');
  const [origin, setOrigin] = useState('');
  const [roster, setRoster] = useState<{ title: string; lines: string[] } | null>(null);
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
      .then((result) => { if (active) { setContext(result); setSelfService(result.selfService); setTotemLink(result.totemLink); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a portaria.'); });
    return () => { active = false; };
  }, [eventId]);

  useEffect(() => {
    setOrigin(window.location.origin);
    const next = hashMode[window.location.hash];
    if (next) setMode(next);
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

  async function issueTotemLink(expiresAt: string) {
    setError(''); setNotice('');
    try {
      const result = await api<{ path: string; expiresAt: string }>(`/events/${encodeURIComponent(eventId)}/desk/totem-link`, {
        method: 'POST',
        body: JSON.stringify({ expiresAt }),
      });
      setTotemLink({ state: 'active', expiresAt: result.expiresAt });
      setTotemAccessPath(result.path);
      setNotice('Link com validade gerado. Copie o endereço agora. Ele não aparece de novo.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível gerar o link com validade.');
    }
  }

  async function revokeTotemLink() {
    setError(''); setNotice('');
    try {
      const result = await api<TotemLinkView>(`/events/${encodeURIComponent(eventId)}/desk/totem-link/revoke`, { method: 'POST' });
      setTotemLink(result);
      setTotemAccessPath('');
      setNotice('Link com validade encerrado.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível encerrar o link com validade.');
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
        <p>Encontre o participante, registre a entrada e imprima a credencial. Escolha abaixo a tarefa que deseja realizar.</p>
      </header>
      {published ? null : <p>A portaria registra entrada, credencial, material e inscrição quando o evento está publicado.</p>}
      <nav className={styles.modes} aria-label="Funções do credenciamento">
        {([
          ['search', 'Buscar participante'], ['kiosk', 'Totens'], ['reader', 'Ler QR Code'],
          ['labels', 'Etiquetas'], ['report', 'Relatório'], ['print', 'Lista para impressão'], ['raffle', 'Sorteio'],
          ...(capabilities.has('registration') ? [['register', 'Nova inscrição']] : []),
          ...(organizer && capabilities.has('credential') ? [['settings', 'Configurações']] : []),
        ] as Array<[DeskMode, string]>).map(([next, label]) => <button key={next} type="button" aria-current={mode === next ? 'page' : undefined} onClick={() => {
          setRoster(null); setMode(next);
          const hash = Object.entries(hashMode).find(([, target]) => target === next)?.[0] ?? '';
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
        }}>{label}</button>)}
      </nav>
      <details className={styles.linkDisclosure}>
        <summary>Compartilhar acessos com a equipe e abrir totens</summary>
      <CredentialLinks
        origin={origin}
        eventId={eventId}
        slug={context.event.slug}
        totemReady={published && selfService.length > 0}
        scientificStation={published && context.scientificStationAvailable === true}
        organizer={organizer}
        totemLink={totemLink}
        issuedPath={totemAccessPath}
        onOpen={(next) => { setRoster(null); setMode(next); }}
        onCopied={(message) => { setNotice(message); setError(''); }}
        onIssueTotemLink={issueTotemLink}
        onRevokeTotemLink={revokeTotemLink}
        onTotemError={(message) => { setError(message); setNotice(''); }}
      />
      </details>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      {mode === 'reader' && <CheckInConsole eventId={eventId} embedded />}

      {(mode === 'labels' || mode === 'report' || mode === 'print' || mode === 'raffle') && <CredentialOperations key={`${eventId}:${mode}`}
        eventId={eventId}
        mode={mode}
        categories={context.categories}
        activities={context.activities}
        published={published}
        onPrintBadge={(reservationId) => void run({ reservationId, protocol: '', name: '', category: '', status: 'CONFIRMED', checkedInAt: null, materialDeliveredAt: null }, 'badge', { reservationId }, 'Credencial pronta para impressão.')}
        onPrintList={(title, lines) => setRoster({ title, lines })}
      />}

      {mode === 'kiosk' && <fieldset className={`${styles.register} ${styles.choices}`}>
        <legend>Autoatendimento do totem</legend>
        <p>Escolha como o participante encontra a inscrição no totem: CPF, e-mail, QR Code ou número de inscrição. A equipe abre o mesmo endereço abaixo.</p>
        {(['CPF', 'EMAIL', 'QR', 'PROTOCOL'] as const).map((method) => <label key={method}>
          <input type="checkbox" checked={selfService.includes(method)} disabled={!organizer || !capabilities.has('credential')} onChange={(event) => setSelfService((current) => event.target.checked ? [...current, method] : current.filter((item) => item !== method))} />
          {method === 'CPF' ? 'CPF' : method === 'EMAIL' ? 'E-mail' : method === 'QR' ? 'QR Code' : 'Número de inscrição'}
        </label>)}
        {organizer && capabilities.has('credential')
          ? <button type="button" onClick={() => void saveSelfService()}>Salvar tipos de consulta</button>
          : <p>{organizer ? 'Ative o credenciamento do evento para salvar os tipos de consulta do totem.' : 'A organização define estes tipos. A equipe usa o link para abrir o totem.'}</p>}
        {context.event.slug && <a href={`/evento/${encodeURIComponent(context.event.slug)}/autoatendimento`}>Abrir totem</a>}
        {!published && <p>O totem público passa a localizar inscrições quando o evento está publicado.</p>}
        {selfService.length === 0 && <p>Nenhum tipo de consulta está ligado.</p>}
      </fieldset>}

      {mode === 'settings' && organizer && capabilities.has('credential') && <>
        <CredentialLabelSettings
          eventId={eventId}
          initial={context.label}
          fields={context.labelFields}
          onSaved={(message, label) => { setContext((current) => current ? { ...current, label } : current); setNotice(message); setError(''); }}
          onError={(message) => { setError(message); setNotice(''); }}
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
    {roster && <section className={styles.printSheet} aria-label={roster.title}>
      <h3>{roster.title}</h3>
      <ul>{roster.lines.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}</ul>
      <button type="button" onClick={() => window.print()}>Imprimir</button>
    </section>}
    {badge && <section className={styles.printSheet} aria-label="Credencial para impressão">
      <CredentialLabel label={badge} preview />
      <button type="button" onClick={() => window.print()}>Imprimir etiqueta</button>
      <CredentialLabel label={badge} />
    </section>}
  </div>;
}

