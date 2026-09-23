'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './registration-operations.module.css';

type Status = 'ALL' | 'PENDING_PAYMENT' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';
type Item = {
  protocol: string; status: Exclude<Status, 'ALL'>; category: string; lot: string;
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
    setLoading(true); setPage(1); setProtocol(input.trim().toUpperCase());
    setReload((value) => value + 1);
  }
  function filter(value: Status) { setLoading(true); setPage(1); setStatus(value); }
  function changePage(value: number) { setLoading(true); setPage(value); }

  return <main className={styles.page}>
    <Link href={`/eventos/${eventId}/painel`}>← Voltar ao painel do evento</Link>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>OPERAÇÃO DO EVENTO</p><h1>Inscrições e presenças</h1>
        <p>Consulte a situação das inscrições e acompanhe as entradas registradas.</p></div>
      <Link className={styles.action} href={`/eventos/${eventId}/painel/check-in`}>Abrir check-in</Link>
    </header>

    {payload && <section aria-label="Resumo do evento" className={styles.summary}>
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
        <button type="button" onClick={() => { setLoading(true); setReload((value) => value + 1); }}>Atualizar</button>
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {loading && <p role="status">Carregando inscrições…</p>}
      {!loading && payload && <>
        <p role="status">{payload.total} inscrição(ões) encontrada(s).</p>
        {payload.items.length === 0 ? <p>Nenhuma inscrição para este filtro.</p> : <div className={styles.tableWrap}>
          <table><caption>Inscrições do evento</caption>
            <thead><tr><th scope="col">Protocolo</th><th scope="col">Categoria e lote</th><th scope="col">Inscrição</th><th scope="col">Pagamento</th><th scope="col">Valor</th><th scope="col">Entrada</th></tr></thead>
            <tbody>{payload.items.map((item) => <tr key={item.protocol}>
              <th scope="row">{item.protocol}<small> {time(item.createdAt)}</small></th>
              <td>{item.category}<small>{item.lot}</small></td>
              <td>{labels[item.status]}</td>
              <td>{item.paymentStatus ? paymentLabels[item.paymentStatus] ?? 'Em verificação' : item.finalPriceCents === 0 ? 'Isento' : 'Sem cobrança'}</td>
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
