import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './page.module.css';

type PublicEventItem = {
  name: string;
  slug: string;
  format: 'IN_PERSON' | 'ONLINE' | 'HYBRID';
  startDate: string | null;
  endDate: string | null;
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

const API_BASE_URL = process.env.EVOLVIA_API_INTERNAL_URL ?? 'http://api:4000';
const PUBLIC_BASE_URL = (process.env.EVOLVIA_PUBLIC_BASE_URL ?? 'https://evolviatecnologia.com').replace(/\/$/, '');

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function normalizedFormat(value: string): PublicEventItem['format'] | '' {
  return value === 'IN_PERSON' || value === 'ONLINE' || value === 'HYBRID' ? value : '';
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

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(date);
}

function queryString(input: { q: string; format: string; page: number }): string {
  const params = new URLSearchParams();
  if (input.q) params.set('q', input.q);
  if (input.format) params.set('format', input.format);
  if (input.page > 1) params.set('page', String(input.page));
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

async function discoverEvents(input: { q: string; format: string; page: number }): Promise<DiscoveryResult> {
  const params = new URLSearchParams({ page: String(input.page), pageSize: '12' });
  if (input.q) params.set('q', input.q);
  if (input.format) params.set('format', input.format);

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
  const page = positivePage(one(params.page));
  const hasFacet = Boolean(q || format || page > 1);
  const canonical = `${PUBLIC_BASE_URL}/eventos`;

  return {
    title: 'Eventos publicados',
    description: 'Descubra eventos publicados na Evolvia por nome, local e formato.',
    alternates: { canonical },
    robots: hasFacet ? { index: false, follow: true } : { index: true, follow: true },
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
  const page = positivePage(one(params.page));
  const result = await discoverEvents({ q, format, page });

  const previousHref = result.page > 1
    ? `/eventos${queryString({ q, format, page: result.page - 1 })}`
    : null;
  const nextHref = result.page < result.totalPages
    ? `/eventos${queryString({ q, format, page: result.page + 1 })}`
    : null;

  return <main className={styles.page}>
    <header className={styles.siteHeader}>
      <Link href="/" className={styles.brand} aria-label="Evolvia — início">EVOLVIA</Link>
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
        <button type="submit">Buscar eventos</button>
        {(q || format) && <Link className={styles.clearLink} href="/eventos">Limpar filtros</Link>}
      </form>
    </section>

    <section className={styles.results} aria-labelledby="results-title">
      <div className={styles.resultsHeading}>
        <div>
          <p className={styles.eyebrow}>CATÁLOGO PÚBLICO</p>
          <h2 id="results-title">{result.total === 1 ? '1 evento encontrado' : `${result.total} eventos encontrados`}</h2>
        </div>
        {result.totalPages > 1 && <p>Página {result.page} de {result.totalPages}</p>}
      </div>

      {result.items.length === 0 ? <div className={styles.empty} role="status">
        <h3>Nenhum evento publicado corresponde à busca.</h3>
        <p>Tente outro termo ou remova o filtro de formato.</p>
      </div> : <div className={styles.grid}>
        {result.items.map((event) => {
          const startsAt = formatDate(event.startDate);
          return <article className={styles.card} key={event.slug}>
            <div className={styles.cardMeta}>
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
  </main>;
}
