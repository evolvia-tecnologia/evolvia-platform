'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ApiError, api } from '../lib/api';
import styles from './event-exhibitors.module.css';

type Tab = 'home' | 'include' | 'registrations' | 'credentials' | 'products' | 'files' | 'forms' | 'financial' | 'export' | 'messages' | 'preview';

type Summary = { companies: number; quota: number; credentials: number; credentialed: number; pending: number; printed: number };

type Company = {
  id: string;
  kind: 'EXHIBITOR' | 'PROVIDER';
  nationality: 'BRAZILIAN' | 'FOREIGN';
  document: string;
  loginEmail: string;
  legalName: string;
  tradeName: string;
  segment: string;
  booth: string;
  areaLabel: string;
  quotaExhibitor: number;
  quotaAssembler: number;
  quotaService: number;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  postalCode: string;
  street: string;
  addressNumber: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  credentialCount?: number;
};

type Credential = {
  id: string;
  companyId: string;
  companyTradeName: string;
  companyKind: 'EXHIBITOR' | 'PROVIDER';
  kind: 'EXHIBITOR' | 'ASSEMBLER' | 'SERVICE';
  nationality: 'BRAZILIAN' | 'FOREIGN';
  document: string;
  fullName: string;
  badgeName: string;
  role: string;
  phone: string;
  mobile: string;
  credentialedAt: string | null;
  printedAt: string | null;
};

type ExhibitorForm = {
  id: string;
  sortOrder: number;
  title: string;
  active: boolean;
  required: boolean;
  deadline: string | null;
  audience: 'EXHIBITOR' | 'PROVIDER' | 'BOTH';
  kind: 'CREDENTIAL' | 'REQUEST' | 'DOCUMENT';
  credentialKind: 'EXHIBITOR' | 'ASSEMBLER' | 'SERVICE' | null;
  pdfUrl: string;
  wordUrl: string;
};
type Product = { id: string; formId: string; formTitle: string; title: string; unit: string; priceCents: number; active: boolean };
type Download = { id: string; title: string; url: string };
type Order = {
  id: string;
  companyTradeName: string;
  companyKind: 'EXHIBITOR' | 'PROVIDER';
  productTitle: string;
  formTitle: string;
  unit: string;
  priceCents: number;
  quantity: number;
  status: 'REQUESTED' | 'CONFIRMED' | 'CANCELLED';
};
type Message = { id: string; companyTradeName: string; subject: string; body: string; createdAt: string };

type Home = {
  event: { id: string };
  listLimited: { companies: boolean; credentials: boolean; orders: boolean };
  canManage: boolean;
  publicPath: string | null;
  summary: { exhibitors: Summary; providers: Summary };
  companies: Company[];
  credentials: Credential[];
  forms: ExhibitorForm[];
  products: Product[];
  downloads: Download[];
  orders: Order[];
  messages: Message[];
};

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'home', label: 'Início' },
  { id: 'include', label: 'Incluir' },
  { id: 'registrations', label: 'Consultar cadastros' },
  { id: 'credentials', label: 'Consultar credenciais' },
  { id: 'forms', label: 'Configurar formulários' },
  { id: 'products', label: 'Cadastrar produtos' },
  { id: 'files', label: 'Arquivos' },
  { id: 'financial', label: 'Pedidos e valores' },
  { id: 'preview', label: 'Prévia dos formulários' },
  { id: 'export', label: 'Exportar' },
  { id: 'messages', label: 'Mensagens' },
];

const AUDIENCE_LABEL = { EXHIBITOR: 'Expositor', PROVIDER: 'Prestador de serviços', BOTH: 'Expositor e prestador' };
const FORM_KIND_LABEL = { CREDENTIAL: 'Credencial', REQUEST: 'Solicitação', DOCUMENT: 'Documento' };

const KIND_LABEL = { EXHIBITOR: 'Crachá de expositor', ASSEMBLER: 'Montador', SERVICE: 'Serviço' };
const ORDER_LABEL = { REQUESTED: 'Solicitado', CONFIRMED: 'Confirmado', CANCELLED: 'Cancelado' };

function money(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function exportOrders(orders: Order[], kind: 'EXHIBITOR' | 'PROVIDER') {
  const rows = orders.filter((order) => order.companyKind === kind);
  const lines = [
    ['Empresa', 'Formulário', 'Descrição', 'Quantidade', 'Medida', 'Valor', 'Situação'],
    ...rows.map((order) => [order.companyTradeName, order.formTitle, order.productTitle, String(order.quantity), order.unit, money(order.priceCents * order.quantity), ORDER_LABEL[order.status]]),
  ];
  const csv = lines.map((line) => line.map((cell) => `"${(/^[\s]*[=+@-]/u.test(cell) ? `\'${cell}` : cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = kind === 'EXHIBITOR' ? 'pedidos-expositor.csv' : 'pedidos-prestador.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function priceToCents(value: string): number {
  const text = value.trim();
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000) return Number.NaN;
  return Math.round(amount * 100);
}

function blankCompany(kind: 'EXHIBITOR' | 'PROVIDER'): Company {
  return {
    id: '',
    kind,
    nationality: 'BRAZILIAN',
    document: '',
    loginEmail: '',
    legalName: '',
    tradeName: '',
    segment: '',
    booth: '',
    areaLabel: '',
    quotaExhibitor: kind === 'PROVIDER' ? 0 : 2,
    quotaAssembler: 0,
    quotaService: 0,
    contactName: '',
    contactRole: '',
    contactEmail: '',
    postalCode: '',
    street: '',
    addressNumber: '',
    complement: '',
    district: '',
    city: '',
    state: '',
    country: 'Brasil',
    phone: '',
  };
}

function companyPayload(company: Company) {
  return {
    ...(company.id ? { id: company.id } : {}),
    kind: company.kind,
    nationality: company.nationality,
    document: company.document,
    loginEmail: company.loginEmail,
    legalName: company.legalName,
    tradeName: company.tradeName,
    segment: company.kind === 'PROVIDER' ? company.segment : '',
    booth: company.booth,
    areaLabel: company.areaLabel,
    quotaExhibitor: company.kind === 'PROVIDER' ? 0 : Math.trunc(Number(company.quotaExhibitor)),
    quotaAssembler: Math.trunc(Number(company.quotaAssembler)),
    quotaService: Math.trunc(Number(company.quotaService)),
    contactName: company.contactName,
    contactRole: company.contactRole,
    contactEmail: company.contactEmail,
    postalCode: company.postalCode,
    street: company.street,
    addressNumber: company.addressNumber,
    complement: company.complement,
    district: company.district,
    city: company.city,
    state: company.state,
    country: company.country,
    phone: company.phone,
  };
}

export default function EventExhibitors({ eventId }: { eventId: string }) {
  if (!eventId) return <p>Escolha um evento para abrir a área de expositores.</p>;
  return <EventExhibitorsPanel key={eventId} eventId={eventId} />;
}

function EventExhibitorsPanel({ eventId }: { eventId: string }) {
  const panelId = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const requestActive = useRef(false);
  const [busy, setBusy] = useState(false);
  const [previewAudience, setPreviewAudience] = useState<'EXHIBITOR' | 'PROVIDER'>('EXHIBITOR');
  const [orderDraft, setOrderDraft] = useState({ companyId: '', productId: '', quantity: 1 });
  const [tab, setTab] = useState<Tab>('home');
  const [home, setHome] = useState<Home | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [company, setCompany] = useState<Company | null>(null);
  const [credential, setCredential] = useState<Partial<Credential> | null>(null);
  const [product, setProduct] = useState({ id: '', formId: '', title: '', unit: 'un', price: '', active: true });
  const [formDraft, setFormDraft] = useState<ExhibitorForm | null>(null);
  const [includeKind, setIncludeKind] = useState<'EXHIBITOR' | 'PROVIDER'>('EXHIBITOR');
  const [query, setQuery] = useState('');
  const [queryField, setQueryField] = useState<'NAME' | 'EMAIL' | 'DOCUMENT' | 'COMPANY' | 'CITY' | 'STATE'>('COMPANY');
  const [queryKind, setQueryKind] = useState<'ALL' | 'EXHIBITOR' | 'PROVIDER'>('EXHIBITOR');
  const [download, setDownload] = useState({ id: '', title: '', url: '' });
  const [credentialFilter, setCredentialFilter] = useState('');
  const [credentialKind, setCredentialKind] = useState('ALL');

  const load = useCallback(async () => {
    const result = await api<Home>(`/events/${eventId}/exhibitor`);
    if (result.event.id !== eventId) throw new Error('Não foi possível abrir a central deste evento.');
    setHome(result);
  }, [eventId]);

  useEffect(() => {
    let active = true;
    api<Home>(`/events/${eventId}/exhibitor`)
      .then((result) => { if (!active) return; if (result.event.id !== eventId) throw new Error('Não foi possível abrir a central deste evento.'); setHome(result); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a central.'); });
    return () => { active = false; };
  }, [eventId]);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function run(action: () => Promise<void>) {
    if (requestActive.current) return;
    requestActive.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError || reason instanceof Error ? reason.message : 'Não foi possível salvar.');
    } finally {
      requestActive.current = false;
      setBusy(false);
    }
  }

  if (!home && !error) return <p className={styles.loading} role="status">A EVA está abrindo a central do expositor...</p>;
  if (!home) return <div><p ref={errorRef} tabIndex={-1} className={styles.error} role="alert">{error}</p><button className={styles.secondary} type="button" onClick={() => { setError(''); void load().catch(() => setError('Não foi possível abrir a central. Tente novamente.')); }}>Tentar novamente</button><a href={`/eventos/${eventId}/configuracao?review=foundation`}>Revisar recursos do evento</a></div>;

  const visibleCredentials = home.credentials.filter((item) => {
    const text = `${item.fullName} ${item.badgeName} ${item.companyTradeName}`.toLowerCase();
    const matchesText = text.includes(credentialFilter.trim().toLowerCase());
    const matchesKind = credentialKind === 'ALL' || item.kind === credentialKind;
    return matchesText && matchesKind;
  });

  return <section className={styles.panel} aria-busy={busy}>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>Operação</p>
      <h1>Expositor e serviços</h1>
      <p>Organize empresas e prestadores, cotas de credenciais, formulários, documentos e pedidos deste evento.</p>
    </header>
    {error && <p ref={errorRef} tabIndex={-1} className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.tabs} role="tablist" aria-label="Central do expositor">
      {TABS.map((item, index) => <button key={item.id} id={`${panelId}-tab-${item.id}`} aria-controls={`${panelId}-content`} tabIndex={tab === item.id ? 0 : -1} className={tab === item.id ? styles.tabActive : styles.tab} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} onKeyDown={(event) => {
        const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); setTab(TABS[next].id); document.getElementById(`${panelId}-tab-${TABS[next].id}`)?.focus();
      }}>{item.label}</button>)}
    </div>

    <fieldset className={styles.contentFieldset} disabled={busy}><div id={`${panelId}-content`} role="tabpanel" aria-labelledby={`${panelId}-tab-${tab}`} tabIndex={0}>
    {tab === 'home' && <div className={styles.stack}>
      <div className={styles.metrics}>
        <Metric title="Expositores" summary={home.summary.exhibitors} />
        <Metric title="Prestadores" summary={home.summary.providers} />
      </div>
      <p className={styles.note}>A central administrativa está disponível. O acesso externo da empresa aguarda validação de identidade.</p>
      {(home.listLimited.companies || home.listLimited.credentials || home.listLimited.orders) && <p role="status" className={styles.note}>As listas exibem um recorte do evento. Os indicadores consideram os totais. A exportação fica bloqueada quando a lista de pedidos atinge o limite.</p>}
    </div>}

    {tab === 'include' && <div className={styles.stack}>
      <div className={styles.tabs} role="group" aria-label="Tipo de cadastro">
        <button className={includeKind === 'EXHIBITOR' ? styles.tabActive : styles.tab} type="button" onClick={() => setIncludeKind('EXHIBITOR')}>Expositor</button>
        <button className={includeKind === 'PROVIDER' ? styles.tabActive : styles.tab} type="button" onClick={() => setIncludeKind('PROVIDER')}>Prestador de serviços</button>
      </div>
      <CompanyDesk
        kind={includeKind}
        companies={home.companies.filter((item) => item.kind === includeKind)}
        canManage={home.canManage}
        draft={company}
        onDraft={setCompany}
        onSave={(next) => run(async () => {
          await api(`/events/${eventId}/exhibitor/companies`, { method: 'POST', body: JSON.stringify(companyPayload(next)) });
          setCompany(null);
          setNotice('Empresa salva.');
        })}
      />
    </div>}

    {tab === 'registrations' && <div className={styles.stack}>
      <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
        <label className={styles.field}>Digite o texto<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <fieldset className={styles.filters}>
          <legend>Campo</legend>
          {([
            ['COMPANY', 'Empresa'],
            ['NAME', 'Nome'],
            ['EMAIL', 'E-mail'],
            ['DOCUMENT', 'Documento'],
            ['CITY', 'Cidade'],
            ['STATE', 'UF'],
          ] as const).map(([value, label]) => <label key={value} className={styles.check}><input type="radio" name="query-field" checked={queryField === value} onChange={() => setQueryField(value)} /> {label}</label>)}
        </fieldset>
        <label className={styles.field}>Tipo de cadastro
          <select value={queryKind} onChange={(event) => setQueryKind(event.target.value as 'ALL' | 'EXHIBITOR' | 'PROVIDER')}>
            <option value="EXHIBITOR">Expositor</option>
            <option value="PROVIDER">Prestador de serviços</option>
            <option value="ALL">Todos</option>
          </select>
        </label>
      </form>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Lista com rolagem horizontal">
        <table>
          <caption>Empresas cadastradas</caption>
          <thead><tr><th scope="col">Tipo</th><th scope="col">Razão social</th><th scope="col">Nome fantasia</th><th scope="col">Documento</th><th scope="col">Cidade</th><th scope="col">UF</th></tr></thead>
          <tbody>
            {home.companies.filter((item) => {
              if (queryKind !== 'ALL' && item.kind !== queryKind) return false;
              const needle = query.trim().toLowerCase();
              if (!needle) return true;
              const value = {
                NAME: item.contactName,
                EMAIL: `${item.loginEmail} ${item.contactEmail}`,
                DOCUMENT: item.document,
                COMPANY: `${item.legalName} ${item.tradeName}`,
                CITY: item.city,
                STATE: item.state,
              }[queryField];
              return value.toLowerCase().includes(needle);
            }).map((item) => <tr key={item.id}>
              <td>{item.kind === 'PROVIDER' ? 'Prestador de serviços' : 'Expositor'}</td>
              <td>{item.legalName}</td>
              <td>{item.tradeName}</td>
              <td>{item.document}</td>
              <td>{item.city}</td>
              <td>{item.state}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>}

    {tab === 'credentials' && <div className={styles.stack}>
      <div className={styles.filters}>
        <label className={styles.field}>Nome ou empresa
          <input value={credentialFilter} onChange={(event) => setCredentialFilter(event.target.value)} />
        </label>
        <label className={styles.field}>Tipo
          <select value={credentialKind} onChange={(event) => setCredentialKind(event.target.value)}>
            <option value="ALL">Todos</option>
            <option value="EXHIBITOR">Crachá de expositor</option>
            <option value="ASSEMBLER">Montador</option>
            <option value="SERVICE">Serviço</option>
          </select>
        </label>
      </div>
      {home.canManage && <button className={styles.primary} type="button" onClick={() => setCredential({ companyId: home.companies[0]?.id ?? '', kind: 'EXHIBITOR', nationality: 'BRAZILIAN' })}>Adicionar credencial</button>}
      {credential && home.canManage && <CredentialForm
        companies={home.companies}
        value={credential}
        onChange={setCredential}
        onCancel={() => setCredential(null)}
        onSave={() => run(async () => {
          await api(`/events/${eventId}/exhibitor/credentials`, {
            method: 'POST',
            body: JSON.stringify({
              ...(credential.id ? { id: credential.id } : {}),
              companyId: credential.companyId,
              kind: credential.kind,
              nationality: credential.nationality,
              document: credential.document ?? '',
              fullName: credential.fullName ?? '',
              badgeName: credential.badgeName ?? '',
              role: credential.role ?? '',
              phone: credential.phone ?? '',
              mobile: credential.mobile ?? '',
            }),
          });
          setCredential(null);
          setNotice('Credencial salva.');
        })}
      />}
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Lista com rolagem horizontal">
        <table>
          <caption>Credenciais do evento</caption>
          <thead><tr><th scope="col">Tipo</th><th scope="col">Empresa</th><th scope="col">Nome</th><th scope="col">Crachá</th><th scope="col">Cargo</th><th scope="col">Credenciado</th><th scope="col">Impresso</th><th scope="col">Ações</th></tr></thead>
          <tbody>
            {visibleCredentials.length === 0 && <tr><td colSpan={8}>Nenhuma credencial encontrada para estes filtros.</td></tr>}
            {visibleCredentials.map((item) => <tr key={item.id}>
              <td>{KIND_LABEL[item.kind]}</td>
              <td>{item.companyTradeName}</td>
              <td>{item.fullName}</td>
              <td>{item.badgeName}</td>
              <td>{item.role}</td>
              <td>{item.credentialedAt ? 'Sim' : 'Não'}</td>
              <td>{item.printedAt ? 'Sim' : 'Não'}</td>
              <td className={styles.actions}>
                {home.canManage && <button className={styles.secondary} type="button" onClick={() => { setCredential(item); }}>Editar</button>}
                <button className={styles.secondary} type="button" onClick={() => run(async () => {
                  await api(`/events/${eventId}/exhibitor/credentials/${item.id}/attendance`, {
                    method: 'POST',
                    body: JSON.stringify({ credentialed: !item.credentialedAt, printed: Boolean(item.printedAt) }),
                  });
                  setNotice(item.credentialedAt ? 'Baixa removida.' : 'Pessoa credenciada.');
                })}>{item.credentialedAt ? 'Tirar baixa' : 'Credenciar'}</button>
                <button className={styles.secondary} type="button" onClick={() => run(async () => {
                  await api(`/events/${eventId}/exhibitor/credentials/${item.id}/attendance`, {
                    method: 'POST',
                    body: JSON.stringify({ credentialed: Boolean(item.credentialedAt), printed: !item.printedAt }),
                  });
                  setNotice(item.printedAt ? 'Impressão desmarcada.' : 'Crachá marcado como impresso.');
                })}>{item.printedAt ? 'Desmarcar impressão' : 'Marcar impresso'}</button>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>}

    {tab === 'forms' && <div className={styles.stack}>
      <p className={styles.note}>Configure o público, o prazo e a obrigatoriedade de cada formulário. Confira a apresentação em Prévia dos formulários. PDF e Word são links https.</p>
      {home.canManage && <button className={styles.primary} type="button" onClick={() => setFormDraft({
        id: '', sortOrder: home.forms.length + 1, title: '', active: true, required: false, deadline: null, audience: 'EXHIBITOR', kind: 'REQUEST', credentialKind: null, pdfUrl: '', wordUrl: '',
      })}>Novo formulário</button>}
      {formDraft && home.canManage && <form className={styles.form} onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          await api(`/events/${eventId}/exhibitor/forms`, {
            method: 'POST',
            body: JSON.stringify({
              ...(formDraft.id ? { id: formDraft.id } : {}),
              sortOrder: Math.trunc(Number(formDraft.sortOrder)),
              title: formDraft.title,
              active: formDraft.active,
              required: formDraft.required,
              deadline: formDraft.deadline || null,
              audience: formDraft.audience,
              kind: formDraft.kind,
              credentialKind: formDraft.kind === 'CREDENTIAL' ? formDraft.credentialKind : null,
              pdfUrl: formDraft.pdfUrl,
              wordUrl: formDraft.wordUrl,
            }),
          });
          setFormDraft(null);
          setNotice('Formulário salvo.');
        });
      }}>
        <label className={styles.field}>Ordenação<input type="number" min={1} max={999} value={formDraft.sortOrder} onChange={(event) => setFormDraft({ ...formDraft, sortOrder: Number(event.target.value) })} required /></label>
        <label className={styles.field}>Descrição<input value={formDraft.title} onChange={(event) => setFormDraft({ ...formDraft, title: event.target.value })} required /></label>
        <label className={styles.field}>Público
          <select value={formDraft.audience} onChange={(event) => setFormDraft({ ...formDraft, audience: event.target.value as ExhibitorForm['audience'] })}>
            <option value="EXHIBITOR">Expositor</option>
            <option value="PROVIDER">Prestador de serviços</option>
            <option value="BOTH">Expositor e prestador</option>
          </select>
        </label>
        <label className={styles.field}>Tipo
          <select value={formDraft.kind} onChange={(event) => setFormDraft({ ...formDraft, kind: event.target.value as ExhibitorForm['kind'] })}>
            <option value="CREDENTIAL">Credencial</option>
            <option value="REQUEST">Solicitação</option>
            <option value="DOCUMENT">Documento</option>
          </select>
        </label>
        {formDraft.kind === 'CREDENTIAL' && <label className={styles.field}>Crachá deste formulário
          <select value={formDraft.credentialKind ?? ''} onChange={(event) => setFormDraft({ ...formDraft, credentialKind: (event.target.value || null) as ExhibitorForm['credentialKind'] })}>
            <option value="">Todos os tipos da cota</option>
            <option value="EXHIBITOR">Crachá de expositor</option>
            <option value="ASSEMBLER">Montador</option>
            <option value="SERVICE">Serviço</option>
          </select>
        </label>}
        <label className={styles.check}><input type="checkbox" checked={formDraft.active} onChange={(event) => setFormDraft({ ...formDraft, active: event.target.checked })} /> Ativo</label>
        <label className={styles.check}><input type="checkbox" checked={formDraft.required} onChange={(event) => setFormDraft({ ...formDraft, required: event.target.checked })} /> Obrigatório</label>
        <label className={styles.field}>Prazo<input type="date" value={formDraft.deadline ?? ''} onChange={(event) => setFormDraft({ ...formDraft, deadline: event.target.value || null })} /></label>
        <label className={styles.field}>Link do PDF<input type="url" value={formDraft.pdfUrl} onChange={(event) => setFormDraft({ ...formDraft, pdfUrl: event.target.value })} /></label>
        <label className={styles.field}>Link do Word<input type="url" value={formDraft.wordUrl} onChange={(event) => setFormDraft({ ...formDraft, wordUrl: event.target.value })} /></label>
        <div className={styles.actions}>
          <button className={styles.primary} type="submit">Salvar formulário</button>
          <button className={styles.secondary} type="button" onClick={() => setFormDraft(null)}>Cancelar</button>
        </div>
      </form>}
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Lista com rolagem horizontal">
        <table>
          <caption>Formulários configurados</caption>
          <thead><tr><th scope="col">Ordenação</th><th scope="col">Descrição</th><th scope="col">Público</th><th scope="col">Tipo</th><th scope="col">Ativo</th><th scope="col">Obrigatório</th><th scope="col">Prazo</th><th scope="col">PDF</th><th scope="col">Word</th><th scope="col"></th></tr></thead>
          <tbody>
            {home.forms.length === 0 && <tr><td colSpan={10}>Nenhum formulário cadastrado. Use Novo formulário para começar.</td></tr>}
            {home.forms.map((item) => <tr key={item.id}>
              <td>{item.sortOrder}</td>
              <td>{item.title}</td>
              <td>{AUDIENCE_LABEL[item.audience]}</td>
              <td>{FORM_KIND_LABEL[item.kind]}</td>
              <td>{item.active ? 'Sim' : 'Não'}</td>
              <td>{item.required ? 'Sim' : 'Não'}</td>
              <td>{item.deadline ? item.deadline.split('-').reverse().join('/') : '—'}</td>
              <td>{item.pdfUrl ? <a href={item.pdfUrl} rel="noopener noreferrer">Visualizar</a> : '—'}</td>
              <td>{item.wordUrl ? <a href={item.wordUrl} rel="noopener noreferrer">Visualizar</a> : '—'}</td>
              <td>{home.canManage && <button className={styles.secondary} type="button" onClick={() => setFormDraft(item)}>Editar</button>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>}

    {tab === 'products' && <div className={styles.stack}>
      <p className={styles.note}>O produto entra num formulário de solicitação já configurado. A confirmação não emite boleto.</p>
      {home.canManage && <form className={styles.form} onSubmit={(event) => {
        event.preventDefault();
        const priceCents = priceToCents(product.price);
        if (!Number.isInteger(priceCents)) { setError('Informe o valor em reais.'); return; }
        void run(async () => {
          await api(`/events/${eventId}/exhibitor/products`, {
            method: 'POST',
            body: JSON.stringify({
              ...(product.id ? { id: product.id } : {}),
              formId: product.formId,
              title: product.title,
              unit: product.unit,
              priceCents,
              active: product.active,
            }),
          });
          setProduct({ id: '', formId: '', title: '', unit: 'un', price: '', active: true });
          setNotice('Produto salvo.');
        });
      }}>
        <label className={styles.field}>Formulário
          <select value={product.formId} onChange={(event) => setProduct({ ...product, formId: event.target.value })} required>
            <option value="">Selecione</option>
            {home.forms.filter((item) => item.kind === 'REQUEST').map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <label className={styles.field}>Descrição<input value={product.title} onChange={(event) => setProduct({ ...product, title: event.target.value })} required /></label>
        <label className={styles.field}>Medida<input value={product.unit} onChange={(event) => setProduct({ ...product, unit: event.target.value })} required /></label>
        <label className={styles.field}>Valor (R$)<input value={product.price} onChange={(event) => setProduct({ ...product, price: event.target.value })} inputMode="decimal" required /></label>
        <label className={styles.check}><input type="checkbox" checked={product.active} onChange={(event) => setProduct({ ...product, active: event.target.checked })} /> Disponível para solicitação</label>
        <button className={styles.primary} type="submit">Salvar produto</button>
      </form>}
      <ul className={styles.list}>
        {home.products.length === 0 && <li>Nenhum produto cadastrado. Configure um formulário de solicitação e cadastre o produto.</li>}
        {home.products.map((item) => <li key={item.id}>
          <strong>{item.formTitle}</strong> — {item.title} · {item.unit} · {money(item.priceCents)} · {item.active ? 'Disponível' : 'Oculto'}
          {home.canManage && <button className={styles.secondary} type="button" onClick={() => setProduct({
            id: item.id, formId: item.formId, title: item.title, unit: item.unit, price: (item.priceCents / 100).toFixed(2).replace('.', ','), active: item.active,
          })}>Editar</button>}
        </li>)}
      </ul>
    </div>}

    {tab === 'preview' && <div className={styles.stack}>
      <h2>Prévia dos formulários</h2>
      <p className={styles.note}>Prévia administrativa dos formulários ativos. Este acesso não abre uma sessão de empresa nem envia solicitações.</p>
      <label className={styles.field}>Público da prévia<select value={previewAudience} onChange={(event) => setPreviewAudience(event.target.value as 'EXHIBITOR' | 'PROVIDER')}>
        <option value="EXHIBITOR">Expositor</option><option value="PROVIDER">Prestador de serviços</option>
      </select></label>
      <ul className={styles.list}>
        {!home.forms.some((item) => item.active && (item.audience === 'BOTH' || item.audience === previewAudience)) && <li>Nenhum formulário ativo para este público.</li>}
        {home.forms.filter((item) => item.active && (item.audience === 'BOTH' || item.audience === previewAudience)).map((item) => <li key={item.id}>
          <h3>{item.title}</h3><p>{FORM_KIND_LABEL[item.kind]} · {item.required ? 'Obrigatório' : 'Opcional'} · {item.deadline ? `Prazo: ${item.deadline.split('-').reverse().join('/')}` : 'Sem prazo definido'}</p>
          {item.pdfUrl && <a href={item.pdfUrl} rel="noopener noreferrer">Abrir PDF de {item.title}</a>}
          {item.wordUrl && <a href={item.wordUrl} rel="noopener noreferrer">Abrir Word de {item.title}</a>}
        </li>)}
      </ul>
    </div>}

    {tab === 'financial' && <div className={styles.stack}>
      <h2>Pedidos e valores</h2>
      <p className={styles.note}>Registre e acompanhe solicitações de serviços. Confirmar um pedido não registra pagamento, não cobra e não emite nota.</p>
      <form className={styles.form} onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          await api(`/events/${eventId}/exhibitor/orders`, { method: 'POST', body: JSON.stringify(orderDraft) });
          setOrderDraft({ companyId: '', productId: '', quantity: 1 });
          setNotice('Solicitação registrada. Nenhum pagamento foi realizado.');
        });
      }}>
        <label className={styles.field}>Empresa do pedido<select value={orderDraft.companyId} onChange={(event) => setOrderDraft({ ...orderDraft, companyId: event.target.value })} required>
          <option value="">Selecione</option>{home.companies.map((item) => <option key={item.id} value={item.id}>{item.tradeName}</option>)}
        </select></label>
        <label className={styles.field}>Produto ou serviço<select value={orderDraft.productId} onChange={(event) => setOrderDraft({ ...orderDraft, productId: event.target.value })} required>
          <option value="">Selecione</option>{home.products.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.title} · {money(item.priceCents)}</option>)}
        </select></label>
        <label className={styles.field}>Quantidade<input type="number" min={1} max={999} value={orderDraft.quantity} onChange={(event) => setOrderDraft({ ...orderDraft, quantity: Number(event.target.value) })} required /></label>
        <button className={styles.primary} type="submit">Registrar solicitação</button>
      </form>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Lista com rolagem horizontal">
      <table>
          <caption>Pedidos de serviços</caption>
        <thead><tr><th scope="col">Empresa</th><th scope="col">Formulário</th><th scope="col">Descrição</th><th scope="col">Quantidade</th><th scope="col">Valor</th><th scope="col">Situação</th></tr></thead>
        <tbody>
          {home.orders.length === 0 && <tr><td colSpan={6}>Nenhum pedido registrado neste evento.</td></tr>}
          {home.orders.map((order) => <tr key={order.id}>
            <td>{order.companyTradeName}</td>
            <td>{order.formTitle}</td>
            <td>{order.productTitle}</td>
            <td>{order.quantity} {order.unit}</td>
            <td>{money(order.priceCents * order.quantity)}</td>
            <td>{home.canManage && order.status !== 'CANCELLED' ? <select aria-label={`Situação de ${order.productTitle} para ${order.companyTradeName}`} value={order.status} onChange={(event) => run(async () => {
              await api(`/events/${eventId}/exhibitor/orders/${order.id}/status`, { method: 'POST', body: JSON.stringify({ status: event.target.value }) });
              setNotice('Situação do pedido atualizada.');
            })}>
              {order.status === 'REQUESTED' && <option value="REQUESTED">Solicitado</option>}
              <option value="CONFIRMED">Confirmado</option>
              <option value="CANCELLED">Cancelado</option>
            </select> : ORDER_LABEL[order.status]}</td>
          </tr>)}
        </tbody>
      </table>
      </div>
    </div>}

    {tab === 'export' && <div className={styles.stack}>
      {home.listLimited.orders && <p role="status">Exportação indisponível: a lista atingiu o limite. Não será gerado um relatório incompleto.</p>}
      <p className={styles.note}>A exportação separa os pedidos do expositor e os pedidos do prestador de serviços.</p>
      <div className={styles.actions}>
        <button className={styles.primary} type="button" disabled={home.listLimited.orders} onClick={() => exportOrders(home.orders, 'EXHIBITOR')}>Pedidos do expositor</button>
        <button className={styles.primary} type="button" disabled={home.listLimited.orders} onClick={() => exportOrders(home.orders, 'PROVIDER')}>Pedidos do prestador de serviços</button>
      </div>
    </div>}

    {tab === 'files' && <div className={styles.stack}>
      <p className={styles.note}>O arquivo fica em um link https público. O servidor não recebe o arquivo.</p>
      {home.canManage && <form className={styles.form} onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          await api(`/events/${eventId}/exhibitor/downloads`, {
            method: 'POST',
            body: JSON.stringify({ ...(download.id ? { id: download.id } : {}), title: download.title, url: download.url }),
          });
          setDownload({ id: '', title: '', url: '' });
          setNotice('Download salvo.');
        });
      }}>
        <label className={styles.field}>Descrição<input value={download.title} onChange={(event) => setDownload({ ...download, title: event.target.value })} required /></label>
        <label className={styles.field}>Link https<input value={download.url} onChange={(event) => setDownload({ ...download, url: event.target.value })} type="url" pattern="https://.*" required /></label>
        <button className={styles.primary} type="submit">Salvar link</button>
      </form>}
      <ul className={styles.list}>
        {home.downloads.length === 0 && <li>Nenhum documento publicado.</li>}
        {home.downloads.map((item) => <li key={item.id}><a href={item.url} rel="noopener noreferrer">{item.title}</a></li>)}
      </ul>
    </div>}

    {tab === 'messages' && <ul className={styles.list}>
      {home.messages.length === 0 && <li>Nenhuma mensagem da área da empresa.</li>}
      {home.messages.map((message) => <li key={message.id}>
        <strong>{message.companyTradeName}</strong> — {message.subject}
        <p>{message.body}</p>
        <small>{new Date(message.createdAt).toLocaleString('pt-BR')}</small>
      </li>)}
    </ul>}
    </div></fieldset>
  </section>;
}

function Metric({ title, summary }: { title: string; summary: Summary }) {
  const percent = summary.quota > 0 ? Math.min(100, Math.round((summary.credentialed / summary.quota) * 100)) : 0;
  return <article className={styles.metric}>
    <h2>{title}</h2>
    <p><strong>{summary.companies}</strong> empresas</p>
    <p>{summary.credentials} credenciais · {summary.credentialed} credenciadas · {summary.pending} pendentes · {summary.printed} impressas</p>
    <p>Cota {summary.quota} · {percent}% credenciado</p>
  </article>;
}

function CompanyDesk({
  kind, companies, canManage, draft, onDraft, onSave,
}: {
  kind: 'EXHIBITOR' | 'PROVIDER';
  companies: Company[];
  canManage: boolean;
  draft: Company | null;
  onDraft: (company: Company | null) => void;
  onSave: (company: Company) => void;
}) {
  const editing = draft?.kind === kind ? draft : null;
  return <div className={styles.stack}>
    {canManage && <button className={styles.primary} type="button" onClick={() => onDraft(blankCompany(kind))}>{kind === 'PROVIDER' ? 'Adicionar prestador' : 'Adicionar expositor'}</button>}
    {editing && <CompanyForm company={editing} onChange={(next) => onDraft(next)} onCancel={() => onDraft(null)} onSave={() => onSave(editing)} />}
    <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Lista com rolagem horizontal">
      <table>
          <caption>Empresas e cotas</caption>
        <thead><tr><th scope="col">Razão social</th><th scope="col">Nome fantasia</th><th scope="col">Documento</th><th scope="col">{kind === 'PROVIDER' ? 'Segmento' : 'Estande'}</th><th scope="col">Cotas</th><th scope="col"></th></tr></thead>
        <tbody>
          {companies.length === 0 && <tr><td colSpan={6}>Nenhuma empresa cadastrada neste público.</td></tr>}
          {companies.map((item) => <tr key={item.id}>
            <td>{item.legalName}</td>
            <td>{item.tradeName}</td>
            <td>{item.document}</td>
            <td>{kind === 'PROVIDER' ? item.segment : item.booth}</td>
            <td>{item.quotaExhibitor}/{item.quotaAssembler}/{item.quotaService}</td>
            <td>{canManage && <button className={styles.secondary} type="button" onClick={() => onDraft(item)}>Editar</button>}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}

function CompanyForm({ company, onChange, onCancel, onSave }: { company: Company; onChange: (company: Company) => void; onCancel: () => void; onSave: () => void }) {
  function set<K extends keyof Company>(key: K, value: Company[K]) {
    onChange({ ...company, [key]: value });
  }
  return <form className={styles.form} onSubmit={(event) => { event.preventDefault(); onSave(); }}>
    <label className={styles.field}>Nacionalidade
      <select value={company.nationality} onChange={(event) => set('nationality', event.target.value as Company['nationality'])}>
        <option value="BRAZILIAN">Empresa brasileira</option>
        <option value="FOREIGN">Empresa estrangeira</option>
      </select>
    </label>
    <label className={styles.field}>{company.nationality === 'BRAZILIAN' ? 'CNPJ' : 'Documento estrangeiro'}
      <input value={company.document} onChange={(event) => set('document', event.target.value)} required />
    </label>
    <label className={styles.field}>E-mail de acesso<input type="email" value={company.loginEmail} onChange={(event) => set('loginEmail', event.target.value)} required /></label>
    <label className={styles.field}>Razão social<input value={company.legalName} onChange={(event) => set('legalName', event.target.value)} required /></label>
    <label className={styles.field}>Nome fantasia<input value={company.tradeName} onChange={(event) => set('tradeName', event.target.value)} required /></label>
    {company.kind === 'PROVIDER' && <label className={styles.field}>Segmento<input value={company.segment} onChange={(event) => set('segment', event.target.value)} required /></label>}
    {company.kind === 'EXHIBITOR' && <>
      <label className={styles.field}>Estande<input value={company.booth} onChange={(event) => set('booth', event.target.value)} /></label>
      <label className={styles.field}>Metragem<input value={company.areaLabel} onChange={(event) => set('areaLabel', event.target.value)} /></label>
      <label className={styles.field}>Cota de crachá de expositor<input type="number" min={0} max={999} value={company.quotaExhibitor} onChange={(event) => set('quotaExhibitor', Number(event.target.value))} /></label>
    </>}
    <label className={styles.field}>Cota de montador<input type="number" min={0} max={999} value={company.quotaAssembler} onChange={(event) => set('quotaAssembler', Number(event.target.value))} /></label>
    <label className={styles.field}>Cota de serviço<input type="number" min={0} max={999} value={company.quotaService} onChange={(event) => set('quotaService', Number(event.target.value))} /></label>
    <label className={styles.field}>Nome do contato<input value={company.contactName} onChange={(event) => set('contactName', event.target.value)} required /></label>
    <label className={styles.field}>Cargo do contato<input value={company.contactRole} onChange={(event) => set('contactRole', event.target.value)} required /></label>
    <label className={styles.field}>E-mail do contato<input type="email" value={company.contactEmail} onChange={(event) => set('contactEmail', event.target.value)} required /></label>
    <label className={styles.field}>Telefone<input value={company.phone} onChange={(event) => set('phone', event.target.value)} /></label>
    <label className={styles.field}>CEP<input value={company.postalCode} onChange={(event) => set('postalCode', event.target.value)} /></label>
    <label className={styles.field}>Logradouro<input value={company.street} onChange={(event) => set('street', event.target.value)} /></label>
    <label className={styles.field}>Número<input value={company.addressNumber} onChange={(event) => set('addressNumber', event.target.value)} /></label>
    <label className={styles.field}>Complemento<input value={company.complement} onChange={(event) => set('complement', event.target.value)} /></label>
    <label className={styles.field}>Bairro<input value={company.district} onChange={(event) => set('district', event.target.value)} /></label>
    <label className={styles.field}>Cidade<input value={company.city} onChange={(event) => set('city', event.target.value)} /></label>
    <label className={styles.field}>UF<input value={company.state} onChange={(event) => set('state', event.target.value)} /></label>
    <label className={styles.field}>País<input value={company.country} onChange={(event) => set('country', event.target.value)} /></label>
    <div className={styles.actions}>
      <button className={styles.primary} type="submit">Salvar empresa</button>
      <button className={styles.secondary} type="button" onClick={onCancel}>Cancelar</button>
    </div>
  </form>;
}

function CredentialForm({
  companies, value, onChange, onCancel, onSave,
}: {
  companies: Company[];
  value: Partial<Credential>;
  onChange: (value: Partial<Credential>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return <form className={styles.form} onSubmit={(event) => { event.preventDefault(); onSave(); }}>
    <label className={styles.field}>Empresa
      <select value={value.companyId ?? ''} onChange={(event) => onChange({ ...value, companyId: event.target.value })} required>
        <option value="">Selecione</option>
        {companies.map((item) => <option key={item.id} value={item.id}>{item.tradeName}</option>)}
      </select>
    </label>
    <label className={styles.field}>Tipo
      <select value={value.kind ?? 'EXHIBITOR'} onChange={(event) => onChange({ ...value, kind: event.target.value as Credential['kind'] })}>
        <option value="EXHIBITOR">Crachá de expositor</option>
        <option value="ASSEMBLER">Montador</option>
        <option value="SERVICE">Serviço</option>
      </select>
    </label>
    <label className={styles.field}>Nacionalidade
      <select value={value.nationality ?? 'BRAZILIAN'} onChange={(event) => onChange({ ...value, nationality: event.target.value as Credential['nationality'] })}>
        <option value="BRAZILIAN">Brasileiro</option>
        <option value="FOREIGN">Estrangeiro</option>
      </select>
    </label>
    <label className={styles.field}>{value.nationality === 'FOREIGN' ? 'Passaporte' : 'CPF'}
      <input value={value.document ?? ''} onChange={(event) => onChange({ ...value, document: event.target.value })} required />
    </label>
    <label className={styles.field}>Nome completo<input value={value.fullName ?? ''} onChange={(event) => onChange({ ...value, fullName: event.target.value })} required /></label>
    <label className={styles.field}>Nome no crachá<input value={value.badgeName ?? ''} onChange={(event) => onChange({ ...value, badgeName: event.target.value })} required /></label>
    <label className={styles.field}>Cargo<input value={value.role ?? ''} onChange={(event) => onChange({ ...value, role: event.target.value })} required /></label>
    <label className={styles.field}>Telefone<input value={value.phone ?? ''} onChange={(event) => onChange({ ...value, phone: event.target.value })} /></label>
    <label className={styles.field}>Celular<input value={value.mobile ?? ''} onChange={(event) => onChange({ ...value, mobile: event.target.value })} /></label>
    <div className={styles.actions}>
      <button className={styles.primary} type="submit">Salvar credencial</button>
      <button className={styles.secondary} type="button" onClick={onCancel}>Cancelar</button>
    </div>
  </form>;
}

