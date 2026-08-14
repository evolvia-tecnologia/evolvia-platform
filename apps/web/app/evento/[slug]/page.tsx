import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import styles from './page.module.css';

type PublicEvent = {
  event: {
    name: string;
    slug: string;
    format: 'IN_PERSON' | 'ONLINE' | 'HYBRID';
    startDate: string | null;
    endDate: string | null;
    venue: string | null;
  };
  publication: {
    shortDescription: string | null;
    fullDescription: string | null;
    publicContactEmail: string | null;
    publicContactPhone: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    accessibilitySummary: string | null;
    themeConfig: unknown;
  };
  sections: Array<{
    kind: string;
    title: string | null;
    sortOrder: number;
    content: unknown;
  }>;
};

const API_BASE_URL = process.env.EVOLVIA_API_INTERNAL_URL ?? 'http://api:4000';
const PUBLIC_BASE_URL = (process.env.EVOLVIA_PUBLIC_BASE_URL ?? 'https://evolviatecnologia.com').replace(/\/$/, '');

function eventUrl(slug: string): string {
  return `${PUBLIC_BASE_URL}/evento/${encodeURIComponent(slug)}`;
}

async function getPublicEvent(slug: string): Promise<PublicEvent | null> {
  const response = await fetch(`${API_BASE_URL}/public/events/${encodeURIComponent(slug)}`, {
    next: { revalidate: 60 },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Não foi possível carregar o evento publicado.');
  return response.json() as Promise<PublicEvent>;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

function formatLabel(format: PublicEvent['event']['format']): string {
  if (format === 'ONLINE') return 'Online';
  if (format === 'HYBRID') return 'Híbrido';
  return 'Presencial';
}

function sectionText(content: unknown): string | null {
  if (!content || typeof content !== 'object') return null;
  const record = content as Record<string, unknown>;
  for (const key of ['text', 'label', 'description']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function eventJsonLd(event: PublicEvent): Record<string, unknown> | null {
  const startDate = event.event.startDate;
  const venue = event.event.venue?.trim();
  if (!startDate || !venue || event.event.format === 'ONLINE') return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.event.name,
    startDate,
    ...(event.event.endDate ? { endDate: event.event.endDate } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: event.event.format === 'HYBRID'
      ? 'https://schema.org/MixedEventAttendanceMode'
      : 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: venue,
    },
    url: eventUrl(event.event.slug),
    ...(event.publication.seoDescription || event.publication.shortDescription
      ? { description: event.publication.seoDescription ?? event.publication.shortDescription }
      : {}),
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const event = await getPublicEvent(slug);
  if (!event) {
    return {
      title: 'Evento não encontrado',
      robots: { index: false, follow: false },
    };
  }

  const title = event.publication.seoTitle?.trim() || event.event.name;
  const description = event.publication.seoDescription?.trim()
    || event.publication.shortDescription?.trim()
    || `Informações oficiais de ${event.event.name}.`;
  const canonical = eventUrl(event.event.slug);

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      siteName: 'Evolvia',
      title,
      description,
      url: canonical,
    },
  };
}

export default async function PublicEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getPublicEvent(slug);
  if (!event) notFound();

  const startsAt = formatDate(event.event.startDate);
  const endsAt = formatDate(event.event.endDate);
  const jsonLd = eventJsonLd(event);

  return <main className={styles.page}>
    {jsonLd && <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
    />}

    <header className={styles.siteHeader}>
      <Link href="/" className={styles.brand} aria-label="Evolvia — início">EVOLVIA</Link>
      <nav aria-label="Acesso da plataforma" className={styles.platformNav}>
        <Link href="/login">Área do organizador</Link>
      </nav>
    </header>

    <article className={styles.eventShell}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>EVENTO PUBLICADO NA EVOLVIA</p>
        <h1>{event.event.name}</h1>
        {event.publication.shortDescription && <p className={styles.lead}>{event.publication.shortDescription}</p>}
        <dl className={styles.facts}>
          <div><dt>Formato</dt><dd>{formatLabel(event.event.format)}</dd></div>
          {startsAt && <div><dt>Início</dt><dd>{startsAt}</dd></div>}
          {endsAt && <div><dt>Encerramento</dt><dd>{endsAt}</dd></div>}
          {event.event.venue && <div><dt>Local</dt><dd>{event.event.venue}</dd></div>}
        </dl>
      </header>

      {event.publication.fullDescription && <section className={styles.section} aria-labelledby="about-title">
        <h2 id="about-title">Sobre o evento</h2>
        <p className={styles.prose}>{event.publication.fullDescription}</p>
      </section>}

      {event.sections.map((section, index) => {
        const text = sectionText(section.content);
        if (!text) return null;
        const titleId = `section-${index}`;
        return <section className={section.kind === 'HIGHLIGHT' ? styles.highlight : styles.section} key={`${section.sortOrder}-${index}`} aria-labelledby={section.title ? titleId : undefined}>
          {section.title && <h2 id={titleId}>{section.title}</h2>}
          <p className={styles.prose}>{text}</p>
        </section>;
      })}

      {event.publication.accessibilitySummary && <section className={styles.section} aria-labelledby="accessibility-title">
        <h2 id="accessibility-title">Acessibilidade</h2>
        <p className={styles.prose}>{event.publication.accessibilitySummary}</p>
      </section>}

      {(event.publication.publicContactEmail || event.publication.publicContactPhone) && <section className={styles.contact} aria-labelledby="contact-title">
        <h2 id="contact-title">Contato do evento</h2>
        <div>
          {event.publication.publicContactEmail && <a href={`mailto:${event.publication.publicContactEmail}`}>{event.publication.publicContactEmail}</a>}
          {event.publication.publicContactPhone && <span>{event.publication.publicContactPhone}</span>}
        </div>
      </section>}
    </article>
  </main>;
}
