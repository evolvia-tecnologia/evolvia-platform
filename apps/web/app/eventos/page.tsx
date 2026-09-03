import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../components/public-site-header';
import {
  DISCOVERY_CALENDAR_TIME_ZONE,
  formatCalendarDateKey,
  formatEventDate,
} from '../../lib/event-time-zone';
import {
  formatEstimatedAudience,
  isPublicEventProfile,
  PUBLIC_EVENT_PROFILES,
  publicEventProfileLabel,
  publicEventTypeLabel,
  type PublicEventProfileCode,
} from '../../lib/public-event-profile';
import styles from './page.module.css';

type PublicEventItem = {
  name: string;
  slug: string;
  eventType: string;
  profileCode: PublicEventProfileCode | null;
  estimatedAudience: number | null;
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

function normalizedProfile(value: string): PublicEventProfileCode | '' {
  return isPublicEventProfile(value) ? value : '';
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

function positivePage(value: string): number {
  const page = Number(value);
  return Number.isFinite(page) && page > 0 ? Math.trunc(page) : 1;
}

function formatLabel(format: PublicEventItem['format']): string {
  if (format === 'ONLINE') return 'Online';
  if (format === 'HYBRID') return 'Híbrido';
  return 'Presencial';
}

function periodLabel(period: DiscoveryPeriod): string {
  if (period === 'PAST') return 'Eventos realizados';
  if (period === 'ALL') return 'Todos os publicados';
  return 'Próximos e em andamento';
}

function resultsHeading(total: number): string {
  return total === 1 ? '1 evento encontrado' : `${total} eventos encontrados`;
}

function describeActiveFilters(input: {
  q: string;
  format: PublicEventItem['format'] | '';
  profile: PublicEventProfileCode | '';
  period: DiscoveryPeriod;
  from: string;
}): string {
  const parts: string[] = [];
  if (input.q) parts.push(`nome «${input.q}»`);
  if (input.format) parts.push(`formato ${formatLabel(input.format)}`);
  if (input.profile) parts.push(`perfil ${publicEventProfileLabel(input.profile)}`);
  if (input.from) {
    const fromLabel = formatEventDate(`${input.from}T00:00:00.000Z`, 'UTC', { dateStyle: 'medium' });
    parts.push(fromLabel ? `a partir de ${fromLabel}` : `a partir de ${input.from}`);
  }
  parts.push(`período ${periodLabel(input.period)}`);
  return parts.join(', ');
}

function isInProgress(event: PublicEventItem, now: Date): boolean {
  if (!event.startDate || !event.endDate) return false;
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= now && end >= now;
}

function queryString(input: { q: string; format: string; profile: string; period: DiscoveryPeriod; from: string; page: number }): string {
  const params = new URLSearchParams();
  if (input.q) params.set('q', input.q);
  if (input.format) params.set('format', input.format);
  if (input.profile) params.set('profile', input.profile);
  if (input.period !== 'CURRENT') params.set('period', input.period);
  if (input.from) params.set('from', input.from);
  if (input.page > 1) params.set('page', String(input.page));
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

function resolveDiscoveryWindow(period: DiscoveryPeriod, requestedFrom: string, today: string): { from: string; until: string } {
  return {
    from: requestedFrom || (period === 'CURRENT' ? today : ''),
    until: period === 'PAST' ? today : '',
  };
}

async function discoverEvents(input: { q: string; format: string; profile: string; from: string; until: string; page: number }): Promise<DiscoveryResult> {
  const params = new URLSearchParams({ page: String(input.page), pageSize: '12' });
  if (input.q) params.set('q', input.q);
  if (input.format) params.set('format', input.format);
  if (input.profile) params.set('profile', input.profile);
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
  const profile = normalizedProfile(one(params.profile));
  const from = normalizedDate(one(params.from));
  const period = normalizedPeriod(one(params.period));
  const page = positivePage(one(params.page));
  const hasFacet = Boolean(q || format || profile || from || period !== 'CURRENT' || page > 1);
  const canonical = `${PUBLIC_BASE_URL}/eventos`;
  const canIndex = PUBLIC_INDEXING_ENABLED && !hasFacet;

  return {
    title: 'Eventos publicados',
    description: 'Descubra eventos publicados na Evolvia por nome, tipo, perfil, local, formato e data.',
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
  const profile = normalizedProfile(one(params.profile));
  const requestedFrom = normalizedDate(one(params.from));
  const period = normalizedPeriod(one(params.period));
  const page = positivePage(one(params.page));
  const today = formatCalendarDateKey(new Date(), DISCOVERY_CALENDAR_TIME_ZONE) ?? new Date().toISOString().slice(0, 10);
  const { from, until } = resolveDiscoveryWindow(period, requestedFrom, today);
  const result = await discoverEvents({ q, format, profile, from, until, page });
  const hasActiveFilters = Boolean(q || format || profile || requestedFrom || period !== 'CURRENT');
  const activeFiltersSummary = describeActiveFilters({ q, format, profile, period, from: requestedFrom });
  const filterStatus = hasActiveFilters
    ? `Filtros ativos: ${activeFiltersSummary}.`
    : `Período atual: ${periodLabel(period)}.`;
  const now = new Date();

  const previousHref = result.page > 1
    ? `/eventos${queryString({ q, format, profile, period, from: requestedFrom, page: result.page - 1 })}`
    : null;
  const nextHref = result.page < result.totalPages
    ? `/eventos${queryString({ q, format, profile, period, from: requestedFrom, page: result.page + 1 })}`
    : null;

  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <main id="main-content" className={styles.page} tabIndex={-1}>
    <PublicSiteHeader current="eventos" />

    <section className={styles.hero} aria-labelledby="events-title">
      <p className={styles.eyebrow}>DESCUBRA EXPERIÊNCIAS REAIS</p>
      <h1 id="events-title">Eventos publicados na Evolvia</h1>
      <p id="discovery-search-help">Busque apenas entre eventos que já estão publicados. Novos filtros aparecem quando houver dados canônicos confiáveis para sustentá-los.</p>
      <p id="discovery-active-filters" className={styles.filterStatus} role="status">{filterStatus}</p>

      <form className={styles.filters} method="get" action="/eventos" role="search" aria-label="Buscar eventos publicados" aria-describedby="discovery-search-help discovery-active-filters">
        {requestedFrom ? <input type="hidden" name="from" value={requestedFrom} /> : null}
        <label className={styles.field} htmlFor="discovery-q">
          <span>Nome ou local</span>
          <input id="discovery-q" name="q" type="search" defaultValue={q} maxLength={120} placeholder="Ex.: congresso, São Paulo" />
        </label>
        <label className={styles.field} htmlFor="discovery-format">
          <span>Formato</span>
          <select id="discovery-format" name="format" defaultValue={format}>
            <option value="">Todos os formatos</option>
            <option value="IN_PERSON">Presencial</option>
            <option value="ONLINE">Online</option>
            <option value="HYBRID">Híbrido</option>
          </select>
        </label>
        <label className={styles.field} htmlFor="discovery-profile">
          <span>Perfil</span>
          <select id="discovery-profile" name="profile" defaultValue={profile}>
            <option value="">Todos os perfis</option>
            {PUBLIC_EVENT_PROFILES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className={styles.field} htmlFor="discovery-period">
          <span>Período</span>
          <select id="discovery-period" name="period" defaultValue={period}>
            <option value="CURRENT">Próximos e em andamento</option>
            <option value="PAST">Eventos realizados</option>
            <option value="ALL">Todos os publicados</option>
          </select>
        </label>
        <div className={styles.actions}>
          <button type="submit">Buscar eventos</button>
          {hasActiveFilters && <Link className={styles.clearLink} href="/eventos">Limpar filtros</Link>}
        </div>
      </form>
    </section>

    <section className={styles.results} aria-labelledby="results-title" aria-describedby="discovery-active-filters results-period">
      <div className={styles.resultsHeading}>
        <div>
          <p className={styles.eyebrow}>CATÁLOGO PÚBLICO</p>
          <h2 id="results-title" tabIndex={-1}>{resultsHeading(result.total)}</h2>
          <p id="results-period" className={styles.periodSummary}>{requestedFrom && period === 'PAST'
            ? `Eventos já realizados a partir de ${formatEventDate(requestedFrom + 'T00:00:00.000Z', 'UTC', { dateStyle: 'medium' })}`
            : requestedFrom
              ? `Em andamento ou após ${formatEventDate(requestedFrom + 'T00:00:00.000Z', 'UTC', { dateStyle: 'medium' })}`
              : period === 'PAST'
                ? 'Eventos já realizados, do mais recente para o mais antigo'
                : period === 'ALL'
                  ? 'Todos os eventos publicados'
                  : 'Próximos eventos e eventos em andamento'}</p>
        </div>
      </div>

      {result.items.length === 0 ? <div className={styles.empty} role="status">
        <h3>Nenhum evento publicado corresponde à busca.</h3>
        <p>{hasActiveFilters
          ? 'Os filtros atuais de nome, formato, perfil ou período não encontraram eventos publicados. Ajuste a busca ou limpe os filtros para ver o catálogo.'
          : 'Ainda não há eventos publicados neste catálogo.'}</p>
        {hasActiveFilters && <Link className={styles.clearLink} href="/eventos" aria-label="Limpar filtros e ver o catálogo publicado">Limpar filtros</Link>}
      </div> : <div className={styles.grid}>
        {result.items.map((event) => {
          const startsAt = formatEventDate(event.startDate, event.timeZone, { dateStyle: 'medium' });
          return <article className={styles.card} key={event.slug}>
            <div className={styles.cardMeta}>
              {isInProgress(event, now) && <span className={styles.live}>Andamento: em curso</span>}
              <span>{publicEventTypeLabel(event.eventType, event.profileCode)}</span>
              <span>Formato: {formatLabel(event.format)}</span>
              {startsAt && <span>Data: {startsAt}</span>}
            </div>
            <h3>{event.name}</h3>
            {event.shortDescription && <p>{event.shortDescription}</p>}
            {formatEstimatedAudience(event.estimatedAudience) && <p className={styles.venue}>
              Público estimado: {formatEstimatedAudience(event.estimatedAudience)} pessoas
            </p>}
            {event.venue && <p className={styles.venue}>{event.venue}</p>}
            <Link className={styles.cardAction} href={`/evento/${encodeURIComponent(event.slug)}`} aria-label={`Ver informações de ${event.name}`}>
              Ver informações
            </Link>
          </article>;
        })}
      </div>}

      {(previousHref || nextHref) && <nav className={styles.pagination} aria-label="Paginação dos eventos">
        {previousHref ? <Link href={previousHref}>← Página anterior</Link> : <span />}
        <p className={styles.pageStatus} aria-current="page">Página {result.page} de {result.totalPages}</p>
        {nextHref ? <Link href={nextHref}>Próxima página →</Link> : <span />}
      </nav>}
      </section>
    </main>
  </>;
}
