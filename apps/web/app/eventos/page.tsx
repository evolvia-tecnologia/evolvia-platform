import type { Metadata } from 'next';
import Link from 'next/link';
import { formatEventDate } from '../../lib/event-time-zone';
import styles from './page.module.css';

type PublicEventItem = {
  name: string;
  slug: string;
  format: 'IN_PERSON' | 'ONLINE' | 'HYBRID';
  startDate: string | null;
  endDate: string | null;
  timeZone: string | null;
  venue: string | null;
  shortDescription: string | null;
};

type DiscoveryResult = {
  items: PublicEventItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type DiscoveryPeriod = 'CURRENT' | 'PAST' | 'ALL';

const API_BASE_URL = process.env.EVOLVIA_API_INTERNAL_URL ?? 'http://api:4000';
const PUBLIC_BASE_URL = (process.env.EVOLVIA_PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const PUBLIC_INDEXING_ENABLED = process.env.EVOLVIA_PUBLIC_INDEXING === '1';

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function normalizedFormat(value: string): PublicEventItem['format'] | '' {
  return value === 'IN_PERSON' || value === 'ONLINE' || value === 'HYBRID' ? value : '';
}

function normalizedPeriod(value: string): DiscoveryPeriod {
  return value === 'PAST' || value === 'ALL' ? value : 'CURRENT';
}

function normalizedDate(value: string): string {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) return '';

  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) return '';
  return normalized;
}

function saoPauloDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: 'year' | 'month' | 'day') => parts.find((part) => part.type === type)?.value ?? '';
  return value('year') + '-' + value('month') + '-' + value('day');
}

function positivePage(value: string): number {
  const page = Number(value);
  return Number.isFinite(page) && page > 0 ? Math.trunc(page) : 1;
}

function formatLabel(format: PublicEventItem['format']): string {
  if (format === 'ONLINE') return 'Online';
  if (format === 'HYBRID') return 'Híbrido';
  return 'Presencial';
}

function isInProgress(event: PublicEventItem, now: Date): boolean {
  if (!event.startDate || !event.endDate) return false;
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= now && end >= now;
}

function queryString(input: { q: string; format: string; period: DiscoveryPeriod; from: string; page: number }): string {
  const params = new URLSearchParams();
  if (input.q) params.set('q', input.q);
  if (input.format) params.set('format', input.format);
  if (input.period !== 'CURRENT') params.set('period', input.period);
  if (input.from) params.set('from', input.from);
  if (input.page > 1) params.set('page', String(input.page));
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

async function discoverEvents(input: { q: string; format: string; from: string; until: string; page: number }): Promise<DiscoveryResult> {
  const params = new URLSearchParams({ page: String(input.page), pageSize: '12' });
  if (input.q) params.set('q', input.q);
  if (input.format) params.set('format', input.format);
  if (input.from) params.set('from', input.from);
  if (input.until) params.set('until', input.until);

  const response = await fetch(`${API_BASE_URL}/public/events?${params.toString()}`, {
    next: { revalidate: 60 },
  });
  if (!response.ok) throw new Error('Não foi possível carregar os eventos publicados.');
  return response.json() as Promise<DiscoveryResult>;
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  const q = one(params.q).trim();
  const format = normalizedFormat(one(params.format));
  const from = normalizedDate(one(params.from));
  const period = normalizedPeriod(one(params.period));
  const page = positivePage(one(params.page));
  const hasFacet = Boolean(q || format || from || period !== 'CURRENT' || page > 1);
  const canonical = `${PUBLIC_BASE_URL}/eventos`;
  const canIndex = PUBLIC_INDEXING_ENABLED && !hasFacet;

  return {
    title: 'Eventos publicados',
    description: 'Descubra eventos publicados na Evolvia por nome, local, formato e data.',
    alternates: { canonical },
    robots: canIndex ? { index: true, follow: true } : { index: false, follow: PUBLIC_INDEXING_ENABLED },
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      siteName: 'Evolvia',
      title: 'Eventos publicados',
      description: 'Descubra eventos publicados na Evolvia.',
      url: canonical,
    },
  };
}

export default async function EventsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = one(params.q).trim().slice(0, 120);
  const format = normalizedFormat(one(params.format));
  const requestedFrom = normalizedDate(one(params.from));
  const period = requestedFrom ? 'CURRENT' : normalizedPeriod(one(params.period));
  const page = positivePage(one(params.page));
  const today = saoPauloDateKey();
  const from = requestedFrom || (period === 'CURRENT' ? today : '');
  const until = period === 'PAST' ? today : '';
  const result = await discoverEvents({ q, format, from, until, page });
  const now = new Date();

  const previousHref = result.page > 1
    ? `/eventos${queryString({ q, format, period, from: requestedFrom, page: result.page - 1 })}`
    : null;
  const nextHref = result.page < result.totalPages
    ? `/eventos${queryString({ q, format, period, from: requestedFrom, page: result.page + 1 })}`
    : null;

  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <main id="main-content" className={styles.page} tabIndex={-1}>
    <header className={styles.siteHeader}>
      <Link href="/" className={`brand ${styles.brand}`} aria-label="Evolvia — início">EVOLVIA</Link>
      <nav className={styles.nav} aria-label="Navegação principal">
        <Link href="/eventos" aria-current="page">Eventos</Link>
        <Link href="/login">Área do organizador</Link>
      </nav>
    </header>

    <section className={styles.hero} aria-labelledby="events-title">
      <p className={styles.eyebrow}>DESCUBRA EXPERIÊNCIAS REAIS</p>
      <h1 id="events-title">Eventos publicados na Evolvia</h1>
      <p>Busque apenas entre eventos que já estão publicados. Novos filtros aparecem quando houver dados canônicos confiáveis para sustentá-los.</p>

      <form className={styles.filters} method="get" action="/eventos" role="search">
        <label className={styles.field}>
          <span>Nome ou local</span>
          <input name="q" type="search" defaultValue={q} maxLength={120} placeholder="Ex.: congresso, São Paulo" />
        </label>
        <label className={styles.field}>
          <span>Formato</span>
          <select name="format" defaultValue={format}>
            <option value="">Todos os formatos</option>
            <option value="IN_PERSON">Presencial</option>
            <option value="ONLINE">Online</option>
            <option value="HYBRID">Híbrido</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Período</span>
          <select name="period" defaultValue={period}>
            <option value="CURRENT">Próximos e em andamento</option>
            <option value="PAST">Eventos realizados</option>
            <option value="ALL">Todos os publicados</option>
          </select>
        </label>
        <button type="submit">Buscar eventos</button>
        {(q || format || requestedFrom || period !== 'CURRENT') && <Link className={styles.clearLink} href="/eventos">Limpar filtros</Link>}
      </form>
    </section>

    <section className={styles.results} aria-labelledby="results-title">
      <div className={styles.resultsHeading}>
        <div>
          <p className={styles.eyebrow}>CATÁLOGO PÚBLICO</p>
          <h2 id="results-title">{result.total === 1 ? '1 evento encontrado' : `${result.total} eventos encontrados`}</h2>
          <p className={styles.periodSummary}>{requestedFrom
            ? `Em andamento ou após ${formatEventDate(requestedFrom + 'T00:00:00.000Z', 'UTC', { dateStyle: 'medium' })}`
            : period === 'PAST'
              ? 'Eventos já realizados, do mais recente para o mais antigo'
              : period === 'ALL'
                ? 'Todos os eventos publicados'
                : 'Próximos eventos e eventos em andamento'}</p>
        </div>
        {result.totalPages > 1 && <p>Página {result.page} de {result.totalPages}</p>}
      </div>

      {result.items.length === 0 ? <div className={styles.empty} role="status">
        <h3>Nenhum evento publicado corresponde à busca.</h3>
        <p>Tente outro termo, outro período ou remova um dos filtros.</p>
      </div> : <div className={styles.grid}>
        {result.items.map((event) => {
          const startsAt = formatEventDate(event.startDate, event.timeZone, { dateStyle: 'medium' });
          return <article className={styles.card} key={event.slug}>
            <div className={styles.cardMeta}>
              {isInProgress(event, now) && <span className={styles.live}>Em andamento</span>}
              <span>{formatLabel(event.format)}</span>
              {startsAt && <span>{startsAt}</span>}
            </div>
            <h3><Link href={`/evento/${encodeURIComponent(event.slug)}`}>{event.name}</Link></h3>
            {event.shortDescription && <p>{event.shortDescription}</p>}
            {event.venue && <p className={styles.venue}>{event.venue}</p>}
            <Link className={styles.cardAction} href={`/evento/${encodeURIComponent(event.slug)}`} aria-label={`Ver informações de ${event.name}`}>
              Ver informações
            </Link>
          </article>;
        })}
      </div>}

      {(previousHref || nextHref) && <nav className={styles.pagination} aria-label="Paginação dos eventos">
        {previousHref ? <Link href={previousHref}>← Página anterior</Link> : <span />}
        {nextHref && <Link href={nextHref}>Próxima página →</Link>}
      </nav>}
      </section>
    </main>
  </>;
}
