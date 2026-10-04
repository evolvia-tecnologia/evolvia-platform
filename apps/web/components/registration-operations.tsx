'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './registration-operations.module.css';

type Status = 'ALL' | 'PENDING_PAYMENT' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';
type Item = {
  protocol: string; status: Exclude<Status, 'ALL'>; category: string; lot: string;
  categoryProof: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'MISSING' | 'NOT_SENT' | null;
  finalPriceCents: number; paymentStatus: string | null; createdAt: string;
  confirmedAt: string | null; checkedInAt: string | null;
};
type Payload = {
  event: { id: string; name: string };
  summary: Record<Exclude<Status, 'ALL'>, number> & { checkedIn: number };
  page: number; pageSize: number; total: number; items: Item[];
};
const labels: Record<Status, string> = {
  ALL: 'Todas', PENDING_PAYMENT: 'Aguardando pagamento', CONFIRMED: 'Confirmada',
  EXPIRED: 'Expirada', CANCELLED: 'Cancelada',
};
const paymentLabels: Record<string, string> = {
  CREATING: 'Criando cobrança', ACTIVE: 'Aguardando pagamento', PAID: 'Pago',
  PAID_REVIEW: 'Em conciliação', CANCELED: 'Cancelado', EXPIRED: 'Expirado',
  FAILED: 'Falhou', UNKNOWN: 'Em verificação',
};
const proofLabels: Record<NonNullable<Item['categoryProof']>, string> = {
  MISSING: 'Aguardando PDF', NOT_SENT: 'Não enviado', PENDING_REVIEW: 'Em análise', APPROVED: 'Aprovado', REJECTED: 'Recusado',
};
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const time = (value: string) => new Date(value).toLocaleString('pt-BR');

export default function RegistrationOperations({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('ALL');
  const [input, setInput] = useState('');
  const [protocol, setProtocol] = useState('');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    let active = true;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), status });
    if (protocol) params.set('protocol', protocol);
    api<Payload>(`/events/${encodeURIComponent(eventId)}/registration-operations?${params}`)
      .then((value) => { if (active) { setPayload(value); setError(''); } })
      .catch((reason) => {
        if (active) { setPayload(null); setError(reason instanceof Error ? reason.message : 'Não foi possível carregar inscrições.'); }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventId, page, status, protocol, reload, router]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1); setProtocol(input.trim().toUpperCase());
    setReload((value) => value + 1);
  }
  function filter(value: Status) { setPage(1); setStatus(value); }
  function changePage(value: number) { setPage(value); }

  async function openProof(protocol: string) {
    const token = getToken();
    const preview = window.open('', '_blank');
    if (!preview) { setError('O navegador bloqueou a abertura do comprovante.'); return; }
    preview.opener = null;
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/registration-operations/${encodeURIComponent(protocol)}/category-proof/file`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) { preview.close(); setError('Não foi possível abrir o comprovante.'); return; }
      const url = URL.createObjectURL(await response.blob());
      preview.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      preview.close();
      setError('Não foi possível abrir o comprovante.');
    }
  }

  async function reviewProof(protocol: string, decision: 'APPROVED' | 'REJECTED') {
    setError('');
    try {
      await api(`/events/${encodeURIComponent(eventId)}/registration-operations/${encodeURIComponent(protocol)}/category-proof`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      setReload((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível registrar a análise do comprovante.');
    }
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>OPERAÇÃO DO EVENTO</p><h1>Inscrições e presenças</h1>
        <p>Consulte a situação das inscrições e acompanhe as entradas registradas.</p></div>
      <Link className={styles.action} href={`/eventos/${eventId}/painel/check-in`}>Abrir posto</Link>
    </header>

    {payload?.event.id === eventId && <section aria-label="Resumo do evento" className={styles.summary}>
      <div><span>Confirmadas</span><strong>{payload.summary.CONFIRMED}</strong></div>
      <div><span>Aguardando pagamento</span><strong>{payload.summary.PENDING_PAYMENT}</strong></div>
      <div><span>Check-ins</span><strong>{payload.summary.checkedIn}</strong></div>
    </section>}

    <section aria-labelledby="registration-list-title" className={styles.card}>
      <h2 id="registration-list-title">Lista de inscrições</h2>
      <div className={styles.filters}>
        <label>Situação
          <select value={status} onChange={(event) => filter(event.target.value as Status)}>
            {Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <form onSubmit={search}>
          <label htmlFor="registration-protocol">Protocolo exato</label>
          <div className={styles.search}>
            <input id="registration-protocol" value={input} maxLength={20} autoComplete="off"
              placeholder="EVO-..." onChange={(event) => setInput(event.target.value)} />
            <button type="submit">Buscar</button>
          </div>
        </form>
        <button type="button" onClick={() => setReload((value) => value + 1)}>Atualizar</button>
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {loading && <p role="status">Carregando inscrições…</p>}
      {!loading && payload?.event.id === eventId && <>
        <p role="status">{payload.total} inscrição(ões) encontrada(s).</p>
        {payload.items.length === 0 ? <p>Nenhuma inscrição para este filtro.</p> : <div className={styles.tableWrap}>
          <table><caption>Inscrições do evento</caption>
            <thead><tr><th scope="col">Protocolo</th><th scope="col">Categoria e lote</th><th scope="col">Comprovante</th><th scope="col">Inscrição</th><th scope="col">Pagamento</th><th scope="col">Valor</th><th scope="col">Entrada</th></tr></thead>
            <tbody>{payload.items.map((item) => <tr key={item.protocol}>
              <th scope="row">{item.protocol}<small> {time(item.createdAt)}</small></th>
              <td>{item.category}<small>{item.lot}</small></td>
              <td>{item.categoryProof ? <>
                <span>{proofLabels[item.categoryProof]}</span>
                {item.categoryProof !== 'MISSING' && item.categoryProof !== 'NOT_SENT' && <button type="button" onClick={() => void openProof(item.protocol)}>Abrir PDF</button>}
                {item.categoryProof === 'PENDING_REVIEW' && <>
                  <button type="button" onClick={() => void reviewProof(item.protocol, 'APPROVED')}>Aprovar</button>
                  <button type="button" onClick={() => void reviewProof(item.protocol, 'REJECTED')}>Recusar</button>
                </>}
              </> : 'Não exigido'}</td>
              <td>{labels[item.status]}</td>
              <td>{item.paymentStatus ? paymentLabels[item.paymentStatus] ?? 'Em verificação' : item.finalPriceCents === 0 ? 'Isento' : 'Aguardando pagamento'}</td>
              <td>{money.format(item.finalPriceCents / 100)}</td>
              <td>{item.checkedInAt ? time(item.checkedInAt) : 'Não registrada'}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <nav className={styles.pagination} aria-label="Páginas de inscrições">
          <button type="button" disabled={page <= 1} onClick={() => changePage(page - 1)}>Anterior</button>
          <span>Página {payload.page} de {Math.max(1, Math.ceil(payload.total / payload.pageSize))}</span>
          <button type="button" disabled={page * payload.pageSize >= payload.total || page >= 1000} onClick={() => changePage(page + 1)}>Próxima</button>
        </nav>
      </>}
    </section>
  </main>;
}

