'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, getToken } from '../../../../../lib/api';
import styles from './page.module.css';

type TicketStatus = 'PAGO' | 'ISENTO' | 'CANCELADO';
type Report = {
  event: { id: string; name: string; slug: string; status: string };
  canManage: boolean;
  tickets: { total: number; paid: number; exempt: number; cancelled: number; validated: number; notValidated: number };
  access: { ticketEntries: number; repeatedAttempts: number; staffEntries: number };
  recentAccesses: Array<{ id: string; kind: 'TICKET' | 'STAFF'; at: string; label: string; detail: string }>;
  staff: Array<{ id: string; displayName: string; duty: string; active: boolean; createdAt: string; revokedAt: string | null }> | null;
  turnstileKeys: Array<{
    id: string; label: string; keyHint: string; shareName: boolean; shareTicketType: boolean; shareStatus: boolean; shareCode: boolean;
    expiresAt: string; revokedAt: string | null; lastUsedAt: string | null; createdAt: string;
  }> | null;
};
type TicketList = {
  page: number; pageSize: number; total: number;
  items: Array<{ protocol: string; category: string; status: TicketStatus; validatedAt: string | null }>;
};
type Share = { shareName: boolean; shareTicketType: boolean; shareStatus: boolean; shareCode: boolean };

const STATUS_LABEL: Record<TicketStatus, string> = { PAGO: 'Pago', ISENTO: 'Isento', CANCELADO: 'Cancelado' };

async function copyText(value: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export default function ShowOperationsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [tickets, setTickets] = useState<TicketList | null>(null);
  const [status, setStatus] = useState('ALL');
  const [validation, setValidation] = useState('ALL');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [origin, setOrigin] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffDuty, setStaffDuty] = useState('');
  const [staffCode, setStaffCode] = useState('');
  const [keyLabel, setKeyLabel] = useState('');
  const [share, setShare] = useState<Share>({ shareName: false, shareTicketType: true, shareStatus: true, shareCode: true });
  const [secret, setSecret] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (nextPage: number, nextStatus: string, nextValidation: string) => {
    const params = new URLSearchParams({ page: String(nextPage), status: nextStatus, validation: nextValidation });
    const [nextReport, list] = await Promise.all([
      api<Report>(`/events/${encodeURIComponent(id)}/show-operations`),
      api<TicketList>(`/events/${encodeURIComponent(id)}/show-operations/tickets?${params.toString()}`),
    ]);
    return { nextReport, list };
  }, [id]);

  useEffect(() => {
    setOrigin(window.location.origin);
    if (!id) return;
    if (!getToken()) { router.replace('/login'); return; }
    let cancelled = false;
    load(page, status, validation)
      .then((result) => {
        if (cancelled) return;
        setReport(result.nextReport);
        setTickets(result.list);
        setError('');
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a operação do show.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, load, page, router, status, validation]);

  async function refresh() {
    setError('');
    const result = await load(page, status, validation);
    setReport(result.nextReport);
    setTickets(result.list);
  }

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice(''); setStaffCode('');
    try {
      const created = await api<{ code: string }>(`/events/${encodeURIComponent(id)}/show-operations/staff`, {
        method: 'POST', body: JSON.stringify({ displayName: staffName, duty: staffDuty }),
      });
      setStaffCode(created.code);
      setStaffName(''); setStaffDuty('');
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar a credencial.');
    } finally { setBusy(false); }
  }

  async function revokeStaff(credentialId: string) {
    if (!window.confirm('Revogar esta credencial de equipe? Ela deixa de abrir a entrada.')) return;
    setBusy(true); setError('');
    try {
      await api(`/events/${encodeURIComponent(id)}/show-operations/staff/${encodeURIComponent(credentialId)}/revoke`, { method: 'POST' });
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível revogar a credencial.');
    } finally { setBusy(false); }
  }

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice(''); setSecret('');
    try {
      const created = await api<{ secret: string }>(`/events/${encodeURIComponent(id)}/show-operations/turnstile-keys`, {
        method: 'POST', body: JSON.stringify({ label: keyLabel, ...share }),
      });
      setSecret(created.secret);
      setKeyLabel('');
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível criar a chave.');
    } finally { setBusy(false); }
  }

  async function revokeKey(keyId: string) {
    if (!window.confirm('Revogar esta chave de catraca? A empresa deixa de consultar e validar ingressos com ela.')) return;
    setBusy(true); setError('');
    try {
      await api(`/events/${encodeURIComponent(id)}/show-operations/turnstile-keys/${encodeURIComponent(keyId)}/revoke`, { method: 'POST' });
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível revogar a chave.');
    } finally { setBusy(false); }
  }

  const slug = report?.event.slug ?? '';
  const base = `${origin}/api/v1/events/${slug}/turnstile`;
  const pages = tickets ? Math.max(1, Math.ceil(tickets.total / tickets.pageSize)) : 1;

  return <main className={styles.page} id="main-content">
    <Link href={`/eventos/${id}/painel`}>← Voltar ao painel do evento</Link>
    <header>
      <p className={styles.eyebrow}>SHOW · ENTRADA</p>
      <h1>Acessos, ingressos e catracas</h1>
      <p>Acompanhe quantos ingressos existem, quais já entraram e quais ainda não foram validados. Credencie a equipe e gere a chave que a empresa de catracas usa na API.</p>
      <p>A compra começa depois da divulgação e das categorias. <Link href={`/eventos/${id}/painel/divulgacao`}>Revisar divulgação</Link> · <Link href={`/eventos/${id}/painel/inscricoes/categorias-lotes`}>Revisar categorias e lotes</Link></p>
      <p><Link href={`/eventos/${id}/painel/check-in`}>Abrir a leitura de ingressos na portaria</Link></p>
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {loading ? <p role="status">Carregando operação do show…</p> : report && <>
      <section className={styles.metrics} aria-label="Resumo dos ingressos">
        <article><span>Ingressos totais</span><strong>{report.tickets.total}</strong></article>
        <article><span>Pagos</span><strong>{report.tickets.paid}</strong></article>
        <article><span>Isentos</span><strong>{report.tickets.exempt}</strong></article>
        <article><span>Cancelados</span><strong>{report.tickets.cancelled}</strong></article>
        <article><span>Validados</span><strong>{report.tickets.validated}</strong></article>
        <article><span>Não validados</span><strong>{report.tickets.notValidated}</strong></article>
      </section>

      <section className={styles.card} aria-labelledby="access-title">
        <h2 id="access-title">Relatório de acessos</h2>
        <div className={styles.metrics}>
          <article><span>Entradas de ingresso</span><strong>{report.access.ticketEntries}</strong></article>
          <article><span>Leituras repetidas</span><strong>{report.access.repeatedAttempts}</strong></article>
          <article><span>Passagens da equipe</span><strong>{report.access.staffEntries}</strong></article>
        </div>
        {report.recentAccesses.length === 0 ? <p>Nenhuma entrada registrada ainda.</p> : <div className={styles.tableWrap}>
          <table>
            <caption>Últimos acessos</caption>
            <thead><tr><th>Quando</th><th>Quem</th><th>Detalhe</th></tr></thead>
            <tbody>
              {report.recentAccesses.map((row) => <tr key={row.id}>
                <td>{new Date(row.at).toLocaleString('pt-BR')}</td>
                <td>{row.kind === 'STAFF' ? `Equipe · ${row.label}` : row.label}</td>
                <td>{row.detail}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </section>

      <section className={styles.card} aria-labelledby="tickets-title">
        <h2 id="tickets-title">Ingressos</h2>
        <p className={styles.note}>A lista mostra protocolo, tipo e status. E-mail e documento não aparecem aqui.</p>
        <div className={styles.filters}>
          <label className={styles.field} htmlFor="ticket-status">Situação do ingresso
            <select id="ticket-status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="ALL">Todos</option>
              <option value="PAGO">Pago</option>
              <option value="ISENTO">Isento</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </label>
          <label className={styles.field} htmlFor="ticket-validation">Validação na entrada
            <select id="ticket-validation" value={validation} onChange={(event) => { setValidation(event.target.value); setPage(1); }}>
              <option value="ALL">Todos</option>
              <option value="VALIDATED">Validados</option>
              <option value="PENDING">Não validados</option>
            </select>
          </label>
        </div>
        {tickets && tickets.items.length === 0 ? <p>Nenhum ingresso neste filtro.</p> : tickets && <div className={styles.tableWrap}>
          <table>
            <caption>Ingressos do show</caption>
            <thead><tr><th>Protocolo</th><th>Tipo</th><th>Status</th><th>Entrada</th></tr></thead>
            <tbody>
              {tickets.items.map((item) => <tr key={item.protocol}>
                <td>{item.protocol}</td>
                <td>{item.category}</td>
                <td>{STATUS_LABEL[item.status]}</td>
                <td>{item.validatedAt ? new Date(item.validatedAt).toLocaleString('pt-BR') : 'Não validado'}</td>
              </tr>)}
            </tbody>
          </table>
        </div>}
        <div className={styles.actions}>
          <button className={styles.secondary} type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Página anterior</button>
          <p role="status">Página {page} de {pages}</p>
          <button className={styles.secondary} type="button" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>Próxima página</button>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="staff-title">
        <h2 id="staff-title">Credenciamento de equipe</h2>
        <p>A credencial da equipe abre a portaria e pode ser usada de novo. O código aparece uma única vez.</p>
        {report.canManage ? <>
          <form className={styles.form} onSubmit={createStaff}>
            <label className={styles.field} htmlFor="staff-name">Nome de exibição
              <input id="staff-name" value={staffName} onChange={(event) => setStaffName(event.target.value)} required minLength={2} maxLength={80} autoComplete="name" />
            </label>
            <label className={styles.field} htmlFor="staff-duty">Função
              <input id="staff-duty" value={staffDuty} onChange={(event) => setStaffDuty(event.target.value)} required minLength={2} maxLength={40} />
            </label>
            <button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Criar credencial'}</button>
          </form>
          {staffCode && <div className={styles.secret} role="status">
            <p>Credencial criada. Guarde o código agora. Ele não será mostrado de novo.</p>
            <input readOnly value={staffCode} aria-label="Código da credencial de equipe" />
            <button type="button" onClick={() => void copyText(staffCode).then((ok) => setNotice(ok ? 'Código copiado.' : 'Não foi possível copiar. Selecione o código e copie manualmente.'))}>Copiar código</button>
          </div>}
          {report.staff && report.staff.length === 0 ? <p>Nenhuma credencial de equipe.</p> : <div className={styles.tableWrap}>
            <table>
              <caption>Equipe credenciada</caption>
              <thead><tr><th>Nome</th><th>Função</th><th>Situação</th><th>Ação</th></tr></thead>
              <tbody>
                {report.staff?.map((member) => <tr key={member.id}>
                  <td>{member.displayName}</td>
                  <td>{member.duty}</td>
                  <td>{member.active ? 'Ativa' : 'Revogada'}</td>
                  <td>{member.active && <button className={styles.secondary} type="button" disabled={busy} onClick={() => void revokeStaff(member.id)}>Revogar</button>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>}
        </> : <p>Somente gestão do evento cria e revoga credenciais de equipe. A portaria continua podendo validar os códigos já emitidos.</p>}
      </section>

      <section className={styles.card} aria-labelledby="turnstile-title">
        <h2 id="turnstile-title">API para empresas de catracas</h2>
        <p>Gere uma chave e marque somente os dados que a empresa pode receber. E-mail, documento e telefone não entram nessa API.</p>
        {slug && <div>
          <p>Listar ingressos: <code>{base}/tickets</code></p>
          <p>Validar entrada: <code>{base}/entries</code></p>
          <p className={styles.note}>A empresa envia o cabeçalho Authorization: Bearer com a chave. A chave vale 90 dias e o evento pode ter até 3 chaves ativas.</p>
        </div>}
        {report.canManage ? <>
          <form className={styles.form} onSubmit={createKey}>
            <label className={styles.field} htmlFor="turnstile-label">Nome da chave
              <input id="turnstile-label" value={keyLabel} onChange={(event) => setKeyLabel(event.target.value)} required minLength={2} maxLength={60} />
            </label>
            <fieldset className={styles.checks}>
              <legend>Dados enviados à catraca</legend>
              <label className={styles.check}><input type="checkbox" checked={share.shareName} onChange={(event) => setShare((current) => ({ ...current, shareName: event.target.checked }))} /><span>Nome do participante</span></label>
              <label className={styles.check}><input type="checkbox" checked={share.shareTicketType} onChange={(event) => setShare((current) => ({ ...current, shareTicketType: event.target.checked }))} /><span>Tipo de ingresso</span></label>
              <label className={styles.check}><input type="checkbox" checked={share.shareStatus} onChange={(event) => setShare((current) => ({ ...current, shareStatus: event.target.checked }))} /><span>Status do ingresso (pago, isento ou cancelado)</span></label>
              <label className={styles.check}><input type="checkbox" checked={share.shareCode} onChange={(event) => setShare((current) => ({ ...current, shareCode: event.target.checked }))} /><span>Código do ingresso</span></label>
            </fieldset>
            <button type="submit" disabled={busy}>{busy ? 'Gerando…' : 'Gerar chave de API'}</button>
          </form>
          {secret && <div className={styles.secret} role="status">
            <p>Chave criada. Copie agora. Ela não será mostrada de novo.</p>
            <input readOnly value={secret} aria-label="Chave da API de catracas" />
            <button type="button" onClick={() => void copyText(secret).then((ok) => setNotice(ok ? 'Chave copiada.' : 'Não foi possível copiar. Selecione a chave e copie manualmente.'))}>Copiar chave</button>
          </div>}
          {report.turnstileKeys && report.turnstileKeys.length === 0 ? <p>Nenhuma chave gerada.</p> : <div className={styles.tableWrap}>
            <table>
              <caption>Chaves de catraca</caption>
              <thead><tr><th>Nome</th><th>Final</th><th>Dados</th><th>Validade</th><th>Ação</th></tr></thead>
              <tbody>
                {report.turnstileKeys?.map((key) => {
                  const expired = new Date(key.expiresAt).getTime() <= Date.now();
                  const fields = [
                    key.shareName ? 'nome' : '',
                    key.shareTicketType ? 'tipo' : '',
                    key.shareStatus ? 'status' : '',
                    key.shareCode ? 'código' : '',
                  ].filter(Boolean).join(', ');
                  return <tr key={key.id}>
                    <td>{key.label}</td>
                    <td>{key.keyHint}</td>
                    <td>{fields}</td>
                    <td>{key.revokedAt ? 'Revogada' : expired ? 'Expirada' : new Date(key.expiresAt).toLocaleDateString('pt-BR')}</td>
                    <td>{!key.revokedAt && <button className={styles.secondary} type="button" disabled={busy} onClick={() => void revokeKey(key.id)}>Revogar</button>}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>}
        </> : <p>Somente gestão do evento gera e revoga chaves de catraca.</p>}
      </section>
    </>}
  </main>;
}
