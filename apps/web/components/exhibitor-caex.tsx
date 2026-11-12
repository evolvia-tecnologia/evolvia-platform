'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { ApiError, api, getToken } from '../lib/api';
import EvaScreenSupport from './eva-screen-support';
import { EventBrand, parseEventLogo } from './exhibitor-event-identity';
import styles from './event-exhibitors.module.css';

type Kind = 'EXHIBITOR' | 'ASSEMBLER' | 'SERVICE';
type Summary = { companies: number; credentials: number; credentialed: number; pending: number; printed: number };
type Company = { id: string; kind: 'EXHIBITOR' | 'PROVIDER'; legalName: string; tradeName: string; document: string; booth: string };
type Credential = {
  id: string; companyId: string; companyTradeName: string; companyKind: 'EXHIBITOR' | 'PROVIDER';
  kind: Kind; fullName: string; badgeName: string;
  role: string; credentialedAt: string | null; printedAt: string | null;
};
type Home = {
  event?: { name: string; slug?: string };
  identity?: { logo?: unknown };
  canManage: boolean;
  summary: { exhibitors: Summary; providers: Summary };
  companies: Company[];
  credentials: Credential[];
};
type Section = 'home' | 'exhibitors' | 'exhibitor-credentials' | 'providers' | 'provider-credentials';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'home', label: 'Início' },
  { id: 'exhibitors', label: 'Expositores' },
  { id: 'exhibitor-credentials', label: 'Credenciais de expositores' },
  { id: 'providers', label: 'Prestadores' },
  { id: 'provider-credentials', label: 'Credenciais de prestadores' },
];
const KIND_LABEL: Record<Kind, string> = { EXHIBITOR: 'Expositor', ASSEMBLER: 'Montador', SERVICE: 'Serviço' };

function escapeHtml(value: string | null | undefined) {
  return (value ?? '').replace(/[&<>"']/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
}

function printBadge(item: Credential) {
  const frame = document.createElement('iframe');
  frame.title = 'Crachá do expositor';
  frame.style.position = 'fixed';
  frame.style.left = '-10000px';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const printWindow = frame.contentWindow;
  if (!doc || !printWindow) { frame.remove(); return; }
  const cleanup = () => frame.remove();
  printWindow.addEventListener('afterprint', cleanup, { once: true });
  try {
    doc.open();
    doc.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Crachá</title><style>body{font-family:sans-serif;margin:32px;color:#111}p{margin:0 0 8px}h1{margin:12px 0;font-size:32px}</style></head><body><p>${escapeHtml(KIND_LABEL[item.kind])}</p><h1>${escapeHtml(item.badgeName)}</h1><p>${escapeHtml(item.companyTradeName)}</p><p>${escapeHtml(item.role)}</p></body></html>`);
    doc.close();
    printWindow.focus();
    printWindow.print();
  } catch (error) {
    printWindow.removeEventListener('afterprint', cleanup);
    cleanup();
    throw error;
  }
}

export default function ExhibitorCaex({ eventId }: { eventId: string }) {
  return <CaexDesk key={eventId} eventId={eventId} />;
}

function CaexDesk({ eventId }: { eventId: string }) {
  const panelId = useId();
  const [home, setHome] = useState<Home | null>(null);
  const [section, setSection] = useState<Section>('home');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'ALL' | Kind>('ALL');
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const scopeTicket = useRef(0);
  const requestTicket = useRef(0);
  const actionLock = useRef(false);
  const refreshPending = useRef(false);
  const [refreshNeeded, setRefreshNeeded] = useState(false);

  async function load() {
    const scope = scopeTicket.current;
    const request = ++requestTicket.current;
    try {
      const data = await api<Home>(`/events/${encodeURIComponent(eventId)}/exhibitor`);
      if (scope !== scopeTicket.current || request !== requestTicket.current) return;
      setHome(data);
      setError('');
    } catch (caught) {
      if (scope !== scopeTicket.current || request !== requestTicket.current) return;
      throw caught;
    }
  }

  useEffect(() => {
    if (!getToken()) { setError('Entre com a equipe autorizada do evento para abrir o CAEX.'); return; }
    let active = true;
    load().catch((caught: unknown) => {
      if (active) setError(caught instanceof ApiError && caught.status === 401
        ? 'Sua sessão expirou. Entre novamente com a equipe autorizada.'
        : 'Não foi possível abrir o CAEX. Tente novamente.');
    });
    return () => { active = false; scopeTicket.current += 1; };
  }, [eventId]);

  async function run(action: () => Promise<void>, done: string, refresh = false, preserveNotice = false) {
    if (actionLock.current || (refreshPending.current && !preserveNotice)) return;
    actionLock.current = true;
    const scope = scopeTicket.current;
    setBusy(true); setError(''); if (!preserveNotice) setNotice('');
    try {
      await action();
      if (scope !== scopeTicket.current) return;
      setNotice(done);
      if (refresh) {
        try {
          await load();
          if (scope === scopeTicket.current) { refreshPending.current = false; setRefreshNeeded(false); }
        } catch {
          if (scope === scopeTicket.current) {
            refreshPending.current = true;
            setRefreshNeeded(true);
            setError('A operação foi confirmada, mas não foi possível atualizar os dados. Atualize o CAEX sem reenviar.');
          }
        }
      } else {
        refreshPending.current = false;
        setRefreshNeeded(false);
      }
    } catch (caught: unknown) {
      if (scope === scopeTicket.current) setError(caught instanceof ApiError && caught.status === 401
        ? 'Sua sessão expirou. Entre novamente com a equipe autorizada.'
        : preserveNotice
          ? 'A operação foi confirmada, mas os dados ainda não foram atualizados. Tente atualizar novamente, sem reenviar.'
          : 'Não foi possível concluir a operação. Tente novamente.');
    } finally {
      actionLock.current = false;
      if (scope === scopeTicket.current) setBusy(false);
    }
  }

  async function attendance(item: Credential, next: { credentialed: boolean; printed: boolean }, done: string) {
    await run(async () => {
      await api(`/events/${encodeURIComponent(eventId)}/exhibitor/credentials/${item.id}/attendance`, {
        method: 'POST', body: JSON.stringify(next),
      });
    }, done, true);
  }

  if (!home && !error) return <p className={styles.loading} role="status">A EVA está abrindo o CAEX...</p>;
  if (!home) return <section className={styles.panel} aria-busy={busy}>
    <p className={styles.error} role="alert">{error}</p>
    <p><Link href="/login">Entrar com a conta Evolvia</Link></p>
    {getToken() && <button className={styles.secondary} type="button" disabled={busy} onClick={() => run(() => load(), '')}>Tentar novamente</button>}
  </section>;

  const needle = query.trim().toLowerCase();
  const audience = section === 'provider-credentials' ? 'PROVIDER' : 'EXHIBITOR';
  const credentials = home.credentials.filter((item) => {
    if (section.endsWith('credentials') && item.companyKind !== audience) return false;
    if (kind !== 'ALL' && item.kind !== kind) return false;
    if (!needle) return true;
    return `${item.fullName} ${item.badgeName} ${item.companyTradeName}`.toLowerCase().includes(needle);
  });

  return <section className={`${styles.panel} ${styles.caexShell}`} aria-busy={busy}>
    <header className={styles.caexTopbar} onKeyDown={(event) => { if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); document.getElementById(`${panelId}-menu-toggle`)?.focus(); } }}>
      <span className={styles.caexBrand}>{home.event?.name
        ? <EventBrand name={home.event.name} logo={home.event.slug ? parseEventLogo(home.identity?.logo, home.event.slug) : null} />
        : 'Evolvia'}<small>Central de atendimento ao expositor</small></span>
      <button className={styles.caexMenuToggle} id={`${panelId}-menu-toggle`} type="button" aria-controls={`${panelId}-navigation`} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>Menu CAEX</button>
    <div className={`${styles.caexNavigation} ${menuOpen ? styles.caexNavigationOpen : ''}`} id={`${panelId}-navigation`} role="tablist" aria-label="CAEX">
      {SECTIONS.map((item, index) => <button key={item.id} id={`${panelId}-${item.id}`} className={section === item.id ? styles.tabActive : styles.tab} type="button" role="tab" aria-selected={section === item.id} aria-controls={`${panelId}-panel`} tabIndex={section === item.id ? 0 : -1} disabled={busy} onClick={() => { if (!actionLock.current) { setSection(item.id); } }} onKeyDown={(event) => {
        if (actionLock.current) return;
        const next = event.key === 'ArrowRight' ? (index + 1) % SECTIONS.length : event.key === 'ArrowLeft' ? (index + SECTIONS.length - 1) % SECTIONS.length : event.key === 'Home' ? 0 : event.key === 'End' ? SECTIONS.length - 1 : null;
        if (next === null) return;
        event.preventDefault();
        setSection(SECTIONS[next].id);
        document.getElementById(`${panelId}-${SECTIONS[next].id}`)?.focus();
      }}>{item.label}</button>)}
    </div>
      <Link className={styles.caexExit} href={`/eventos/${encodeURIComponent(eventId)}/painel`}>Voltar ao painel</Link>
    </header>
    <div className={styles.caexBody}>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>CAEX</p>
      <h1>{section === 'home' ? 'Início' : SECTIONS.find((item) => item.id === section)?.label}</h1>
      <p>Credencie expositores e prestadores, consulte a baixa e imprima o crachá. O acesso é o da equipe autorizada. Não há senha compartilhada do evento.</p>
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {refreshNeeded && <button className={styles.secondary} type="button" disabled={busy} onClick={() => run(() => load(), notice, false, true)}>Atualizar CAEX</button>}
    <div id={`${panelId}-panel`} role="tabpanel" aria-labelledby={`${panelId}-${section}`} tabIndex={0}>
      {section === 'home' && <div className={styles.metrics}>
        <Metric title="Expositores" summary={home.summary.exhibitors} />
        <Metric title="Prestadores" summary={home.summary.providers} />
      </div>}
      {(section === 'exhibitors' || section === 'providers') && <CompanyDirectory key={section} eventId={eventId} audience={section === 'providers' ? 'PROVIDER' : 'EXHIBITOR'} />}
      {section.endsWith('credentials') && <div className={styles.stack}>
        <form className={styles.filters} onSubmit={(event) => event.preventDefault()}>
          <label className={styles.field}>Nome ou empresa<input type="search" value={query} placeholder="Nome da pessoa ou empresa" onChange={(event) => setQuery(event.target.value)} /></label>
          <label className={styles.field}>Tipo
            <select value={kind} onChange={(event) => setKind(event.target.value as 'ALL' | Kind)}>
              <option value="ALL">Todos</option>
              <option value="EXHIBITOR">Expositor</option>
              <option value="ASSEMBLER">Montador</option>
              <option value="SERVICE">Serviço</option>
            </select>
          </label>
          <button className={styles.secondary} type="button" onClick={() => { setQuery(''); setKind('ALL'); }}>Limpar filtros</button>
        </form>
        <p role="status">{credentials.length} {credentials.length === 1 ? 'credencial encontrada' : 'credenciais encontradas'}.</p>
        <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Lista com rolagem horizontal">
          <table>
            <caption>Listagem de credenciais</caption>
            <thead><tr><th>Tipo</th><th>Empresa</th><th>Nome</th><th>Crachá</th><th>Cargo</th><th>Credenciado</th><th>Impresso</th><th>Ações</th></tr></thead>
            <tbody>
              {credentials.length === 0 && <tr><td colSpan={8}>Nenhuma credencial encontrada para estes filtros.</td></tr>}
              {credentials.map((item) => <tr key={item.id}>
                <td>{KIND_LABEL[item.kind]}</td>
                <td>{item.companyTradeName}</td>
                <td>{item.fullName}</td>
                <td>{item.badgeName}</td>
                <td>{item.role}</td>
                <td>{item.credentialedAt ? 'Sim' : 'Não'}</td>
                <td>{item.printedAt ? 'Sim' : 'Não'}</td>
                <td className={styles.actions}>
                  {home.canManage && <button className={styles.secondary} type="button" disabled={busy || refreshNeeded} onClick={() => attendance(item, { credentialed: !item.credentialedAt, printed: Boolean(item.printedAt) }, item.credentialedAt ? 'Baixa removida.' : 'Pessoa credenciada.')}>{item.credentialedAt ? 'Tirar baixa' : 'Credenciar'}</button>}
                  <button className={styles.secondary} type="button" onClick={() => printBadge(item)}>Imprimir credencial</button>
                  {home.canManage && <button className={styles.secondary} type="button" disabled={busy || refreshNeeded} onClick={() => attendance(item, { credentialed: Boolean(item.credentialedAt), printed: !item.printedAt }, item.printedAt ? 'Impressão desmarcada.' : 'Crachá marcado como impresso.')}>{item.printedAt ? 'Desmarcar impressão' : 'Marcar impresso'}</button>}
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>A baixa pode ser desfeita. O cadastro permanece. Para incluir ou corrigir a ficha, use a <Link href={`/eventos/${eventId}/painel/expositores`}>central do expositor</Link>.</p>
      </div>}
    </div>
    <footer className={styles.caexFooter}>Evolvia · CAEX · {home.event?.name || 'Atendimento do evento'}</footer>
    </div>
    <EvaScreenSupport guide="caex" />
  </section>;
}

function Metric({ title, summary }: { title: string; summary: Summary }) {
  return <article className={styles.metric}>
    <h2>{title}</h2>
    <div className={styles.metricNumbers}><div><strong>{summary.credentials}</strong><span>Credenciais</span></div><div><strong>{summary.credentialed}</strong><span>Credenciadas</span></div><div><strong>{summary.pending}</strong><span>Pendentes</span></div></div>
    <p>{summary.companies} empresas · {summary.printed} impressões registradas</p>
    <progress aria-label={`Progresso de credenciamento de ${title}`} max={Math.max(1, summary.credentials || 0)} value={summary.credentialed || 0} />
  </article>;
}

type CompanyRow = Pick<Company, 'id' | 'kind' | 'legalName' | 'tradeName' | 'booth'>;
type CompanyResults = { items: CompanyRow[]; page: number; hasMore: boolean };
type FormStatus = { id: string; title: string; kind: 'DOCUMENT' | 'CREDENTIAL' | 'REQUEST'; active: boolean;
  required: boolean; deadline: string | null; visitedAt: string | null; credentialCount: number; orderStatuses: string[] };
type CompanyDeskView = { company: CompanyRow & { quotaExhibitor: number; quotaAssembler: number; quotaService: number };
  credentials: Credential[]; forms: FormStatus[]; total: number; hasMore: boolean; formsHaveMore: boolean;
  quotas: { kind: Kind; limit: number; used: number; available: number; exceeded: boolean }[] };

function CompanyDirectory({ eventId, audience }: { eventId: string; audience: 'EXHIBITOR' | 'PROVIDER' }) {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState('ALL');
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [results, setResults] = useState<CompanyResults | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setResults(null); setError('');
    const params = new URLSearchParams({ q: search, kind: audience, page: String(page), field: searchField });
    api<CompanyResults>(`/events/${encodeURIComponent(eventId)}/exhibitor/caex/companies?${params}`)
      .then((data) => {
        if (!Array.isArray(data?.items) || typeof data.hasMore !== 'boolean'
          || data.items.some((item) => !isCompanyRow(item))) throw Error('invalid');
        if (active) setResults(data);
      })
      .catch(() => { if (active) setError('Não foi possível consultar as empresas. Tente novamente.'); });
    return () => { active = false; };
  }, [eventId, audience, search, page, retry, searchField]);
  if (selected) return <CompanyProfile key={selected} eventId={eventId} companyId={selected} onBack={() => setSelected(null)} />;
  return <div className={styles.stack}>
    <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); setPage(0); setSearch(draft.trim()); setRetry((v) => v + 1); }}>
      <label className={styles.field}>Buscar em
        <select value={searchField} onChange={(event) => { setSearchField(event.target.value); setPage(0); }}>
          <option value="ALL">Empresa, documento ou estande</option>
          <option value="COMPANY">Empresa</option><option value="CONTACT">Nome do contato</option>
          <option value="EMAIL">E-mail</option><option value="DOCUMENT">Documento da empresa</option>
          <option value="BOOTH">Estande</option><option value="CITY">Cidade</option><option value="STATE">UF</option>
        </select>
      </label>
      <label className={styles.field}>Buscar empresa
        <input type="search" maxLength={120} value={draft} placeholder="Informe o texto da busca" onChange={(event) => setDraft(event.target.value)} />
      </label>
      <button className={styles.primary} type="submit">Buscar empresa</button>
      <button className={styles.secondary} type="button" onClick={() => { setDraft(''); setSearch(''); setSearchField('ALL'); setPage(0); }}>Limpar busca</button>
    </form>
    {error && <><p className={styles.error} role="alert">{error}</p><button type="button" className={styles.secondary} onClick={() => setRetry((v) => v + 1)}>Tentar consulta novamente</button></>}
    {!error && !results && <p role="status">Consultando empresas…</p>}
    {results && <>
      <p role="status">{results.items.length} empresas nesta página. Abra a empresa para consultar suas credenciais e formulários.</p>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Empresas encontradas">
        <table><caption>Empresas do evento</caption><thead><tr><th>Empresa</th><th>Razão social</th><th>Estande</th><th>Ação</th></tr></thead>
          <tbody>{results.items.length === 0 && <tr><td colSpan={4}>Nenhuma empresa encontrada.</td></tr>}
            {results.items.map((item) => <tr key={item.id}><td>{item.tradeName}</td><td>{item.legalName}</td><td>{item.booth || '—'}</td>
              <td><button className={styles.secondary} type="button" onClick={() => setSelected(item.id)} aria-label={`Abrir empresa ${item.tradeName}`}>Abrir empresa</button></td></tr>)}
          </tbody>
        </table>
      </div>
      <div className={styles.actions} aria-label="Páginas de empresas">
        <button className={styles.secondary} type="button" disabled={page === 0} onClick={() => setPage((v) => v - 1)}>Empresas anteriores</button>
        <span>Página {page + 1}</span>
        <button className={styles.secondary} type="button" disabled={!results.hasMore} onClick={() => setPage((v) => v + 1)}>Próximas empresas</button>
      </div>
    </>}
  </div>;
}

function CompanyProfile({ eventId, companyId, onBack }: { eventId: string; companyId: string; onBack: () => void }) {
  const panelId = useId();
  const [section, setSection] = useState<'credentials' | 'forms' | 'orders'>('credentials');
  const sections = [{ id: 'credentials', label: 'Credenciais' }, { id: 'forms', label: 'Formulários' }, { id: 'orders', label: 'Pedidos e serviços' }] as const;
  const [page, setPage] = useState(0);
  const [formsPage, setFormsPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<CompanyDeskView | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setView(null); setError('');
    api<CompanyDeskView>(`/events/${encodeURIComponent(eventId)}/exhibitor/caex/companies/${encodeURIComponent(companyId)}?page=${page}&formsPage=${formsPage}`)
      .then((data) => {
        if (!isCompanyRow(data?.company) || data.company.id !== companyId || !Array.isArray(data.credentials) || !Array.isArray(data.forms)
          || typeof data.total !== 'number' || typeof data.hasMore !== 'boolean' || typeof data.formsHaveMore !== 'boolean'
          || !Array.isArray(data.quotas) || data.quotas.length !== 3 || new Set(data.quotas.map((q) => q.kind)).size !== 3
          || data.quotas.some((q) => !q || !['EXHIBITOR', 'ASSEMBLER', 'SERVICE'].includes(q.kind)
            || ![q.limit, q.used, q.available].every((v) => Number.isSafeInteger(v) && v >= 0) || typeof q.exceeded !== 'boolean')
          || data.forms.some((form) => !form || typeof form.id !== 'string' || typeof form.title !== 'string'
            || !['DOCUMENT', 'CREDENTIAL', 'REQUEST'].includes(form.kind) || typeof form.active !== 'boolean'
            || typeof form.required !== 'boolean' || !(form.deadline === null || /^\d{4}-\d{2}-\d{2}$/.test(form.deadline))
            || typeof form.credentialCount !== 'number' || !(form.visitedAt === null || typeof form.visitedAt === 'string')
            || !Array.isArray(form.orderStatuses) || form.orderStatuses.some((status) => typeof status !== 'string'))
          || data.credentials.some((item) => !item || typeof item.id !== 'string' || typeof item.badgeName !== 'string'
            || typeof item.fullName !== 'string' || typeof item.role !== 'string' || typeof item.companyTradeName !== 'string'
            || !['EXHIBITOR', 'ASSEMBLER', 'SERVICE'].includes(item.kind))) throw Error('invalid');
        if (active) setView(data);
      })
      .catch(() => { if (active) setError('Não foi possível abrir a empresa neste evento. Atualize a consulta ou volte à busca.'); });
    return () => { active = false; };
  }, [eventId, companyId, page, formsPage, retry]);
  return <section className={styles.stack} aria-label="Perfil da empresa no CAEX">
    <div className={styles.actions}>
      <button type="button" className={styles.secondary} onClick={onBack}>Voltar à busca de empresas</button>
      <button type="button" className={styles.secondary} onClick={() => setRetry((v) => v + 1)}>Atualizar empresa</button>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!view && !error && <p role="status">Abrindo empresa…</p>}
    {view && <>
      <header className={styles.companyHeading}><p className={styles.eyebrow}>Atendimento da empresa</p><h2>{view.company.tradeName}</h2><p>{view.company.legalName} · Estande {view.company.booth || 'não informado'}</p></header>
      <div className={styles.quotaGrid} aria-label="Cotas de credenciais da empresa">
        {view.quotas.map((quota) => <article className={styles.quotaCard} key={quota.kind}>
          <h3>{KIND_LABEL[quota.kind]}</h3>
          <dl><div><dt>Liberadas</dt><dd>{quota.limit}</dd></div><div><dt>Cadastradas</dt><dd>{quota.used}</dd></div><div><dt>Disponíveis</dt><dd>{quota.available}</dd></div></dl>
          <progress aria-label={`Cota utilizada de ${KIND_LABEL[quota.kind]}`} value={Math.min(quota.used, quota.limit)} max={Math.max(1, quota.limit)} />
          {quota.exceeded && <p role="status">Cota excedida. Consulte a organização antes de incluir credenciais.</p>}
        </article>)}
      </div>
      <div className={styles.companyTabs} role="tablist" aria-label="Atendimento da empresa">
        {sections.map((item, index) => <button className={section === item.id ? styles.tabActive : styles.tab} type="button" key={item.id} role="tab"
          id={`${panelId}-${item.id}`} aria-selected={section === item.id} aria-controls={`${panelId}-company-panel`} tabIndex={section === item.id ? 0 : -1}
          onClick={() => setSection(item.id)} onKeyDown={(event) => {
            const next = event.key === 'ArrowRight' ? (index + 1) % sections.length : event.key === 'ArrowLeft' ? (index + sections.length - 1) % sections.length : event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : null;
            if (next === null) return;
            event.preventDefault(); setSection(sections[next].id);
            document.getElementById(`${panelId}-${sections[next].id}`)?.focus();
          }}>{item.label}</button>)}
      </div>
      <div id={`${panelId}-company-panel`} className={styles.companyPanel} role="tabpanel" aria-labelledby={`${panelId}-${section}`} tabIndex={0}>
      {section === 'credentials' && <>
      <h3>Credenciais da empresa</h3>
      <p role="status">{view.total} credenciais cadastradas · Página {page + 1}.</p>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Credenciais da empresa">
        <table><caption>Credenciais de {view.company.tradeName}</caption><thead><tr><th>Nome</th><th>Tipo</th><th>Credenciado</th><th>Impressão registrada</th><th>Ação</th></tr></thead>
          <tbody>{view.credentials.length === 0 && <tr><td colSpan={5}>Nenhuma credencial nesta página.</td></tr>}
            {view.credentials.map((item) => <tr key={item.id}><td>{item.fullName}</td><td>{KIND_LABEL[item.kind]}</td>
              <td>{item.credentialedAt ? 'Sim' : 'Não'}</td><td>{item.printedAt ? 'Sim' : 'Não'}</td>
              <td><button type="button" className={styles.secondary} onClick={() => printBadge(item)}>Imprimir credencial</button></td></tr>)}
          </tbody>
        </table>
      </div>
      <div className={styles.actions} aria-label="Páginas de credenciais">
        <button className={styles.secondary} type="button" disabled={page === 0} onClick={() => setPage((v) => v - 1)}>Credenciais anteriores</button>
        <button className={styles.secondary} type="button" disabled={!view.hasMore} onClick={() => setPage((v) => v + 1)}>Próximas credenciais</button>
      </div>
      </>}
      {section === 'forms' && <>
      <h3>Formulários e acompanhamento</h3>
      <p>Documento consultado registra abertura, sem comprovar leitura ou aceite. Credenciais indicam o total da modalidade. Pedidos mostram o estado operacional, sem confirmar pagamento.</p>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Formulários da empresa">
        <table><caption>Formulários aplicáveis · Página {formsPage + 1}</caption><thead><tr><th>Formulário</th><th>Obrigatório</th><th>Prazo</th><th>Situação</th></tr></thead>
          <tbody>{view.forms.length === 0 && <tr><td colSpan={4}>Nenhum formulário nesta página.</td></tr>}
            {view.forms.map((form) => <tr key={form.id}><td>{form.title}{!form.active && ' (inativo)'}</td><td>{form.required ? 'Sim' : 'Não'}</td>
              <td>{form.deadline ? form.deadline.split('-').reverse().join('/') : 'Sem prazo'}</td><td>{companyFormStatus(form)}</td></tr>)}
          </tbody>
        </table>
      </div>
      <div className={styles.actions} aria-label="Páginas de formulários">
        <button className={styles.secondary} type="button" disabled={formsPage === 0} onClick={() => setFormsPage((v) => v - 1)}>Formulários anteriores</button>
        <button className={styles.secondary} type="button" disabled={!view.formsHaveMore} onClick={() => setFormsPage((v) => v + 1)}>Próximos formulários</button>
      </div>
      </>}
      {section === 'orders' && <CompanyOrders key={companyId} eventId={eventId} companyId={companyId} />}
      </div>
    </>}
  </section>;
}

function companyFormStatus(form: FormStatus): string {
  if (form.kind === 'DOCUMENT') return form.visitedAt ? 'Abertura registrada' : 'Sem abertura registrada';
  if (form.kind === 'CREDENTIAL') return `${form.credentialCount} credenciais na modalidade`;
  const labels: Record<string, string> = { REQUESTED: 'Solicitado', CONFIRMED: 'Confirmado', CANCELLED: 'Cancelado' };
  if (!form.orderStatuses.length) return 'Sem solicitação';
  return Object.entries(form.orderStatuses.reduce<Record<string, number>>((counts, status) => {
    counts[status] = (counts[status] ?? 0) + 1; return counts;
  }, {})).map(([status, count]) => `${count} ${labels[status] ?? 'com estado não reconhecido'}`).join(' · ');
}


function isCompanyRow(value: unknown): value is CompanyRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && typeof row.tradeName === 'string' && typeof row.legalName === 'string'
    && typeof row.booth === 'string' && (row.kind === 'EXHIBITOR' || row.kind === 'PROVIDER');
}

type CompanyOrder = { id: string; productTitle: string; formTitle: string; unit: string; quantity: number;
  unitPriceCents: number; totalCents: number; status: 'REQUESTED' | 'CONFIRMED' | 'CANCELLED'; createdAt: string };
type CompanyOrdersView = { companyId: string; page: number; hasMore: boolean; items: CompanyOrder[] };

function CompanyOrders({ eventId, companyId }: { eventId: string; companyId: string }) {
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<CompanyOrdersView | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setData(null); setError('');
    api<CompanyOrdersView>(`/events/${encodeURIComponent(eventId)}/exhibitor/caex/companies/${encodeURIComponent(companyId)}/orders?page=${page}`)
      .then((result) => {
        if (!result || result.companyId !== companyId || result.page !== page || typeof result.hasMore !== 'boolean'
          || !Array.isArray(result.items) || result.items.some((item) => !isCompanyOrder(item))) throw Error('invalid');
        if (active) setData(result);
      })
      .catch(() => { if (active) setError('Não foi possível consultar os pedidos desta empresa. Tente atualizar a consulta.'); });
    return () => { active = false; };
  }, [eventId, companyId, page, retry]);
  const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const status = { REQUESTED: 'Solicitado', CONFIRMED: 'Confirmado', CANCELLED: 'Cancelado' };
  return <section className={styles.stack} aria-label="Pedidos e serviços da empresa">
    <h3>Pedidos e serviços</h3>
    <p>Valores registrados no pedido. A situação operacional não confirma pagamento. Cobranças, isenções e recibos dependem da conciliação financeira.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <button type="button" className={styles.secondary} onClick={() => setRetry((value) => value + 1)}>Atualizar pedidos</button>
    {!error && !data && <p role="status">Consultando pedidos…</p>}
    {data && <>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Tabela de pedidos da empresa">
        <table><caption>Pedidos da empresa · Página {page + 1}</caption>
          <thead><tr><th>Produto ou serviço</th><th>Quantidade</th><th>Preço unitário registrado</th><th>Total registrado</th><th>Situação</th></tr></thead>
          <tbody>{data.items.length === 0 && <tr><td colSpan={5}>Nenhum pedido nesta página.</td></tr>}
            {data.items.map((item) => <tr key={item.id}><td>{item.productTitle}<p>{item.formTitle}</p></td>
              <td>{item.quantity} {item.unit}</td><td>{money(item.unitPriceCents)}</td><td>{money(item.totalCents)}</td><td>{status[item.status]}</td></tr>)}
          </tbody>
        </table>
      </div>
      <div className={styles.actions} aria-label="Páginas de pedidos">
        <button type="button" className={styles.secondary} disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Pedidos anteriores</button>
        <button type="button" className={styles.secondary} disabled={!data.hasMore} onClick={() => setPage((value) => value + 1)}>Próximos pedidos</button>
      </div>
    </>}
  </section>;
}

function isCompanyOrder(value: unknown): value is CompanyOrder {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return ['id', 'productTitle', 'formTitle', 'unit'].every((key) => typeof row[key] === 'string')
    && ['quantity', 'unitPriceCents', 'totalCents'].every((key) => Number.isSafeInteger(row[key]) && Number(row[key]) >= 0)
    && Number(row.quantity) > 0
    && Number(row.totalCents) === Number(row.quantity) * Number(row.unitPriceCents)
    && ['REQUESTED', 'CONFIRMED', 'CANCELLED'].includes(String(row.status))
    && typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt));
}

