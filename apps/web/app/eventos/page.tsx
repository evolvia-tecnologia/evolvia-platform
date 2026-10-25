import type { Metadata } from 'next';
import Link from 'next/link';
import PublicEventCard, { type PublicEventCardItem } from '../../components/public-event-card';
import PublicSiteHeader from '../../components/public-site-header';
import {
  DISCOVERY_CALENDAR_TIME_ZONE,
  formatCalendarDateKey,
  formatEventDate,
  formatPublicEventSchedule,
} from '../../lib/event-time-zone';
import {
  formatEstimatedAudience,
  isPublicEventProfile,
  PUBLIC_EVENT_PROFILES,
  type PublicEventProfileCode,
} from '../../lib/public-event-profile';
import {
  isPublicRegion,
  isPublicSubjectArea,
  PUBLIC_REGIONS,
  PUBLIC_SUBJECT_AREAS,
} from '../../lib/public-discovery';
import PublicEventCollections from '../../components/public-event-collections';
import PublicRegionSuggest from '../../components/public-region-suggest';
import { publicApiSignal, publicApiUrl } from '../../lib/public-api';
import styles from './page.module.css';

type PublicEventItem = PublicEventCardItem;

type DiscoveryResult = {
  items: PublicEventItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type DiscoveryPeriod = 'CURRENT' | 'PAST' | 'ALL';

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
  return value === 'CURRENT' || value === 'PAST' || value === 'ALL' ? value : 'ALL';
}

function normalizedArea(value: string): string {
  return isPublicSubjectArea(value) ? value : '';
}

function normalizedRegion(value: string): string {
  const region = value.trim().toUpperCase();
  return isPublicRegion(region) ? region : '';
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

function isInProgress(event: PublicEventItem, now: Date): boolean {
  if (!event.startDate || !event.endDate) return false;
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= now && end >= now;
}

function queryString(input: { q: string; format: string; profile: string; area: string; region: string; period: DiscoveryPeriod; from: string; page: number }): string {
  const params = new URLSearchParams();
  if (input.q) params.set('q', input.q);
  if (input.format) params.set('format', input.format);
  if (input.profile) params.set('profile', input.profile);
  if (input.area) params.set('area', input.area);
  if (input.region) params.set('region', input.region);
  if (input.period !== 'ALL') params.set('period', input.period);
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

async function discoverEvents(input: { q: string; format: string; profile: string; area: string; region: string; from: string; until: string; page: number }): Promise<DiscoveryResult> {
  const params = new URLSearchParams({ page: String(input.page), pageSize: '12' });
  if (input.q) params.set('q', input.q);
  if (input.format) params.set('format', input.format);
  if (input.profile) params.set('profile', input.profile);
  if (input.area) params.set('area', input.area);
  if (input.region) params.set('region', input.region);
  if (input.from) params.set('from', input.from);
  if (input.until) params.set('until', input.until);

  const response = await fetch(publicApiUrl(`/public/events?${params.toString()}`), {
    next: { revalidate: 60 },
    signal: publicApiSignal(),
  });
  if (!response.ok) throw new Error('Não foi possível carregar os eventos publicados.');
  return response.json() as Promise<DiscoveryResult>;
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  const q = one(params.q).trim();
  const format = normalizedFormat(one(params.format));
  const profile = normalizedProfile(one(params.profile));
  const area = normalizedArea(one(params.area));
  const region = normalizedRegion(one(params.region));
  const from = normalizedDate(one(params.from));
  const period = normalizedPeriod(one(params.period));
  const page = positivePage(one(params.page));
  const hasFacet = Boolean(q || format || profile || area || region || from || period !== 'ALL' || page > 1);
  const canonical = `${PUBLIC_BASE_URL}/eventos`;
  const canIndex = PUBLIC_INDEXING_ENABLED && !hasFacet;

  return {
    title: 'Eventos publicados',
    description: 'Descubra eventos publicados na Evolvia por nome, área, região, perfil, formato e data.',
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
  const area = normalizedArea(one(params.area));
  const region = normalizedRegion(one(params.region));
  const requestedFrom = normalizedDate(one(params.from));
  const period = normalizedPeriod(one(params.period));
  const page = positivePage(one(params.page));
  const today = formatCalendarDateKey(new Date(), DISCOVERY_CALENDAR_TIME_ZONE) ?? new Date().toISOString().slice(0, 10);
  const { from, until } = resolveDiscoveryWindow(period, requestedFrom, today);
  const result = await discoverEvents({ q, format, profile, area, region, from, until, page });
  const hasActiveFilters = Boolean(q || format || profile || area || region || requestedFrom || period !== 'ALL');
  const now = new Date();

  const previousHref = result.page > 1
    ? `/eventos${queryString({ q, format, profile, area, region, period, from: requestedFrom, page: result.page - 1 })}`
    : null;
  const nextHref = result.page < result.totalPages
    ? `/eventos${queryString({ q, format, profile, area, region, period, from: requestedFrom, page: result.page + 1 })}`
    : null;

  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <main id="main-content" className={styles.page} tabIndex={-1}>
    <PublicSiteHeader current="eventos" />

    <section className={styles.hero} aria-labelledby="events-title">
      <p className={styles.eyebrow}>DESCUBRA EXPERIÊNCIAS REAIS</p>
      <h1 id="events-title">Eventos publicados na Evolvia</h1>
      <p>A lista começa por todos os eventos publicados, inclusive os que ainda não têm data de término. Filtre por área, região, formato e período quando quiser afunilar.</p>
      <div className={styles.collections}>
        <PublicEventCollections current={`/eventos${queryString({ q: '', format, profile, area: '', region: '', period, from: '', page: 1 })}`} />
      </div>

      <form className={styles.filters} method="get" action="/eventos" role="search" key={[q, format, profile, area, region, period, requestedFrom].join('|')}>
        {requestedFrom ? <input type="hidden" name="from" value={requestedFrom} /> : null}
        <label className={styles.field} htmlFor="discovery-q">
          <span>Nome, tipo ou local</span>
          <input id="discovery-q" name="q" type="search" defaultValue={q} maxLength={120} placeholder="Ex.: convenção, saúde, São Paulo" />
        </label>
        <label className={styles.field} htmlFor="discovery-area">
          <span>Área de atuação</span>
          <select id="discovery-area" name="area" defaultValue={area}>
            <option value="">Todas as áreas</option>
            {PUBLIC_SUBJECT_AREAS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className={styles.field} htmlFor="discovery-region">
          <span>Região</span>
          <select id="discovery-region" name="region" defaultValue={region}>
            <option value="">Todas as regiões</option>
            {PUBLIC_REGIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
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
            <option value="ALL">Todos os publicados</option>
            <option value="CURRENT">Próximos e em andamento</option>
            <option value="PAST">Eventos realizados</option>
          </select>
        </label>
        <div className={styles.actions}>
          <button type="submit">Buscar eventos</button>
          <PublicRegionSuggest currentSearch={queryString({ q, format, profile, area, region, period, from: requestedFrom, page }).replace(/^\?/u, '')} />
        </div>
        <div className={styles.regionRow}>
          <p className={styles.regionNote} id="region-note">A sugestão de região calcula o estado neste navegador. A coordenada não é enviada.</p>
          {hasActiveFilters && <Link className={styles.clearInline} href="/eventos">Limpar filtros</Link>}
        </div>
      </form>
    </section>

    <section className={styles.results} aria-labelledby="results-title">
      <div className={styles.resultsHeading}>
        <div>
          <p className={styles.eyebrow}>CATÁLOGO PÚBLICO</p>
          <h2 id="results-title">{result.total === 1 ? '1 evento encontrado' : `${result.total} eventos encontrados`}</h2>
          <p className={styles.periodSummary}>{requestedFrom && period === 'PAST'
            ? `Eventos já realizados a partir de ${formatEventDate(requestedFrom + 'T00:00:00.000Z', 'UTC', { dateStyle: 'medium' })}`
            : requestedFrom
              ? `Em andamento ou após ${formatEventDate(requestedFrom + 'T00:00:00.000Z', 'UTC', { dateStyle: 'medium' })}`
              : period === 'PAST'
                ? 'Eventos já realizados, do mais recente para o mais antigo'
                : period === 'CURRENT'
                  ? 'Próximos eventos, eventos em andamento e publicados sem data de término'
                  : 'Todos os eventos publicados, dos mais recentes aos anteriores'}</p>
        </div>
        {result.totalPages > 1 && <p>Página {result.page} de {result.totalPages}</p>}
      </div>

      {result.items.length === 0 ? <div className={styles.empty} role="status">
        <h3>Nenhum evento publicado corresponde à busca.</h3>
        <p>{area
          ? 'Nenhum evento publicado está marcado com esta área. A organização escolhe a área na criação ou na divulgação; o nome do evento não substitui essa marcação.'
          : hasActiveFilters
          ? 'Os filtros atuais de nome, formato, perfil, área, região ou período não encontraram eventos publicados. Ajuste a busca ou limpe os filtros para ver o catálogo.'
          : 'Ainda não há eventos publicados neste catálogo.'}</p>
        {hasActiveFilters && <Link className={styles.clearLink} href="/eventos">Limpar filtros</Link>}
      </div> : <div className={styles.grid}>
        {result.items.map((event) => <PublicEventCard key={event.slug} event={event} schedule={formatPublicEventSchedule(event.startDate, event.endDate, event.timeZone)} audienceText={formatEstimatedAudience(event.estimatedAudience)} inProgress={isInProgress(event, now)} />)}
      </div>}

      {(previousHref || nextHref) && <nav className={styles.pagination} aria-label="Paginação dos eventos">
        {previousHref ? <Link href={previousHref}>← Página anterior</Link> : <span />}
        {nextHref && <Link href={nextHref}>Próxima página →</Link>}
      </nav>}
      </section>
    </main>
  </>;
}
