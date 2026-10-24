'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import EvaScreenSupport from './eva-screen-support';
import { ApiError, api, clearSession, getToken } from '../lib/api';
import styles from './exhibitor-company-area.module.css';

type Progress = 'OPENED' | 'PENDING' | 'EXPIRED';
type Section = 'profile' | 'representatives' | 'forms' | 'payments' | 'downloads';
type Company = {
  id: string; kind: 'EXHIBITOR' | 'PROVIDER'; nationality: string; document: string; loginEmail: string;
  legalName: string; tradeName: string; booth: string; areaLabel: string;
  quotaExhibitor: number; quotaAssembler: number; quotaService: number;
  contactName: string; contactRole: string; contactEmail: string; postalCode: string; street: string;
  addressNumber: string; complement: string; district: string; city: string; state: string; country: string; phone: string;
};
type Portal = {
  needsChoice: boolean;
  access?: 'ACCOUNT' | 'REPRESENTATIVE';
  canManage?: boolean;
  accountName: string;
  event: { name: string; slug: string };
  companies?: { id: string; tradeName: string; kind: string; access: string }[];
  company?: Company;
  quotaUsed?: { EXHIBITOR: number; ASSEMBLER: number; SERVICE: number };
  credentials?: { id: string; kind: string; fullName: string; badgeName: string; role: string; document?: string }[];
  representatives?: { id: string; name: string; role: string; email: string }[];
  forms?: FormItem[];
  orders?: OrderItem[];
  downloads?: { id: string; title: string; url: string }[];
  paymentNote?: string;
};
type FormItem = {
  id: string; title: string; required: boolean; deadline: string | null; kind: 'CREDENTIAL' | 'REQUEST' | 'DOCUMENT';
  credentialKind: string | null; pdfUrl: string; wordUrl: string; progress: Progress;
  products: { id: string; title: string; unit: string; priceCents: number }[];
};
type OrderItem = {
  id: string; description: string; formTitle: string; unit: string; quantity: number; priceCents: number;
  status: 'REQUESTED' | 'CONFIRMED' | 'CANCELLED'; createdAt: string; dueOn: string | null;
};

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'profile', label: 'Dados cadastrais' },
  { id: 'representatives', label: 'Representantes' },
  { id: 'forms', label: 'Formulários' },
  { id: 'payments', label: 'Pagamentos' },
  { id: 'downloads', label: 'Downloads' },
];
const PROGRESS_LABEL: Record<Progress | 'ALL', string> = {
  ALL: 'Todos', OPENED: 'Acessado', PENDING: 'Acesso pendente', EXPIRED: 'Vencido',
};
const KIND_LABEL = { EXHIBITOR: 'Expositor', PROVIDER: 'Prestador de serviços', ASSEMBLER: 'Montador', SERVICE: 'Serviço' } as const;
const ORDER_LABEL = { REQUESTED: 'Solicitado', CONFIRMED: 'Confirmado', CANCELLED: 'Cancelado' };
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatDay(value: string | null) {
  if (!value) return 'Sem prazo';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export default function ExhibitorCompanyArea({ slug }: { slug: string }) {
  return <>
    <EvaScreenSupport guide="exhibitor" />
    <CompanyDesk key={slug} slug={slug} />
  </>;
}

function CompanyDesk({ slug }: { slug: string }) {
  const panelId = useId();
  const [portal, setPortal] = useState<Portal | null>(null);
  const [section, setSection] = useState<Section>('forms');
  const [filter, setFilter] = useState<Progress | 'ALL'>('ALL');
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const scopeTicket = useRef(0);
  const actionLock = useRef(false);
  const refreshPending = useRef(false);
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const requestTicket = useRef(0);
  const signedIn = Boolean(getToken());

  async function load(companyId?: string) {
    const scope = scopeTicket.current;
    const request = ++requestTicket.current;
    const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
    try {
      const data = await api<Portal>(`/public/events/${encodeURIComponent(slug)}/exhibitor${query}`);
      if (scope !== scopeTicket.current || request !== requestTicket.current) return;
      setPortal(data);
      setError('');
    } catch (caught) {
      if (scope !== scopeTicket.current || request !== requestTicket.current) return;
      throw caught;
    }
  }

  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    let active = true;
    load().catch((caught: unknown) => {
      if (!active) return;
      setError(caught instanceof ApiError && caught.status === 401
        ? 'Sua sessão expirou. Entre novamente com a conta Evolvia.'
        : 'Não foi possível abrir a área da empresa. Tente novamente.');
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; scopeTicket.current += 1; };
  }, [slug]);

  async function run(action: () => Promise<void | boolean>, done: string, refresh = false, preserveNotice = false): Promise<boolean> {
    if (actionLock.current || (refreshPending.current && !preserveNotice)) return false;
    actionLock.current = true;
    const scope = scopeTicket.current;
    setBusy(true); setError(''); if (!preserveNotice) setNotice('');
    try {
      const refreshRequired = await action();
      if (scope !== scopeTicket.current) return false;
      setNotice(done);
      if (refresh || refreshRequired === true) {
        try {
          await load(portal?.company?.id);
          if (scope === scopeTicket.current) { refreshPending.current = false; setRefreshNeeded(false); }
        } catch {
          if (scope === scopeTicket.current) {
            refreshPending.current = true;
            setRefreshNeeded(true);
            setError('A operação foi confirmada, mas não foi possível atualizar os dados. Atualize a área sem reenviar.');
          }
        }
      } else {
        refreshPending.current = false;
        setRefreshNeeded(false);
      }
      return scope === scopeTicket.current;
    } catch (caught: unknown) {
      if (scope === scopeTicket.current) setError(caught instanceof ApiError && caught.status === 401
        ? 'Sua sessão expirou. Entre novamente com a conta Evolvia.'
        : preserveNotice
          ? 'A operação foi confirmada, mas os dados ainda não foram atualizados. Tente atualizar novamente, sem reenviar.'
          : 'Não foi possível concluir a operação. Os dados preenchidos foram preservados.');
      return false;
    } finally {
      actionLock.current = false;
      if (scope === scopeTicket.current) setBusy(false);
    }
  }

  if (!ready) return <p className={styles.page} role="status">A EVA está abrindo a área da empresa...</p>;
  if (!signedIn || (error && !portal)) {
    return <section className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>ÁREA DO EXPOSITOR</p>
        <h1>Área da empresa</h1>
        <p>Entre com a conta Evolvia do e-mail que a organização cadastrou. Confirme esse e-mail antes. Não há senha compartilhada da empresa.</p>
      </header>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <p><Link href="/login">Entrar na Evolvia</Link></p>
      {signedIn && <button className={styles.secondary} type="button" disabled={busy} onClick={() => run(() => load(), '')}>Tentar novamente</button>}
    </section>;
  }
  if (!portal) return null;
  if (portal.needsChoice) {
    return <section className={styles.page}>
      <header className={styles.hero}><p className={styles.eyebrow}>ÁREA DO EXPOSITOR</p><h1>{portal.event.name}</h1><p>Olá, {portal.accountName}. Escolha a empresa ligada a esta conta.</p></header>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.cards}>
        {portal.companies?.map((company) => <button key={company.id} className={styles.secondary} type="button" disabled={busy} onClick={() => run(() => load(company.id), '')}>{company.tradeName}</button>)}
      </div>
    </section>;
  }

  const company = portal.company!;
  const forms = (portal.forms ?? []).filter((form) => filter === 'ALL' || form.progress === filter);
  const opened = (portal.forms ?? []).filter((form) => form.progress === 'OPENED').length;

  return <section className={styles.shell} aria-busy={busy}>
    <header className={styles.topbar} onKeyDown={(event) => { if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); document.getElementById(`${panelId}-menu-toggle`)?.focus(); } }}>
      <Link className={styles.eventBrand} href={`/evento/${encodeURIComponent(slug)}`}>{portal.event.name}</Link>
      <button className={styles.menuToggle} id={`${panelId}-menu-toggle`} type="button" aria-expanded={menuOpen} aria-controls={`${panelId}-navigation`} onClick={() => setMenuOpen(!menuOpen)}>Menu da empresa</button>
    <div className={`${styles.navigation} ${menuOpen ? styles.navigationOpen : ''}`} id={`${panelId}-navigation`} role="tablist" aria-label="Área da empresa">
      {SECTIONS.map((item, index) => <button key={item.id} id={`${panelId}-${item.id}`} className={section === item.id ? styles.tabActive : styles.tab} type="button" disabled={busy} role="tab" aria-selected={section === item.id} aria-controls={`${panelId}-panel`} tabIndex={section === item.id ? 0 : -1} onClick={() => { if (!actionLock.current) { setSection(item.id); } }} onKeyDown={(event) => {
        if (actionLock.current) return;
        const next = event.key === 'ArrowRight' ? (index + 1) % SECTIONS.length : event.key === 'ArrowLeft' ? (index + SECTIONS.length - 1) % SECTIONS.length : event.key === 'Home' ? 0 : event.key === 'End' ? SECTIONS.length - 1 : null;
        if (next === null) return;
        event.preventDefault();
        setSection(SECTIONS[next].id);
        document.getElementById(`${panelId}-${SECTIONS[next].id}`)?.focus();
      }}>{item.label}</button>)}
    </div>
      <div className={styles.account}><span className={styles.avatar} aria-hidden="true">{portal.accountName.slice(0, 1).toUpperCase()}</span><span><strong>{portal.accountName}</strong><small>{portal.access === 'REPRESENTATIVE' ? 'Representante' : KIND_LABEL[company.kind]}</small></span>
        <button className={styles.signOut} type="button" onClick={() => { clearSession(); window.location.href = '/login'; }}>Usar outra conta</button>
      </div>
    </header>
    <div className={styles.page}>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>ÁREA DO EXPOSITOR</p>
      <h1>{SECTIONS.find((item) => item.id === section)?.label}</h1>
      <p>{company.tradeName} · {KIND_LABEL[company.kind]} · Estande {company.booth || 'não informado'}</p>
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {refreshNeeded && <button className={styles.secondary} type="button" disabled={busy} onClick={() => run(() => load(company.id), notice, false, true)}>Atualizar área da empresa</button>}
    <div id={`${panelId}-panel`} role="tabpanel" aria-labelledby={`${panelId}-${section}`} tabIndex={0}>
      {section === 'profile' && <Profile portal={portal} busy={busy || refreshNeeded} onSave={(input) => run(async () => {
        const scope = scopeTicket.current;
        const request = ++requestTicket.current;
        const data = await api<Portal | { saved: true; refreshRequired: true; companyId: string }>(`/public/events/${encodeURIComponent(slug)}/exhibitor/companies/${company.id}/profile`, { method: 'PATCH', body: JSON.stringify(input) });
        if (scope !== scopeTicket.current || request !== requestTicket.current) return;
        if ('refreshRequired' in data) return true;
        setPortal(data);
      }, 'Dados do contato salvos.')} />}
      {section === 'representatives' && <Representatives portal={portal} busy={busy || refreshNeeded} onAdd={(input) => run(async () => { await api(`/public/events/${encodeURIComponent(slug)}/exhibitor/companies/${company.id}/representatives`, { method: 'POST', body: JSON.stringify(input) }); }, 'Representante salvo.', true)} onRemove={(id) => run(async () => { await api(`/public/events/${encodeURIComponent(slug)}/exhibitor/companies/${company.id}/representatives/${id}`, { method: 'DELETE' }); }, 'Representante removido.', true)} />}
      {section === 'forms' && <div className={styles.cards}>
        <section className={styles.progressCard} aria-label="Acompanhamento dos formulários">
          <div><span className={styles.eyebrow}>Progresso de acesso</span><strong>{opened} de {portal.forms?.length ?? 0}</strong><p>Abrir um formulário não comprova envio, aprovação ou pagamento.</p></div>
          <progress aria-label="Formulários acessados" max={Math.max(1, portal.forms?.length ?? 0)} value={opened} />
          <div className={styles.progressCounts}><span>{(portal.forms ?? []).filter((item) => item.progress === 'PENDING').length} com acesso pendente</span><span>{(portal.forms ?? []).filter((item) => item.progress === 'EXPIRED').length} vencidos</span></div>
        </section>
        <div className={styles.tabs} role="group" aria-label="Filtrar formulários">
          {(['ALL', 'OPENED', 'PENDING', 'EXPIRED'] as const).map((item) => <button key={item} className={filter === item ? styles.tabActive : styles.tab} type="button" disabled={busy} aria-pressed={filter === item} onClick={() => { if (!actionLock.current) setFilter(item); }}>{PROGRESS_LABEL[item]}</button>)}
        </div>
        {forms.length === 0 && <p className={styles.card}>Nenhum formulário neste filtro.</p>}
        {forms.map((form) => <FormCard
          key={form.id}
          form={form}
          portal={portal}
          busy={busy || refreshNeeded}
          onCredential={(input) => run(async () => {
            await api(`/public/events/${encodeURIComponent(slug)}/exhibitor/companies/${company.id}/credentials`, { method: 'POST', body: JSON.stringify(input) });
          }, 'Credencial enviada.', true)}
          onOrder={(input) => run(async () => {
            await api(`/public/events/${encodeURIComponent(slug)}/exhibitor/companies/${company.id}/orders`, { method: 'POST', body: JSON.stringify(input) });
          }, 'Pedido enviado.', true)}
          onVisit={() => run(async () => {
            await api(`/public/events/${encodeURIComponent(slug)}/exhibitor/companies/${company.id}/forms/${form.id}/visit`, { method: 'POST' });
          }, 'Acesso ao documento registrado.', true)}
        />)}
      </div>}
      {section === 'payments' && <Payments portal={portal} />}
      {section === 'downloads' && <Downloads portal={portal} />}
    </div>
    <footer className={styles.footer}>Evolvia · Área da empresa · {portal.event.name}</footer>
    </div>
  </section>;
}

function Profile({ portal, busy, onSave }: { portal: Portal; busy: boolean; onSave: (input: Record<string, string>) => void }) {
  const company = portal.company!;
  const [contact, setContact] = useState(company);
  useEffect(() => { setContact(company); }, [company]);
  const fields: [keyof Company, string][] = [
    ['contactName', 'Nome do contato'], ['contactRole', 'Cargo'], ['contactEmail', 'E-mail do contato'], ['phone', 'Telefone'],
    ['postalCode', 'CEP'], ['street', 'Logradouro'], ['addressNumber', 'Número'], ['complement', 'Complemento'],
    ['district', 'Bairro'], ['city', 'Cidade'], ['state', 'UF'], ['country', 'País'],
  ];
  return <div className={styles.cards}>
    <section className={styles.card} aria-labelledby="company-identity">
      <h2 id="company-identity">Dados da empresa</h2>
      <dl className={styles.identity}>
        <div><dt>Razão social</dt><dd>{company.legalName}</dd></div>
        <div><dt>Nome fantasia</dt><dd>{company.tradeName}</dd></div>
        <div><dt>Documento</dt><dd>{company.document}</dd></div>
        <div><dt>E-mail de acesso</dt><dd>{company.loginEmail}</dd></div>
        <div><dt>Estande</dt><dd>{company.booth || 'Não informado'}</dd></div>
        <div><dt>Metragem</dt><dd>{company.areaLabel || 'Não informada'}</dd></div>
      </dl>
      <p className={styles.muted}>Documento, e-mail de acesso, estande e cotas são definidos pela organização. O acesso usa a conta Evolvia, sem senha da empresa.</p>
    </section>
    <form className={styles.card} onSubmit={(event: FormEvent) => { event.preventDefault(); onSave({
      contactName: contact.contactName, contactRole: contact.contactRole, contactEmail: contact.contactEmail, phone: contact.phone,
      postalCode: contact.postalCode, street: contact.street, addressNumber: contact.addressNumber, complement: contact.complement,
      district: contact.district, city: contact.city, state: contact.state, country: contact.country,
    }); }}>
      <h2>Contato e endereço</h2>
      <div className={styles.form}>
        {fields.map(([key, label]) => <label key={key} className={styles.field}>{label}
          <input type={key === 'contactEmail' ? 'email' : key === 'phone' ? 'tel' : 'text'} autoComplete={key === 'contactEmail' ? 'email' : key === 'phone' ? 'tel' : key === 'postalCode' ? 'postal-code' : undefined} value={contact[key] ?? ''} disabled={!portal.canManage || busy} onChange={(event) => setContact({ ...contact, [key]: event.target.value })} />
        </label>)}
      </div>
      {portal.canManage && <button className={styles.primary} type="submit" disabled={busy}>Salvar contato</button>}
      {!portal.canManage && <p className={styles.muted}>O representante consulta estes dados. Quem altera é a conta do e-mail de acesso.</p>}
    </form>
  </div>;
}

function Representatives({ portal, busy, onAdd, onRemove }: { portal: Portal; busy: boolean; onAdd: (input: { name: string; role: string; email: string }) => Promise<boolean>; onRemove: (id: string) => void }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  return <div className={styles.cards}>
    <p className={styles.note}>O representante entra com a própria conta Evolvia, no e-mail cadastrado aqui, depois de confirmá-lo.</p>
    {portal.canManage && <form className={styles.form} onSubmit={async (event) => { event.preventDefault(); if (await onAdd({ name, role, email })) { setName(''); setRole(''); setEmail(''); } }}>
      <label className={styles.field}>Nome do contato<input value={name} disabled={busy} required minLength={2} onChange={(event) => setName(event.target.value)} /></label>
      <label className={styles.field}>Cargo<input value={role} disabled={busy} required minLength={2} onChange={(event) => setRole(event.target.value)} /></label>
      <label className={styles.field}>E-mail<input type="email" value={email} disabled={busy} required onChange={(event) => setEmail(event.target.value)} /></label>
      <button className={styles.primary} type="submit" disabled={busy}>Salvar representante</button>
    </form>}
    <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Representantes cadastrados">
      <table>
        <caption>Representantes cadastrados</caption>
        <thead><tr><th>Nome</th><th>Cargo</th><th>E-mail</th>{portal.canManage && <th>Ação</th>}</tr></thead>
        <tbody>
          {(portal.representatives ?? []).length === 0 && <tr><td colSpan={portal.canManage ? 4 : 3}>Nenhum representante cadastrado.</td></tr>}
          {portal.representatives?.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.role}</td><td>{item.email}</td>{portal.canManage && <td><button className={styles.secondary} type="button" disabled={busy} onClick={() => onRemove(item.id)}>Remover</button></td>}</tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}

function FormCard({ form, portal, busy, onCredential, onOrder, onVisit }: {
  form: FormItem; portal: Portal; busy: boolean;
  onCredential: (input: Record<string, string>) => Promise<boolean>;
  onOrder: (input: { formId: string; productId: string; quantity: number }) => void;
  onVisit: () => Promise<boolean>;
}) {
  const closed = form.progress === 'EXPIRED';
  const quota = portal.company!;
  const used = portal.quotaUsed!;
  const quotaFor = form.credentialKind === 'ASSEMBLER' ? quota.quotaAssembler : form.credentialKind === 'SERVICE' ? quota.quotaService : quota.quotaExhibitor;
  const usedFor = form.credentialKind === 'ASSEMBLER' ? used.ASSEMBLER : form.credentialKind === 'SERVICE' ? used.SERVICE : used.EXHIBITOR;
  return <details className={`${styles.formCard} ${closed ? styles.formExpired : ''}`}>
    <summary className={styles.formSummary}>
      <span className={styles.formIcon} aria-hidden="true">{form.kind === 'CREDENTIAL' ? 'ID' : form.kind === 'REQUEST' ? '+' : '≡'}</span>
      <span className={styles.formDescription}><span className={styles.badge}>{PROGRESS_LABEL[form.progress]}</span><strong>{form.title}</strong><small>{form.required ? 'Formulário obrigatório' : 'Formulário opcional'}</small></span>
      <span className={styles.formDeadline}><small>Vencimento</small><strong>{formatDay(form.deadline)}</strong></span>
      <span className={styles.formRequirement}><small>Obrigatoriedade</small><strong>{form.required ? 'Obrigatório' : 'Opcional'}</strong></span>
      <span className={styles.expandIndicator} aria-hidden="true">⌄</span>
    </summary>
    <div className={styles.formContent}>
    {form.kind === 'CREDENTIAL' && <>
    <p className={styles.muted}>{form.credentialKind
      ? `Cota usada: ${usedFor} de ${quotaFor}.`
      : `Cotas usadas: expositor ${used.EXHIBITOR} de ${quota.quotaExhibitor}, montador ${used.ASSEMBLER} de ${quota.quotaAssembler}, serviço ${used.SERVICE} de ${quota.quotaService}.`}</p>
    <CredentialForm form={form} disabled={busy || closed || (form.credentialKind ? usedFor >= quotaFor : used.EXHIBITOR >= quota.quotaExhibitor && used.ASSEMBLER >= quota.quotaAssembler && used.SERVICE >= quota.quotaService)} onSubmit={onCredential} />
      <CredentialList portal={portal} kind={form.credentialKind} />
    </>}
    {form.kind === 'REQUEST' && <OrderForm form={form} disabled={busy || closed} onSubmit={onOrder} />}
    {form.kind === 'DOCUMENT' && <div className={styles.actions}>
      {form.pdfUrl && <a href={form.pdfUrl} target="_blank" rel="noopener noreferrer" onClick={() => { void onVisit(); }}>Abrir PDF</a>}
      {form.wordUrl && <a href={form.wordUrl} target="_blank" rel="noopener noreferrer" onClick={() => { void onVisit(); }}>Abrir Word</a>}
      {!form.pdfUrl && !form.wordUrl && <p className={styles.muted}>A organização ainda não publicou o arquivo deste documento.</p>}
    </div>}
    {closed && <p className={styles.muted}>O prazo deste formulário encerrou. Ele continua visível e não aceita novo envio.</p>}
    </div>
  </details>;
}

function CredentialForm({ form, disabled, onSubmit }: { form: FormItem; disabled: boolean; onSubmit: (input: Record<string, string>) => Promise<boolean> }) {
  const [kind, setKind] = useState(form.credentialKind ?? 'EXHIBITOR');
  const [nationality, setNationality] = useState('BRAZILIAN');
  const [documentValue, setDocumentValue] = useState('');
  const [fullName, setFullName] = useState('');
  const [badgeName, setBadgeName] = useState('');
  const [role, setRole] = useState('');
  return <form className={styles.form} onSubmit={async (event) => {
    event.preventDefault();
    if (await onSubmit({ formId: form.id, kind, nationality, document: documentValue, fullName, badgeName, role })) {
      setDocumentValue(''); setFullName(''); setBadgeName(''); setRole('');
    }
  }}>
    <label className={styles.field}>Tipo de crachá
      <select value={kind} disabled={disabled || Boolean(form.credentialKind)} onChange={(event) => setKind(event.target.value)}>
        <option value="EXHIBITOR">Expositor</option><option value="ASSEMBLER">Montador</option><option value="SERVICE">Serviço</option>
      </select>
    </label>
    <label className={styles.field}>Nacionalidade
      <select value={nationality} disabled={disabled} onChange={(event) => setNationality(event.target.value)}>
        <option value="BRAZILIAN">Brasileira</option><option value="FOREIGN">Estrangeira</option>
      </select>
    </label>
    <label className={styles.field}>{nationality === 'BRAZILIAN' ? 'CPF' : 'Passaporte'}<input value={documentValue} required disabled={disabled} onChange={(event) => setDocumentValue(event.target.value)} /></label>
    <label className={styles.field}>Nome completo<input value={fullName} required disabled={disabled} onChange={(event) => setFullName(event.target.value)} /></label>
    <label className={styles.field}>Nome no crachá<input value={badgeName} required disabled={disabled} onChange={(event) => setBadgeName(event.target.value)} /></label>
    <label className={styles.field}>Cargo<input value={role} required disabled={disabled} onChange={(event) => setRole(event.target.value)} /></label>
    <button className={styles.primary} type="submit" disabled={disabled}>Enviar credencial</button>
  </form>;
}

function CredentialList({ portal, kind }: { portal: Portal; kind: string | null }) {
  const rows = (portal.credentials ?? []).filter((item) => !kind || item.kind === kind);
  if (rows.length === 0) return null;
  return <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Credenciais enviadas"><table><caption>Credenciais enviadas</caption><thead><tr><th>Nome</th><th>Crachá</th><th>Cargo</th><th>Tipo</th></tr></thead><tbody>
    {rows.map((item) => <tr key={item.id}><td>{item.fullName}</td><td>{item.badgeName}</td><td>{item.role}</td><td>{KIND_LABEL[item.kind as keyof typeof KIND_LABEL] ?? item.kind}</td></tr>)}
  </tbody></table></div>;
}

function OrderForm({ form, disabled, onSubmit }: { form: FormItem; disabled: boolean; onSubmit: (input: { formId: string; productId: string; quantity: number }) => void }) {
  const [productId, setProductId] = useState(form.products[0]?.id ?? '');
  const [quantity, setQuantity] = useState(1);
  if (form.products.length === 0) return <p className={styles.muted}>A organização ainda não publicou produtos neste formulário.</p>;
  return <form className={styles.form} onSubmit={(event) => { event.preventDefault(); onSubmit({ formId: form.id, productId, quantity }); }}>
    <label className={styles.field}>Produto
      <select value={productId} disabled={disabled} onChange={(event) => setProductId(event.target.value)}>
        {form.products.map((product) => <option key={product.id} value={product.id}>{product.title} · {money.format(product.priceCents / 100)} / {product.unit}</option>)}
      </select>
    </label>
    <label className={styles.field}>Quantidade<input type="number" min={1} max={999} value={quantity} disabled={disabled} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
    <button className={styles.primary} type="submit" disabled={disabled || !productId}>Enviar pedido</button>
  </form>;
}

function Payments({ portal }: { portal: Portal }) {
  const orders = portal.orders ?? [];
  return <div className={styles.cards}>
    <p className={styles.note}>{portal.paymentNote || 'Os pedidos e valores aparecem aqui. A confirmação fica com a organização. Esta área não emite boleto nem pede cartão.'}</p>
    <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Pagamentos">
      <table>
        <caption>Pagamentos</caption>
        <thead><tr><th>Descrição</th><th>Vencimento</th><th>Valor</th><th>Situação</th></tr></thead>
        <tbody>
          {orders.length === 0 && <tr><td colSpan={4}>Não há pedidos desta empresa.</td></tr>}
          {orders.map((order) => <tr key={order.id}>
            <td>{order.description}<br /><span className={styles.muted}>{order.formTitle} · {order.quantity} {order.unit}</span></td>
            <td>{formatDay(order.dueOn)}</td>
            <td>{money.format((order.priceCents * order.quantity) / 100)}</td>
            <td>{ORDER_LABEL[order.status]}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}

function Downloads({ portal }: { portal: Portal }) {
  const files = portal.downloads ?? [];
  if (files.length === 0) return <p className={styles.card}>No momento não há documentos disponíveis para download.</p>;
  return <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Downloads"><table><caption>Downloads</caption><thead><tr><th>Descrição</th><th>Arquivo</th></tr></thead><tbody>
    {files.map((file) => <tr key={file.id}><td>{file.title}</td><td><a href={file.url} target="_blank" rel="noopener noreferrer">Abrir</a></td></tr>)}
  </tbody></table></div>;
}

