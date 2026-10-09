'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { ApiError, api, getToken } from '../lib/api';
import styles from './event-exhibitors.module.css';

type Kind = 'EXHIBITOR' | 'ASSEMBLER' | 'SERVICE';
type Summary = { companies: number; credentials: number; credentialed: number; pending: number; printed: number };
type Company = { id: string; kind: 'EXHIBITOR' | 'PROVIDER'; legalName: string; tradeName: string; document: string; booth: string };
type Credential = {
  id: string; companyId: string; companyTradeName: string; companyKind: 'EXHIBITOR' | 'PROVIDER';
  kind: Kind; nationality: 'BRAZILIAN' | 'FOREIGN'; document: string; fullName: string; badgeName: string;
  role: string; phone: string; mobile: string; credentialedAt: string | null; printedAt: string | null;
};
type Home = {
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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
}

function printBadge(item: Credential) {
  const frame = document.createElement('iframe');
  frame.title = 'Crachá do expositor';
  frame.style.position = 'fixed';
  frame.style.left = '-10000px';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Crachá</title><style>body{font-family:sans-serif;margin:32px;color:#111}p{margin:0 0 8px}h1{margin:12px 0;font-size:32px}</style></head><body><p>${escapeHtml(KIND_LABEL[item.kind])}</p><h1>${escapeHtml(item.badgeName)}</h1><p>${escapeHtml(item.companyTradeName)}</p><p>${escapeHtml(item.role)}</p></body></html>`);
  doc.close();
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  window.setTimeout(() => frame.remove(), 1000);
}

export default function ExhibitorCaex({ eventId }: { eventId: string }) {
  const panelId = useId();
  const [home, setHome] = useState<Home | null>(null);
  const [section, setSection] = useState<Section>('home');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'ALL' | Kind>('ALL');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setHome(await api<Home>(`/events/${encodeURIComponent(eventId)}/exhibitor`));
    setError('');
  }

  useEffect(() => {
    if (!getToken()) { setError('Entre com a equipe autorizada do evento para abrir o CAEX.'); return; }
    let active = true;
    load().catch((caught: unknown) => {
      if (active) setError(caught instanceof ApiError ? caught.message : 'Não foi possível abrir o CAEX.');
    });
    return () => { active = false; };
  }, [eventId]);

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); setNotice(done); }
    catch (caught: unknown) { setError(caught instanceof Error ? caught.message : 'Não foi possível concluir.'); }
    finally { setBusy(false); }
  }

  async function attendance(item: Credential, next: { credentialed: boolean; printed: boolean }, done: string) {
    await run(async () => {
      await api(`/events/${encodeURIComponent(eventId)}/exhibitor/credentials/${item.id}/attendance`, {
        method: 'POST', body: JSON.stringify(next),
      });
      await load();
    }, done);
  }

  if (!home && !error) return <p className={styles.loading} role="status">A EVA está abrindo o CAEX...</p>;
  if (!home) return <p className={styles.error} role="alert">{error}</p>;

  const needle = query.trim().toLowerCase();
  const audience = section === 'provider-credentials' ? 'PROVIDER' : 'EXHIBITOR';
  const credentials = home.credentials.filter((item) => {
    if (section.endsWith('credentials') && item.companyKind !== audience) return false;
    if (kind !== 'ALL' && item.kind !== kind) return false;
    if (!needle) return true;
    return `${item.fullName} ${item.badgeName} ${item.companyTradeName}`.toLowerCase().includes(needle);
  });

  return <section className={styles.panel} aria-busy={busy}>
    <header className={styles.hero}>
      <p className={styles.eyebrow}>CAEX</p>
      <h1>Central de atendimento ao expositor</h1>
      <p>Credencie expositores e prestadores, consulte a baixa e imprima o crachá. O acesso é o da equipe autorizada. Não há senha compartilhada do evento.</p>
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.tabs} role="tablist" aria-label="CAEX">
      {SECTIONS.map((item, index) => <button key={item.id} id={`${panelId}-${item.id}`} className={section === item.id ? styles.tabActive : styles.tab} type="button" role="tab" aria-selected={section === item.id} aria-controls={`${panelId}-panel`} tabIndex={section === item.id ? 0 : -1} onClick={() => setSection(item.id)} onKeyDown={(event) => {
        const next = event.key === 'ArrowRight' ? (index + 1) % SECTIONS.length : event.key === 'ArrowLeft' ? (index + SECTIONS.length - 1) % SECTIONS.length : event.key === 'Home' ? 0 : event.key === 'End' ? SECTIONS.length - 1 : null;
        if (next === null) return;
        event.preventDefault();
        setSection(SECTIONS[next].id);
        document.getElementById(`${panelId}-${SECTIONS[next].id}`)?.focus();
      }}>{item.label}</button>)}
    </div>
    <div id={`${panelId}-panel`} role="tabpanel" aria-labelledby={`${panelId}-${section}`} tabIndex={0}>
      {section === 'home' && <div className={styles.metrics}>
        <Metric title="Expositores" summary={home.summary.exhibitors} />
        <Metric title="Prestadores" summary={home.summary.providers} />
      </div>}
      {(section === 'exhibitors' || section === 'providers') && <CompanyList companies={home.companies.filter((item) => item.kind === (section === 'providers' ? 'PROVIDER' : 'EXHIBITOR'))} />}
      {section.endsWith('credentials') && <div className={styles.stack}>
        <form className={styles.filters} onSubmit={(event) => event.preventDefault()}>
          <label className={styles.field}>Nome<input type="search" value={query} placeholder="Informe o nome" onChange={(event) => setQuery(event.target.value)} /></label>
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
                  {home.canManage && <button className={styles.secondary} type="button" disabled={busy} onClick={() => attendance(item, { credentialed: !item.credentialedAt, printed: Boolean(item.printedAt) }, item.credentialedAt ? 'Baixa removida.' : 'Pessoa credenciada.')}>{item.credentialedAt ? 'Tirar baixa' : 'Credenciar'}</button>}
                  <button className={styles.secondary} type="button" onClick={() => printBadge(item)}>Imprimir credencial</button>
                  {home.canManage && <button className={styles.secondary} type="button" disabled={busy} onClick={() => attendance(item, { credentialed: Boolean(item.credentialedAt), printed: !item.printedAt }, item.printedAt ? 'Impressão desmarcada.' : 'Crachá marcado como impresso.')}>{item.printedAt ? 'Desmarcar impressão' : 'Marcar impresso'}</button>}
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>A baixa pode ser desfeita. O cadastro permanece. Para incluir ou corrigir a ficha, use a <Link href={`/eventos/${eventId}/painel/expositores`}>central do expositor</Link>.</p>
      </div>}
    </div>
  </section>;
}

function Metric({ title, summary }: { title: string; summary: Summary }) {
  return <article className={styles.metric}>
    <h2>{title}</h2>
    <p>{summary.companies} empresas</p>
    <p>{summary.credentials} credenciais</p>
    <p>{summary.credentialed} credenciadas</p>
    <p>{summary.pending} pendentes</p>
    <p>{summary.printed} impressas</p>
  </article>;
}

function CompanyList({ companies }: { companies: Company[] }) {
  return <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Lista com rolagem horizontal">
    <table>
      <caption>Listagem de empresas</caption>
      <thead><tr><th>Razão social</th><th>Nome fantasia</th><th>Documento</th><th>Estande</th></tr></thead>
      <tbody>
        {companies.length === 0 && <tr><td colSpan={4}>Nenhuma empresa neste grupo.</td></tr>}
        {companies.map((item) => <tr key={item.id}><td>{item.legalName}</td><td>{item.tradeName}</td><td>{item.document}</td><td>{item.booth || '—'}</td></tr>)}
      </tbody>
    </table>
  </div>;
}
