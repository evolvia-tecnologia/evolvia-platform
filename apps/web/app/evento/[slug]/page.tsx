import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicEventPresentation, { PublicEventPresentationData } from '../../../components/public-event-presentation';
import PublicSiteHeader from '../../../components/public-site-header';
import styles from './page.module.css';

const API_BASE_URL = process.env.EVOLVIA_API_INTERNAL_URL ?? 'http://api:4000';
const PUBLIC_BASE_URL = (process.env.EVOLVIA_PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const PUBLIC_INDEXING_ENABLED = process.env.EVOLVIA_PUBLIC_INDEXING === '1';

function eventUrl(slug: string): string {
  return `${PUBLIC_BASE_URL}/evento/${encodeURIComponent(slug)}`;
}

function publicAssetUrl(path: string): string {
  return new URL(path, PUBLIC_BASE_URL).toString();
}

async function getPublicEvent(slug: string): Promise<PublicEventPresentationData | null> {
  const response = await fetch(`${API_BASE_URL}/public/events/${encodeURIComponent(slug)}`, {
    next: { revalidate: 60 },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Não foi possível carregar o evento publicado.');
  return response.json() as Promise<PublicEventPresentationData>;
}

async function registrationAvailable(slug: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/public/events/${encodeURIComponent(slug)}/registration`, {
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  }
}

function eventJsonLd(event: PublicEventPresentationData): Record<string, unknown> | null {
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
    ...(event.media.socialShare || event.media.cover
      ? { image: publicAssetUrl((event.media.socialShare ?? event.media.cover)!.url) }
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
    robots: PUBLIC_INDEXING_ENABLED ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      siteName: 'Evolvia',
      title,
      description,
      url: canonical,
      ...(event.media.socialShare ? {
        images: [{
          url: publicAssetUrl(event.media.socialShare.url),
          width: event.media.socialShare.width,
          height: event.media.socialShare.height,
          alt: event.media.socialShare.altText ?? event.event.name,
        }],
      } : {}),
    },
  };
}

export default async function PublicEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [event, canRegister] = await Promise.all([getPublicEvent(slug), registrationAvailable(slug)]);
  if (!event) notFound();

  const jsonLd = eventJsonLd(event);

  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <main id="main-content" className={styles.page} tabIndex={-1}>
      {jsonLd && <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />}

    <PublicSiteHeader current="evento" />

      <PublicEventPresentation event={event} registrationAvailable={canRegister} />
    </main>
  </>;
}
