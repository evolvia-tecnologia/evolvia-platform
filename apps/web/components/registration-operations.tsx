'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './registration-operations.module.css';

type Status = 'ALL' | 'PENDING_PAYMENT' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';
type Item = {
  protocol: string; status: Exclude<Status, 'ALL'>; category: string; lot: string;
  finalPriceCents: number | null; paymentStatus: string | null; createdAt: string;
  confirmedAt: string | null; checkedInAt: string | null;
};
type Payload = {
  event: { id: string; name: string };
  operatorMode: boolean;
  categories: { id: string; name: string }[];
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

type SearchKind = 'NAME' | 'DOCUMENT' | 'EMAIL' | 'CATEGORY' | 'PROTOCOL';
type SearchResults = {
  event: { id: string; name: string }; page: number; hasMore: boolean;
  items: { name: string; protocol: string; category: string; status: Exclude<Status, 'ALL'>; checkedInAt: string | null }[];
};
const searchLabels: Record<SearchKind, string> = {
  NAME: 'Nome', DOCUMENT: 'CPF ou documento', EMAIL: 'E-mail',
  CATEGORY: 'Categoria', PROTOCOL: 'Código da inscrição',
};

function AccreditationSearch({ eventId, categories }: { eventId: string; categories: Payload['categories'] }) {
  const [kind, setKind] = useState<SearchKind>('NAME');
  const [value, setValue] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function find(pageNumber: number) {
    if (!value.trim() || busy) return;
    setBusy(true); setError(''); setResults(null);
    try {
      const found = await api<SearchResults>(`/events/${encodeURIComponent(eventId)}/registration-operations/search`, {
        method: 'POST', body: JSON.stringify({ kind, value: value.trim(), page: pageNumber }),
      });
      setResults(found);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível consultar as inscrições.');
    } finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void find(1); }
  return <section className={styles.card} aria-labelledby="assisted-search-title">
    <h2 id="assisted-search-title">Credenciamento convencional</h2>
    <p>Localize uma inscrição deste evento. Consulte somente os dados necessários para o atendimento.</p>
    <form className={styles.assistedForm} onSubmit={submit}>
      <label htmlFor="assisted-kind">Buscar por
        <select id="assisted-kind" value={kind} onChange={(event) => {
          setKind(event.target.value as SearchKind); setValue(''); setResults(null); setError('');
        }}>{Object.entries(searchLabels).map(([code, label]) =>
          <option key={code} value={code}>{label}</option>)}</select>
      </label>
      <label htmlFor="assisted-value">{searchLabels[kind]}
        {kind === 'CATEGORY' ? <select id="assisted-value" required value={value}
          onChange={(event) => setValue(event.target.value)}>
          <option value="">Selecione a categoria</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select> : <input id="assisted-value" required autoComplete="off" value={value}
          maxLength={kind === 'EMAIL' ? 254 : kind === 'NAME' ? 80 : 50}
          placeholder={kind === 'NAME' ? 'Ao menos três letras' : kind === 'DOCUMENT' ? 'CPF ou documento completo' :
            kind === 'EMAIL' ? 'E-mail completo' : 'EVO-...'}
          onChange={(event) => setValue(event.target.value)} />}
      </label>
      <button type="submit" disabled={busy || !value.trim()}>{busy ? 'Consultando…' : 'Localizar'}</button>
    </form>
    <p className={styles.searchHint}>Buscas são auditadas e limitadas. O documento e o e-mail precisam estar completos.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {results && <div role="status" aria-live="polite">
      <p>{results.items.length === 0 ? 'Nenhuma inscrição encontrada.' : 'Inscrições localizadas neste evento:'}</p>
      {results.items.length > 0 && <div className={styles.tableWrap}>
        <table><caption>Resultados da busca assistida</caption>
          <thead><tr><th scope="col">Participante</th><th scope="col">Protocolo</th>
            <th scope="col">Categoria</th><th scope="col">Inscrição</th><th scope="col">Entrada</th></tr></thead>
          <tbody>{results.items.map((item) => <tr key={item.protocol}>
            <th scope="row">{item.name}</th><td>{item.protocol}</td><td>{item.category}</td>
            <td>{labels[item.status]}</td><td>{item.checkedInAt ? time(item.checkedInAt) : 'Não registrada'}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      <nav className={styles.pagination} aria-label="Páginas da busca assistida">
        <button type="button" disabled={busy || results.page <= 1} onClick={() => { void find(results.page - 1); }}>Anterior</button>
        <span>Página {results.page}</span>
        <button type="button" disabled={busy || !results.hasMore} onClick={() => { void find(results.page + 1); }}>Próxima</button>
      </nav>
      <p className={styles.searchHint}>Conferir a inscrição não registra entrada. Para check-in, use a função de leitura autorizada.</p>
    </div>}
  </section>;
}

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

  return <main className={styles.page}>
    <Link href={payload?.operatorMode ? `/eventos/${eventId}/operacao` : `/eventos/${eventId}/painel`}>← Voltar aos eventos</Link>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>OPERAÇÃO DO EVENTO</p><h1>Inscrições e presenças</h1>
        <p>Consulte a situação das inscrições e acompanhe as entradas registradas.</p></div>
      {!payload?.operatorMode && <Link className={styles.action} href={`/eventos/${eventId}/painel/check-in`}>Abrir check-in</Link>}
    </header>

    {payload?.event.id === eventId && <section aria-label="Resumo do evento" className={styles.summary}>
      <div><span>Confirmadas</span><strong>{payload.summary.CONFIRMED}</strong></div>
      {!payload.operatorMode && <div><span>Aguardando pagamento</span><strong>{payload.summary.PENDING_PAYMENT}</strong></div>}
      <div><span>Check-ins</span><strong>{payload.summary.checkedIn}</strong></div>
    </section>}

    {payload?.event.id === eventId && <AccreditationSearch eventId={eventId} categories={payload.categories} />}

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
            <thead><tr><th scope="col">Protocolo</th><th scope="col">Categoria e lote</th><th scope="col">Inscrição</th>{!payload.operatorMode && <><th scope="col">Pagamento</th><th scope="col">Valor</th></>}<th scope="col">Entrada</th></tr></thead>
            <tbody>{payload.items.map((item) => <tr key={item.protocol}>
              <th scope="row">{item.protocol}<small> {time(item.createdAt)}</small></th>
              <td>{item.category}<small>{item.lot}</small></td>
              <td>{labels[item.status]}</td>
              {!payload.operatorMode && <><td>{item.paymentStatus ? paymentLabels[item.paymentStatus] ?? 'Em verificação' : item.finalPriceCents === 0 ? 'Isento' : 'Aguardando pagamento'}</td>
              <td>{money.format((item.finalPriceCents ?? 0) / 100)}</td></>}
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
