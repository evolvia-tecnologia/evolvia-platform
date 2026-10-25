'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError, api, getToken } from '../lib/api';
import styles from './event-desk.module.css';
import { StockTable, type KitView } from './kit-stock-panel';

type Situation = '' | 'ENTREGUE' | 'PENDENTE' | 'ESTORNADO';

type KitReportSize = { id: string; label: string; active: boolean };

type KitReportItem = {
  protocol: string;
  name: string;
  requestedSizeLabel: string;
  deliveredSizeLabel: string;
  situation: Exclude<Situation, ''>;
  at: string | null;
};

type KitReport = {
  kit: KitView;
  sizes: KitReportSize[];
  page: number;
  pageSize: number;
  total: number;
  items: KitReportItem[];
};

const SITUATION_LABEL = { ENTREGUE: 'Entregue', PENDENTE: 'Pendente', ESTORNADO: 'Estornado' } as const;

function queryOf(filters: { situation: Situation; sizeId: string; from: string; to: string }, page: number) {
  const params = new URLSearchParams();
  if (filters.situation) params.set('situation', filters.situation);
  if (filters.sizeId) params.set('sizeId', filters.sizeId);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  params.set('page', String(page));
  params.set('pageSize', '25');
  return params.toString();
}

function formatWhen(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

async function errorMessage(response: Response) {
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string }; message?: string };
  return payload.error?.message || payload.message || 'Não foi possível exportar o relatório.';
}

export default function KitReport({ eventId, organizer }: { eventId: string; organizer: boolean }) {
  const [situation, setSituation] = useState<Situation>('');
  const [sizeId, setSizeId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [reportState, setReport] = useState<KitReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [loadedEventId, setLoadedEventId] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const currentScope = useRef({ eventId, organizer });
  currentScope.current = { eventId, organizer };
  const report = loadedEventId === eventId ? reportState : null;
  const filters = { situation, sizeId, from, to };

  useEffect(() => {
    let active = true;
    const version = ++requestVersion.current;
    const current = () => active && version === requestVersion.current && currentScope.current.eventId === eventId;
    setLoading(true);
    setExporting(false);
    setReport(null);
    setLoadedEventId(null);
    setError('');
    api<KitReport>(`/events/${encodeURIComponent(eventId)}/desk/kit/report?${queryOf(filters, page)}`)
      .then((next) => {
        if (!current()) return;
        setReport(next);
        setLoadedEventId(eventId);
        setError('');
      })
      .catch(() => {
        if (!current()) return;
        setError('Não foi possível abrir o relatório de kits.');
      })
      .finally(() => { if (current()) setLoading(false); });
    return () => { active = false; requestVersion.current++; };
  }, [eventId, organizer, situation, sizeId, from, to, page]);

  function apply(event: FormEvent) {
    event.preventDefault();
    setPage(1);
  }

  function clearFilters() {
    setSituation('');
    setSizeId('');
    setFrom('');
    setTo('');
    setPage(1);
  }

  async function download() {
    if (!organizer || loading || exporting || loadedEventId !== eventId) return;
    const version = requestVersion.current;
    const current = () => version === requestVersion.current && currentScope.current.eventId === eventId && currentScope.current.organizer;
    setExporting(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (situation) params.set('situation', situation);
      if (sizeId) params.set('sizeId', sizeId);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const headers = new Headers();
      const token = getToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/desk/kit/export?${params.toString()}`, {
        headers,
        cache: 'no-store',
      });
      if (!current()) return;
      if (!response.ok) throw new ApiError(await errorMessage(response), response.status);
      const blob = await response.blob();
      if (!current()) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'relatorio-kits.csv';
      try {
        document.body.appendChild(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        URL.revokeObjectURL(url);
      }
    } catch (reason) {
      if (!current()) return;
      setError(reason instanceof Error ? reason.message : 'Não foi possível exportar o relatório.');
    } finally {
      if (current()) setExporting(false);
    }
  }

  const pages = Math.max(1, Math.ceil((report?.total ?? 0) / (report?.pageSize || 25)));

  return <section className={styles.kit} aria-labelledby="kit-report-title" aria-busy={loading || exporting}>
    <h3 id="kit-report-title">Relatório de kits</h3>
    <p>A preferência de tamanho não reserva estoque. O resumo conta apenas camisas entregues que ainda não foram estornadas.</p>
    <StockTable sizes={report?.kit.sizes ?? []} />
    <form onSubmit={apply}>
      <div className={styles.kitFilters}>
        <label>Situação
          <select value={situation} onChange={(event) => { setSituation(event.target.value as Situation); setPage(1); }}>
            <option value="">Todas</option>
            <option value="ENTREGUE">Entregue</option>
            <option value="PENDENTE">Pendente</option>
            <option value="ESTORNADO">Estornado</option>
          </select>
        </label>
        <label>Tamanho entregue
          <select value={sizeId} onChange={(event) => { setSizeId(event.target.value); setPage(1); }}>
            <option value="">Todos</option>
            {(report?.sizes ?? []).map((size) => <option key={size.id} value={size.id}>{size.active ? size.label : `${size.label} (inativo)`}</option>)}
          </select>
        </label>
        <label>Entrega a partir de
          <input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
        </label>
        <label>Entrega até
          <input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
        </label>
      </div>
      <div className={styles.kitActions}>
        <button type="submit" disabled={loading}>Filtrar</button>
        <button type="button" onClick={clearFilters} disabled={loading}>Limpar</button>
        {organizer && <button type="button" onClick={() => void download()} disabled={loading || exporting || loadedEventId !== eventId}>{exporting ? 'Exportando…' : 'Exportar CSV'}</button>}
      </div>
    </form>
    {organizer && <p>A exportação traz todas as linhas do filtro, no máximo 5.000. Ela não inclui documento, e-mail, token nem identificador interno.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {loading && <p role="status">Carregando relatório…</p>}
    {!loading && report && report.total === 0 && <p role="status">Nenhuma inscrição corresponde a estes filtros.</p>}
    {!loading && report && report.items.length > 0 && <table className={styles.kitTable}>
      <caption>Entregas de kit, página {report.page} de {pages}</caption>
      <thead>
        <tr>
          <th scope="col">Protocolo</th>
          <th scope="col">Nome</th>
          <th scope="col">Tamanho solicitado</th>
          <th scope="col">Tamanho entregue</th>
          <th scope="col">Situação</th>
          <th scope="col">Data/hora</th>
        </tr>
      </thead>
      <tbody>
        {report.items.map((item) => <tr key={item.protocol}>
          <th scope="row">{item.protocol}</th>
          <td>{item.name}</td>
          <td>{item.requestedSizeLabel}</td>
          <td>{item.deliveredSizeLabel}</td>
          <td>{SITUATION_LABEL[item.situation]}</td>
          <td>{formatWhen(item.at)}</td>
        </tr>)}
      </tbody>
    </table>}
    {report && report.total > report.pageSize && <div className={styles.kitPager}>
      <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={loading || page <= 1}>Anterior</button>
      <p>Página {page} de {pages}</p>
      <button type="button" onClick={() => setPage((current) => current + 1)} disabled={loading || page >= pages}>Próxima</button>
    </div>}
  </section>;
}

