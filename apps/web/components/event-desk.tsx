'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, getToken } from '../lib/api';
import {
  publicDeskFreeConfirmLabel,
  publicDeskNewLabel,
  publicDeskProtocolMethodLabel,
  publicDeskRegisterTitle,
  publicDeskSearchNotice,
  publicDeskSearchSubmitLabel,
  publicDeskSelectedLabel,
  publicRegistrationNoun,
} from '../lib/public-registration-cta';
import InternationalPhoneInput from './international-phone-input';
import { updateRegistrationAnswer } from '../lib/registration-input';
import CheckInConsole from './check-in-console';
import CredentialLabel, { CredentialLabelData, credentialLabelLayout } from './credential-label';
import CredentialLabelSettings, { LabelSettings } from './credential-label-settings';
import CredentialCategoryTemplates, { type CategoryLabelTemplate } from './credential-category-templates';
import CredentialOperations from './credential-operations';
import EvaScreenSupport from './eva-screen-support';
import KitReport from './kit-report';
import KitStockPanel, { KitView } from './kit-stock-panel';
import PrintSurface from './print-surface';
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
  event: { id: string; name: string; slug: string; status: string; profileCode: string; eventType?: string | null; registrationMode: string };
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'OPERATOR';
  capabilities: Capability[];
  scientificStationAvailable?: boolean;
  selfService: SelfServiceMethod[];
  totemLink: TotemLinkView;
  label: LabelSettings;
  categoryLabelTemplates: CategoryLabelTemplate[];
  labelFields: Array<{ code: string; label: string; appliesToCategoryIds?: string[] }>;
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
  checkInReversedAt: string | null;
  materialDeliveredAt: string | null;
  materialReversedAt: string | null;
  shirtPreference: { sizeId: string; label: string } | null;
  deliveredSizeLabel: string | null;
  presenceDays: string[];
  presentToday: boolean;
};
type Badge = CredentialLabelData;
type DeskMode = 'search' | 'reader' | 'register' | 'settings' | 'labels' | 'report' | 'print' | 'raffle' | 'kiosk' | 'kit' | 'kit-report';

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
  '#kit': 'kit',
  '#relatorio-kits': 'kit-report',
};
type EditField = Field & { value: Answer | null };
type EditRecord = { reservationId: string; revision: number; fields: EditField[]; locked: string[] };

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
  if (field.type === 'PHONE') return <InternationalPhoneInput label={field.label} value={String(value ?? '')} required={field.required} onChange={onChange} />;
  const type = field.type === 'EMAIL' ? 'email' : field.type === 'DATE' ? 'date' : field.type === 'NUMBER' ? 'number' : 'text';
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
  const selectionVersion = useRef(0);
  const pendingAction = useRef(false);
  const busyRequest = useRef(0);
  const editFormRef = useRef<HTMLFormElement>(null);
  const printButtonRef = useRef<HTMLButtonElement>(null);
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
  const preferredNameEdited = useRef(false);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [mode, setMode] = useState<DeskMode>('search');
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    if (mode === 'register') {
      preferredNameEdited.current = false;
      setAnswers({});
      setBenefitCode('');
    }
  }, [mode]);
  const [roster, setRoster] = useState<{ title: string; lines: string[] } | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [edit, setEdit] = useState<EditRecord | null>(null);
  const [editAnswers, setEditAnswers] = useState<Record<string, Answer>>({});
  const [reversalReason, setReversalReason] = useState('');
  const [searchReversingId, setSearchReversingId] = useState('');
  const [searchReverseReason, setSearchReverseReason] = useState('');
  const [kit, setKit] = useState<KitView | null>(null);
  const [kitBalanceStale, setKitBalanceStale] = useState<'delivery' | 'reversal' | null>(null);
  const [deliveredSizeId, setDeliveredSizeId] = useState('');
  const [confirmSizeChange, setConfirmSizeChange] = useState(false);
  useEffect(() => {
    if (edit) {
      editFormRef.current?.scrollIntoView({ block: 'nearest' });
      editFormRef.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    }
  }, [edit]);
  useEffect(() => {
    if (!badge && !roster) return;
    // Do not open the thermal printer automatically for an illegible label.
    // The preview explains why it needs a larger paper size or fewer fields.
    if (badge && credentialLabelLayout(badge).fitWarning) return;
    let second = 0;
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => {
        printButtonRef.current?.focus();
        window.print();
      });
    });
    return () => { window.cancelAnimationFrame(first); window.cancelAnimationFrame(second); };
  }, [badge, roster]);
  // Bloqueio de impressão nativa: Ctrl/Cmd+P e menu do navegador não passam
  // pelo botão desabilitado. Enquanto a credencial for ilegível, não há
  // superfície de impressão válida e a mídia impressa deve permanecer vazia.
  useEffect(() => {
    if (!badge || !credentialLabelLayout(badge).fitWarning) return;
    const blockShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', blockShortcut, true);
    const guard = typeof document === 'undefined' ? null : document.createElement('style');
    if (guard) {
      guard.setAttribute('data-evolvia-invalid-label-print-guard', 'true');
      guard.textContent = '@media print { body, body * { visibility: hidden !important; } }';
      document.head.appendChild(guard);
    }
    return () => {
      window.removeEventListener('keydown', blockShortcut, true);
      guard?.remove();
    };
  }, [badge]);
  useEffect(() => () => { selectionVersion.current += 1; }, []);
  const shirtsOn = Boolean(kit?.shirtsEnabled && kit.sizes.length > 0);
  useEffect(() => { setReversalReason(''); setConfirmSizeChange(false); }, [selectedId]);

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
    if (!eventId || !context?.capabilities.includes('material_delivery')) return;
    let active = true;
    api<KitView>(`/events/${encodeURIComponent(eventId)}/desk/kit`)
      .then((next) => { if (active) setKit(next); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o kit.');
      });
    return () => { active = false; };
  }, [eventId, context]);

  useEffect(() => {
    setOrigin(window.location.origin);
    const applyHash = () => {
      const next = hashMode[window.location.hash];
      if (next) { invalidateSelection(); setMode(next); }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  const capabilities = new Set(context?.capabilities ?? []);
  const canSearch = capabilities.has('credential') || capabilities.has('access_control') || capabilities.has('material_delivery');
  const published = context?.event.status === 'PUBLISHED';
  const category = context?.categories.find((item) => item.id === categoryId);
  const lot = category?.lots.find((item) => item.id === lotId);
  const organizer = context?.role === 'OWNER' || context?.role === 'ADMIN' || context?.role === 'MANAGER';
  const selected = people.find((person) => person.reservationId === selectedId) ?? null;
  const preferenceSizeId = selected?.shirtPreference?.sizeId ?? '';
  const activePreferenceId = kit?.sizes.some((size) => size.id === preferenceSizeId) ? preferenceSizeId : '';
  useEffect(() => { setDeliveredSizeId(activePreferenceId); setConfirmSizeChange(false); }, [selectedId, activePreferenceId]);
  const fields = (context?.fields ?? []).filter((field) => {
    if (field.code === 'registration_type' || field.type === 'PHOTO') return false;
    if (field.appliesToCategoryIds?.length && (!categoryId || !field.appliesToCategoryIds.includes(categoryId))) return false;
    return true;
  });

  function invalidateSelection() {
    selectionVersion.current += 1;
    pendingAction.current = false;
    setBusyId(''); setBadge(null); setRoster(null); setEdit(null);
    return selectionVersion.current;
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    const version = invalidateSelection();
    setError(''); setNotice('');
    try {
      const result = await api<{ items: Person[] }>(`/events/${encodeURIComponent(eventId)}/desk/search`, {
        method: 'POST', body: JSON.stringify({ kind, value }),
      });
      if (version !== selectionVersion.current) return;
      setPeople(result.items);
      setSelectedId(result.items[0]?.reservationId ?? '');
      setEdit(null);
      setNotice(publicDeskSearchNotice(result.items.length, context?.event.profileCode, context?.event.eventType));
    } catch (reason) {
      if (version !== selectionVersion.current) return;
      setPeople([]);
      setError(reason instanceof Error ? reason.message : 'Não foi possível buscar.');
    }
  }

  async function run(person: Person, path: string, body: unknown, success: string): Promise<boolean> {
    if (pendingAction.current) return false;
    pendingAction.current = true;
    const version = selectionVersion.current;
    const requestId = ++busyRequest.current;
    setBusyId(person.reservationId); setError(''); setNotice('');
    try {
      const result = await api<Record<string, unknown>>(`/events/${encodeURIComponent(eventId)}/desk/${path}`, {
        method: 'POST', body: JSON.stringify(body),
      });
      if (version !== selectionVersion.current) return false;
      if (path === 'badge') { setRoster(null); setBadge(result as unknown as Badge); }
      const repeated = result.alreadyCheckedIn === true || result.alreadyDelivered === true || result.alreadyRecorded === true;
      setNotice(repeated ? `${success} Este registro já existia.` : success);
      if (path === 'check-in') {
        setPeople((current) => current.map((item) => item.reservationId === person.reservationId
          ? { ...item, checkedInAt: String(result.checkedInAt ?? item.checkedInAt), checkInReversedAt: null } : item));
      }
      if (path === 'check-in/reverse') {
        setPeople((current) => current.map((item) => item.reservationId === person.reservationId
          ? { ...item, checkedInAt: null, checkInReversedAt: String(result.reversedAt ?? new Date().toISOString()) } : item));
        setReversalReason('');
      }
      if (path === 'material' || path === 'material/reverse') {
        try {
          setKit(await api<KitView>(`/events/${encodeURIComponent(eventId)}/desk/kit`));
          setKitBalanceStale(null);
        } catch {
          setKit(null);
          setKitBalanceStale(path === 'material' ? 'delivery' : 'reversal');
        }
      }
      if (path === 'material') {
        setPeople((current) => current.map((item) => item.reservationId === person.reservationId
          ? {
            ...item,
            materialDeliveredAt: String(result.deliveredAt ?? item.materialDeliveredAt),
            materialReversedAt: null,
            deliveredSizeLabel: typeof result.sizeLabel === 'string' ? result.sizeLabel : item.deliveredSizeLabel,
          } : item));
      }
      if (path === 'material/reverse') {
        setPeople((current) => current.map((item) => item.reservationId === person.reservationId
          ? { ...item, materialDeliveredAt: null, materialReversedAt: String(result.reversedAt ?? new Date().toISOString()), deliveredSizeLabel: null } : item));
        setReversalReason('');
      }
      if (path === 'day-presence') {
        const day = typeof result.day === 'string' ? result.day : '';
        setPeople((current) => current.map((item) => item.reservationId === person.reservationId
          ? { ...item, presentToday: true, presenceDays: day && !item.presenceDays.includes(day) ? [...item.presenceDays, day] : item.presenceDays } : item));
      }
      if (path === 'day-presence/reverse') {
        const day = typeof result.day === 'string' ? result.day : '';
        setPeople((current) => current.map((item) => item.reservationId === person.reservationId
          ? { ...item, presentToday: false, presenceDays: item.presenceDays.filter((itemDay) => itemDay !== day) } : item));
        setReversalReason('');
      }
      return true;
    } catch (reason) {
      if (version !== selectionVersion.current) return false;
      setError(reason instanceof Error ? reason.message : 'Não foi possível concluir.');
      return false;
    } finally {
      if (version === selectionVersion.current && requestId === busyRequest.current) {
        pendingAction.current = false;
        setBusyId('');
      }
    }
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
    if (pendingAction.current) return;
    pendingAction.current = true;
    const version = selectionVersion.current;
    const requestId = ++busyRequest.current;
    setBadge(null); setRoster(null);
    setBusyId(person.reservationId); setError(''); setNotice('');
    try {
      const record = await api<EditRecord>(`/events/${encodeURIComponent(eventId)}/desk/registrations/${encodeURIComponent(person.reservationId)}`);
      if (version !== selectionVersion.current) return;
      const next: Record<string, Answer> = {};
      for (const field of record.fields) {
        if (field.value !== null) next[field.code] = field.value;
      }
      setEdit(record);
      setEditAnswers(next);
    } catch (reason) {
      if (version !== selectionVersion.current) return;
      setEdit(null);
      setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a ficha.');
    } finally {
      if (version === selectionVersion.current && requestId === busyRequest.current) {
        pendingAction.current = false;
        setBusyId('');
      }
    }
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !edit || edit.reservationId !== selected.reservationId || pendingAction.current) return;
    pendingAction.current = true;
    const version = selectionVersion.current;
    const requestId = ++busyRequest.current;
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
      if (version !== selectionVersion.current) return;
      setEdit(record);
      setEditAnswers(Object.fromEntries(record.fields.filter((field) => field.value !== null).map((field) => [field.code, field.value as Answer])));
      const nameField = record.fields.find((field) => field.code === 'preferred_name') ?? record.fields.find((field) => field.code === 'full_name');
      if (nameField && typeof nameField.value === 'string' && nameField.value.trim()) {
        setPeople((current) => current.map((item) => item.reservationId === selected.reservationId ? { ...item, name: nameField.value as string } : item));
      }
      setNotice('Cadastro atualizado. Imprima a etiqueta de novo se o crachá mudou.');
    } catch (reason) {
      if (version !== selectionVersion.current) return;
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o cadastro.');
    } finally {
      if (version === selectionVersion.current && requestId === busyRequest.current) {
        pendingAction.current = false;
        setBusyId('');
      }
    }
  }

  return <>
  <div className={styles.page}>
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
          ['report', 'Relatório'], ['print', 'Lista para impressão'], ['raffle', 'Sorteio'],
          ...(capabilities.has('registration') ? [['register', publicDeskNewLabel(context.event.profileCode, context.event.eventType)]] : []),
          ...(organizer && capabilities.has('credential') ? [['labels', 'Configurar etiquetas']] : []),
          ...(capabilities.has('material_delivery') ? [['kit', 'Kit e camisas'], ['kit-report', 'Relatório de kits']] as Array<[DeskMode, string]> : []),
        ] as Array<[DeskMode, string]>).map(([next, label]) => <button key={next} type="button" aria-current={mode === next ? 'page' : undefined} onClick={() => {
          invalidateSelection(); setMode(next);
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
        onOpen={(next) => { invalidateSelection(); setMode(next); }}
        onCopied={(message) => { setNotice(message); setError(''); }}
        onIssueTotemLink={issueTotemLink}
        onRevokeTotemLink={revokeTotemLink}
        onTotemError={(message) => { setError(message); setNotice(''); }}
      />
      </details>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      {mode === 'kit' && capabilities.has('material_delivery') && <KitStockPanel
        eventId={eventId}
        organizer={organizer}
        onChange={setKit}
        onError={(message) => { setError(message); setNotice(''); }}
        onSaved={(message) => { setNotice(message); setError(''); }}
      />}

      {mode === 'kit-report' && capabilities.has('material_delivery') && <KitReport eventId={eventId} organizer={organizer} />}

      {mode === 'reader' && <CheckInConsole eventId={eventId} embedded />}

      {(mode === 'report' || mode === 'print' || mode === 'raffle') && <CredentialOperations key={`${eventId}:${mode}`}
        eventId={eventId}
        mode={mode}
        categories={context.categories}
        activities={context.activities}
        published={published}
        canMarkPresence={capabilities.has('access_control')}
        canPrintBadge={capabilities.has('credential')}
        onPrintBadge={(reservationId) => void run({ reservationId, protocol: '', name: '', category: '', status: 'CONFIRMED', checkedInAt: null, checkInReversedAt: null, materialDeliveredAt: null, materialReversedAt: null, shirtPreference: null, deliveredSizeLabel: null, presenceDays: [], presentToday: false }, 'badge', { reservationId }, 'Credencial pronta para impressão.')}
        onPrintList={(title, lines) => { setBadge(null); setRoster({ title, lines }); }}
      />}

      {mode === 'kiosk' && <fieldset className={styles.register}>
        <legend>Autoatendimento do totem</legend>
        <div className={styles.choices}>
        <p>Escolha como o participante encontra a inscrição no totem: CPF ou passaporte, e-mail, QR Code ou número da inscrição. A equipe abre o mesmo endereço abaixo.</p>
        <p>A logo desta tela é a logo enviada em Divulgação. Não há outro envio.</p>
        <a href={`/eventos/${encodeURIComponent(eventId)}/painel/divulgacao`} target="_blank" rel="noopener noreferrer">Abrir logo na Divulgação</a>
        {(['CPF', 'EMAIL', 'QR', 'PROTOCOL'] as const).map((method) => <label key={method}>
          <input type="checkbox" checked={selfService.includes(method)} disabled={!organizer || !capabilities.has('credential')} onChange={(event) => setSelfService((current) => event.target.checked ? [...current, method] : current.filter((item) => item !== method))} />
          {method === 'CPF' ? 'CPF ou passaporte' : method === 'EMAIL' ? 'E-mail' : method === 'QR' ? 'QR Code' : publicDeskProtocolMethodLabel(context.event.profileCode, context.event.eventType)}
        </label>)}
        {organizer && capabilities.has('credential')
          ? <button type="button" onClick={() => void saveSelfService()}>Salvar tipos de consulta</button>
          : <p>{organizer ? 'Ative o credenciamento do evento para salvar os tipos de consulta do totem.' : 'A organização define estes tipos. A equipe usa o link para abrir o totem.'}</p>}
        {context.event.slug && <a href={`/evento/${encodeURIComponent(context.event.slug)}/autoatendimento`}>Abrir totem</a>}
        {!published && <p>O totem público passa a localizar inscrições quando o evento está publicado.</p>}
        {selfService.length === 0 && <p>Nenhum tipo de consulta está ligado.</p>}
        </div>
      </fieldset>}

      {(mode === 'labels' || mode === 'settings') && organizer && capabilities.has('credential') && <section aria-label="Configuração das etiquetas">
        <header>
          <h3>Configuração de etiquetas</h3>
          <p>Configure os campos e a impressão no mesmo lugar. Os modelos são específicos de cada categoria; o papel e os códigos valem para o credenciamento do evento.</p>
        </header>
        <h4>1. Modelos e campos por categoria</h4>
        <CredentialCategoryTemplates
        key={eventId}
        eventId={eventId}
        organizer={organizer}
        categories={context.categories}
        fields={context.labelFields}
        templates={context.categoryLabelTemplates ?? []}
        widthMm={context.label.widthMm}
        heightMm={context.label.heightMm}
        onSaved={(template) => {
          setContext((current) => current ? {
            ...current, categoryLabelTemplates: [
              ...(current.categoryLabelTemplates ?? []).filter((item) => item.categoryId !== template.categoryId),
              template,
            ],
          } : current);
          setNotice('Modelo de etiqueta salvo para esta categoria.');
          setError('');
        }}
        onError={(message) => { setError(message); setNotice(''); }}
        />
        <h4>2. Papel, dimensões e códigos</h4>
        <CredentialLabelSettings
          key={eventId}
          eventId={eventId}
          initial={context.label}
          fields={context.labelFields}
          onSaved={(message, label) => { setContext((current) => current ? { ...current, label } : current); setNotice(message); setError(''); }}
          onError={(message) => { setError(message); setNotice(''); }}
        />
      </section>}
      {(mode === 'labels' || mode === 'settings') && !organizer && <p>Somente o organizador pode configurar as etiquetas. Utilize Lista para impressão.</p>}

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
          <button type="submit">{publicDeskSearchSubmitLabel(context.event.profileCode, context.event.eventType)}</button>
        </form> : <p>Ative credenciamento, controle de acesso ou entrega de material para buscar participantes.</p>}

        {people.length > 0 && <div className={styles.participantTableScroll}>
          <table className={styles.kitTable}>
            <caption>Participantes encontrados — confira o nome antes de registrar presença ou imprimir</caption>
            <thead><tr><th scope="col">Nome do participante</th><th scope="col">Código da inscrição</th><th scope="col">Categoria</th><th scope="col">Presença</th><th scope="col">Ações</th></tr></thead>
            {people.map((person) => <tbody key={person.reservationId}>
              <tr>
                <th scope="row"><button type="button" className={styles.secondaryAction} onClick={() => {
                  invalidateSelection(); setSelectedId(person.reservationId); setError(''); setNotice('');
                }}>{person.name}</button></th>
                <td>{person.protocol}</td>
                <td>{person.category}</td>
                <td>{person.checkedInAt ? 'Presença registrada' : person.status === 'CONFIRMED' ? 'Sem presença' : (statusLabels[person.status] ?? person.status)}</td>
                <td><div className={styles.kitActions}>
                  {capabilities.has('credential') && <button type="button" disabled={!published || person.status !== 'CONFIRMED' || Boolean(busyId)}
                    onClick={() => void run(person, 'badge', { reservationId: person.reservationId }, 'Etiqueta pronta para impressão.')}>Imprimir etiqueta</button>}
                  {capabilities.has('access_control') && !person.checkedInAt && <button type="button"
                    disabled={!published || person.status !== 'CONFIRMED' || Boolean(busyId)}
                    onClick={() => void run(person, 'check-in', { reservationId: person.reservationId }, 'Presença registrada sem impressão.')}>Marcar presença</button>}
                  {capabilities.has('access_control') && person.checkedInAt && <button type="button"
                    disabled={!published || person.status !== 'CONFIRMED' || Boolean(busyId)}
                    onClick={() => { setSearchReversingId(person.reservationId); setSearchReverseReason(''); }}>Retirar presença</button>}
                </div></td>
              </tr>
              {searchReversingId === person.reservationId && <tr><td colSpan={5}>
                <div className={styles.kitActions}>
                  <label>Motivo da retirada de presença
                    <input aria-label={`Motivo para retirar presença de ${person.name}`}
                      value={searchReverseReason} minLength={3} maxLength={160}
                      onChange={(event) => setSearchReverseReason(event.target.value)} />
                  </label>
                  <button type="button" disabled={searchReverseReason.trim().length < 3 || Boolean(busyId)}
                    onClick={() => { void run(person, 'check-in/reverse', {
                      reservationId: person.reservationId, reason: searchReverseReason.trim(),
                    }, 'Presença retirada; histórico preservado.').then((succeeded) => {
                      if (succeeded) { setSearchReversingId(''); setSearchReverseReason(''); }
                    }); }}>Confirmar retirada</button>
                  <button type="button" className={styles.secondaryAction} onClick={() => {
                    setSearchReversingId(''); setSearchReverseReason('');
                  }}>Cancelar</button>
                </div>
              </td></tr>}
            </tbody>)}
          </table>
        </div>}

        {selected && <article className={styles.workspace} aria-label={publicDeskSelectedLabel(context.event.profileCode, context.event.eventType)}>
          <h3>{selected.name}</h3>
          <p>{selected.category} · {statusLabels[selected.status] ?? selected.status} · {selected.protocol}</p>
          <p>{selected.checkedInAt ? `Entrada em ${new Date(selected.checkedInAt).toLocaleString('pt-BR')}` : 'Sem entrada no evento'}</p>
          {selected.checkInReversedAt && !selected.checkedInAt && <p>A última entrada foi desfeita e continua na auditoria.</p>}
          <p>{selected.materialDeliveredAt ? `Material retirado em ${new Date(selected.materialDeliveredAt).toLocaleString('pt-BR')}${selected.deliveredSizeLabel ? ` · tamanho ${selected.deliveredSizeLabel}` : ''}` : 'Material não retirado'}</p>
          {selected.materialReversedAt && !selected.materialDeliveredAt && <p>A última retirada de material foi desfeita e continua na auditoria.</p>}
          {shirtsOn && <p>Preferência de tamanho: {selected.shirtPreference?.label ?? 'Não informada'}. A preferência não reserva estoque.</p>}
          {shirtsOn && selected.shirtPreference && !kit?.sizes.some((size) => size.id === selected.shirtPreference?.sizeId) && <p>O tamanho pedido não está mais disponível. A entrega de outro tamanho pede confirmação.</p>}
          <p>{selected.presentToday ? 'Presença de hoje marcada.' : 'Presença de hoje ainda não marcada.'}{selected.presenceDays.length > 0 ? ` Dias: ${selected.presenceDays.join(', ')}.` : ''}</p>
          {(selected.checkedInAt || selected.materialDeliveredAt || selected.presentToday) && <div>
            <label htmlFor="desk-reversal-reason">Motivo do estorno
              <input id="desk-reversal-reason" aria-describedby="desk-reversal-help" value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} minLength={3} maxLength={160} autoComplete="off" />
            </label>
            <p id="desk-reversal-help">Para habilitar os botões de desfazer, informe um motivo com 3 a 160 caracteres. O histórico será preservado.</p>
          </div>}
          <div className={styles.actions}>
            {capabilities.has('access_control') && selected.status === 'CONFIRMED' && !selected.checkedInAt && <button type="button" disabled={!published || busyId === selected.reservationId} onClick={() => void run(selected, 'check-in', { reservationId: selected.reservationId }, 'Entrada do evento registrada.')}>Registrar entrada</button>}
            {capabilities.has('access_control') && selected.status === 'CONFIRMED' && selected.checkedInAt && <button type="button" disabled={!published || busyId === selected.reservationId || reversalReason.trim().length < 3} onClick={() => void run(selected, 'check-in/reverse', { reservationId: selected.reservationId, reason: reversalReason.trim() }, 'Entrada desfeita. O registro permanece na auditoria.')}>Desfazer entrada</button>}
            {capabilities.has('credential') && selected.status === 'CONFIRMED' && <button type="button" disabled={!published || busyId === selected.reservationId} onClick={() => void run(selected, 'badge', { reservationId: selected.reservationId }, 'Credencial pronta para impressão.')}>Imprimir credencial</button>}
            {capabilities.has('material_delivery') && kit && selected.status === 'CONFIRMED' && !selected.materialDeliveredAt && !shirtsOn && <button type="button" disabled={!published || busyId === selected.reservationId} onClick={() => void run(selected, 'material', { reservationId: selected.reservationId }, 'Retirada de material registrada.')}>Registrar material</button>}
            {capabilities.has('material_delivery') && selected.status === 'CONFIRMED' && selected.materialDeliveredAt && <button type="button" disabled={!published || busyId === selected.reservationId || reversalReason.trim().length < 3} onClick={() => void run(selected, 'material/reverse', { reservationId: selected.reservationId, reason: reversalReason.trim() }, 'Retirada desfeita. O registro permanece na auditoria.')}>Desfazer material</button>}
            {capabilities.has('access_control') && selected.status === 'CONFIRMED' && !selected.presentToday && <button type="button" disabled={!published || busyId === selected.reservationId} onClick={() => void run(selected, 'day-presence', { reservationId: selected.reservationId }, 'Presença de hoje marcada.')}>Marcar presença de hoje</button>}
            {capabilities.has('access_control') && selected.status === 'CONFIRMED' && selected.presentToday && <button type="button" disabled={!published || busyId === selected.reservationId || reversalReason.trim().length < 3} onClick={() => void run(selected, 'day-presence/reverse', { reservationId: selected.reservationId, reason: reversalReason.trim() }, 'Presença de hoje desfeita. O registro permanece na auditoria.')}>Desfazer presença de hoje</button>}
            {(capabilities.has('credential') || capabilities.has('registration')) && <button type="button" disabled={!published || busyId === selected.reservationId} onClick={() => void openEdit(selected)}>Alterar cadastro</button>}
          </div>
          {kitBalanceStale === 'delivery' && <p className={styles.error} role="alert">O saldo do kit não pôde ser relido. A retirada já registrada permanece. Atualize o posto antes de outra entrega.</p>}
          {kitBalanceStale === 'reversal' && <p className={styles.error} role="alert">O saldo do kit não pôde ser relido. O estorno já registrado permanece. Atualize o posto antes de outra entrega.</p>}
          {capabilities.has('material_delivery') && shirtsOn && kit && selected.status === 'CONFIRMED' && !selected.materialDeliveredAt && <form className={styles.kit} onSubmit={(event) => {
            event.preventDefault();
            const preference = selected.shirtPreference;
            const selectedSize = kit.sizes.find((size) => size.id === deliveredSizeId) ?? null;
            if (!selectedSize || selectedSize.available <= 0) {
              setError(selectedSize
                ? 'Este tamanho está esgotado no posto. Escolha um tamanho com saldo.'
                : 'Escolha um tamanho com saldo antes de registrar a entrega.');
              return;
            }
            const changed = Boolean(preference && deliveredSizeId !== preference.sizeId);
            if (changed && !confirmSizeChange) {
              setError('Confirme a troca do tamanho solicitado antes de registrar a entrega.');
              return;
            }
            void run(selected, 'material', {
              reservationId: selected.reservationId,
              sizeId: deliveredSizeId,
              confirmSizeChange: changed && confirmSizeChange,
            }, 'Kit registrado.');
          }}>
            <label>Tamanho entregue
              <select value={deliveredSizeId} onChange={(event) => { setDeliveredSizeId(event.target.value); setConfirmSizeChange(false); setError(''); }} required>
                <option value="">Selecione</option>
                {kit.sizes.map((size) => <option key={size.id} value={size.id} disabled={size.available <= 0}>{size.available > 0 ? `${size.label} · ${size.available} disponíveis` : `${size.label} · esgotado`}</option>)}
              </select>
            </label>
            {deliveredSizeId && (kit.sizes.find((size) => size.id === deliveredSizeId)?.available ?? 0) <= 0 && <p>Este tamanho está esgotado no posto. A entrega só segue com um tamanho que ainda tem saldo.</p>}
            {selected.shirtPreference && deliveredSizeId && deliveredSizeId !== selected.shirtPreference.sizeId && <label className={styles.kitCheck}>
              <input type="checkbox" checked={confirmSizeChange} onChange={(event) => setConfirmSizeChange(event.target.checked)} />
              Confirmo a troca do tamanho solicitado
            </label>}
            <button type="submit" disabled={!published || busyId === selected.reservationId || (kit.sizes.find((size) => size.id === deliveredSizeId)?.available ?? 0) <= 0}>Registrar kit</button>
          </form>}
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
          {edit && edit.reservationId === selected.reservationId && <form ref={editFormRef} className={styles.register} onSubmit={saveEdit}>
            <h3>Alteração de cadastro</h3>
            <p>Documento, e-mail, categoria, lote e pagamento permanecem protegidos. A correção fica registrada em nome de quem opera o posto.</p>
            {edit.fields.map((field) => <DeskField key={field.code} field={field} value={editAnswers[field.code]} onChange={(next) => setEditAnswers((current) => ({ ...current, [field.code]: next }))} />)}
            {edit.fields.length === 0 && <p>Esta ficha não tem campos que o posto possa corrigir.</p>}
            <button type="submit" disabled={!published || busyId === selected.reservationId || edit.fields.length === 0}>Salvar cadastro</button>
          </form>}
        </article>}
      </>}

      {mode === 'register' && capabilities.has('registration') && <form className={styles.register} onSubmit={register}>
        <h3>{publicDeskRegisterTitle(context.event.profileCode, context.event.eventType)}</h3>
        <p>Somente lote gratuito confirma a vaga aqui. {publicRegistrationNoun(context.event.profileCode, context.event.eventType) === 'ingresso' ? 'Ingresso pago' : 'Inscrição paga'} segue na página pública, e o protocolo volta para a busca.</p>
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
        {fields.map((field) => <DeskField key={field.code} field={field} value={answers[field.code]} onChange={(next) => {
          if (field.code === 'preferred_name') preferredNameEdited.current = true;
          setAnswers((current) => updateRegistrationAnswer(current, field.code, next, preferredNameEdited.current));
        }} />)}
        <button type="submit" disabled={!published || !lot || lot.priceCents > 0}>{publicDeskFreeConfirmLabel(context.event.profileCode, context.event.eventType)}</button>
        {lot && lot.priceCents > 0 && <p>Este lote é pago. A confirmação não acontece no posto.</p>}
      </form>}
    </section>}
    {roster && <section className={styles.printSheet} aria-label={roster.title}>
      <h3>{roster.title}</h3>
      <ul>{roster.lines.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}</ul>
      <button ref={printButtonRef} type="button" onClick={() => window.print()}>Imprimir</button>
      <PrintSurface><h1>{roster.title}</h1><ul>{roster.lines.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}</ul></PrintSurface>
    </section>}
    {badge && <section className={styles.printSheet} aria-label="Credencial para impressão">
      <CredentialLabel label={badge} preview />
      <button ref={printButtonRef} type="button"
        disabled={credentialLabelLayout(badge).fitWarning}
        onClick={() => { if (!credentialLabelLayout(badge).fitWarning) window.print(); }}>
        Imprimir etiqueta
      </button>
      {!credentialLabelLayout(badge).fitWarning && <CredentialLabel label={badge} />}
    </section>}
  </div>
  <EvaScreenSupport guide="desk" additionalQuestions={[
      { question: 'Presença do dia é a mesma coisa que entrada?', answer: 'Não. A entrada registra a passagem na portaria. A presença do dia marca o calendário do evento, no fuso cadastrado.' },
      { question: 'Desfazer apaga o registro?', answer: 'Não. O estorno guarda o motivo e a hora. A pessoa deixa de constar como presente, e o histórico permanece na auditoria.' },
      { question: 'Material desfeito pode ser registrado de novo?', answer: 'Sim. A retirada deixa de valer e pode ser registrada outra vez. O motivo fica na auditoria.' },
    ]} />
  </>;
}



