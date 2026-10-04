'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import styles from './event-exhibitors.module.css';

type Tab = 'home' | 'include' | 'registrations' | 'credentials' | 'products' | 'files' | 'forms' | 'financial' | 'export' | 'messages';

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
  { id: 'financial', label: 'Financeiro' },
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
    setHome(result);
  }, [eventId]);

  useEffect(() => {
    let active = true;
    api<Home>(`/events/${eventId}/exhibitor`)
      .then((result) => { if (active) setHome(result); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a central.'); });
    return () => { active = false; };
  }, [eventId]);

  async function run(action: () => Promise<void>) {
    setError('');
    setNotice('');
    try {
      await action();
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError || reason instanceof Error ? reason.message : 'Não foi possível salvar.');
    }
  }

  if (!home && !error) return <p className={styles.loading}>A EVA está abrindo a central do expositor...</p>;
  if (!home) return <p className={styles.error} role="alert">{error}</p>;

  const visibleCredentials = home.credentials.filter((item) => {
    const text = `${item.fullName} ${item.badgeName} ${item.companyTradeName}`.toLowerCase();
    const matchesText = text.includes(credentialFilter.trim().toLowerCase());
    const matchesKind = credentialKind === 'ALL' || item.kind === credentialKind;
    return matchesText && matchesKind;
  });

  return <section className={styles.panel}>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>Operação</p>
      <h1>Expositor e serviços</h1>
      <p>Este menu cria o que aparece para o expositor e para o prestador de serviços. O formulário ativo, com prazo e obrigatoriedade, é o que a empresa encontra na área dela. O arquivo fica em um link https.</p>
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.tabs} role="tablist" aria-label="Central do expositor">
      {TABS.map((item) => <button key={item.id} className={tab === item.id ? styles.tabActive : styles.tab} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </div>

    {tab === 'home' && <div className={styles.stack}>
      <div className={styles.metrics}>
        <Metric title="Expositores" summary={home.summary.exhibitors} />
        <Metric title="Prestadores" summary={home.summary.providers} />
      </div>
      <p className={styles.note}>{home.publicPath
        ? <>Área da empresa: <a href={home.publicPath}>{home.publicPath}</a>. Ela abre com o evento publicado.</>
        : 'A área da empresa abre quando o evento estiver publicado.'}</p>
      {!home.canManage && <p className={styles.note}>Este acesso marca credenciado e impresso. Cadastro, cota, formulário e download ficam com a organização.</p>}
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
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Tipo</th><th>Razão social</th><th>Nome fantasia</th><th>Documento</th><th>Cidade</th><th>UF</th></tr></thead>
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
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Tipo</th><th>Empresa</th><th>Nome</th><th>Crachá</th><th>Cargo</th><th>Credenciado</th><th>Impresso</th><th>Ações</th></tr></thead>
          <tbody>
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
      <p className={styles.note}>O formulário ativo aparece na área do público escolhido. Obrigatório e prazo ficam visíveis para a empresa. PDF e Word são links https.</p>
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
      <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Ordenação</th><th>Descrição</th><th>Público</th><th>Tipo</th><th>Ativo</th><th>Obrigatório</th><th>Prazo</th><th>PDF</th><th>Word</th><th></th></tr></thead>
          <tbody>
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
        {home.products.map((item) => <li key={item.id}>
          <strong>{item.formTitle}</strong> — {item.title} · {item.unit} · {money(item.priceCents)} · {item.active ? 'Disponível' : 'Oculto'}
          {home.canManage && <button className={styles.secondary} type="button" onClick={() => setProduct({
            id: item.id, formId: item.formId, title: item.title, unit: item.unit, price: (item.priceCents / 100).toFixed(2).replace('.', ','), active: item.active,
          })}>Editar</button>}
        </li>)}
      </ul>
    </div>}

    {tab === 'financial' && <div className={styles.tableWrap}>
      <table>
        <thead><tr><th>Empresa</th><th>Formulário</th><th>Descrição</th><th>Quantidade</th><th>Valor</th><th>Situação</th></tr></thead>
        <tbody>
          {home.orders.map((order) => <tr key={order.id}>
            <td>{order.companyTradeName}</td>
            <td>{order.formTitle}</td>
            <td>{order.productTitle}</td>
            <td>{order.quantity} {order.unit}</td>
            <td>{money(order.priceCents * order.quantity)}</td>
            <td>{home.canManage ? <select aria-label={`Situação de ${order.productTitle}`} value={order.status} onChange={(event) => run(async () => {
              await api(`/events/${eventId}/exhibitor/orders/${order.id}/status`, { method: 'POST', body: JSON.stringify({ status: event.target.value }) });
              setNotice('Situação do pedido atualizada.');
            })}>
              <option value="REQUESTED">Solicitado</option>
              <option value="CONFIRMED">Confirmado</option>
              <option value="CANCELLED">Cancelado</option>
            </select> : ORDER_LABEL[order.status]}</td>
          </tr>)}
        </tbody>
      </table>
    </div>}

    {tab === 'export' && <div className={styles.stack}>
      <p className={styles.note}>A exportação separa os pedidos do expositor e os pedidos do prestador de serviços.</p>
      <div className={styles.actions}>
        <button className={styles.primary} type="button" onClick={() => exportOrders(home.orders, 'EXHIBITOR')}>Pedidos do expositor</button>
        <button className={styles.primary} type="button" onClick={() => exportOrders(home.orders, 'PROVIDER')}>Pedidos do prestador de serviços</button>
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
        <label className={styles.field}>Link https<input value={download.url} onChange={(event) => setDownload({ ...download, url: event.target.value })} type="url" required /></label>
        <button className={styles.primary} type="submit">Salvar link</button>
      </form>}
      <ul className={styles.list}>
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
    <div className={styles.tableWrap}>
      <table>
        <thead><tr><th>Razão social</th><th>Nome fantasia</th><th>Documento</th><th>{kind === 'PROVIDER' ? 'Segmento' : 'Estande'}</th><th>Cotas</th><th></th></tr></thead>
        <tbody>
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
