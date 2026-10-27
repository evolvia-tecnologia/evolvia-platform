import { Fragment } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicEventPresentation, { PublicEventPresentationData } from '../../../components/public-event-presentation';
import RecordPublicVisit from '../../../components/record-public-visit';
import PublicEventProgram from '../../../components/public-event-program';
import { parsePublicProgram, publicProgramWideLayout, type PublicProgram } from '../../../lib/public-event-program';
import PublicSiteHeader from '../../../components/public-site-header';
import { publicApiSignal, publicApiUrl } from '../../../lib/public-api';
import { parsePublicRegistrationOffer, type PublicRegistrationOffer } from '../../../lib/public-registration-cta';
import styles from './page.module.css';

const PUBLIC_BASE_URL = (process.env.EVOLVIA_PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const PUBLIC_INDEXING_ENABLED = process.env.EVOLVIA_PUBLIC_INDEXING === '1';

function eventUrl(slug: string): string {
  return `${PUBLIC_BASE_URL}/${encodeURIComponent(slug)}`;
}

function publicAssetUrl(path: string): string {
  return new URL(path, PUBLIC_BASE_URL).toString();
}

async function getPublicEvent(slug: string): Promise<PublicEventPresentationData | null> {
  const response = await fetch(publicApiUrl(`/public/events/${encodeURIComponent(slug)}`), {
    next: { revalidate: 60 },
    signal: publicApiSignal(),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Não foi possível carregar o evento publicado.');
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object') return null;
  return payload as PublicEventPresentationData;
}

async function publicProgram(slug: string): Promise<PublicProgram | null> {
  try {
    const response = await fetch(publicApiUrl(`/public/events/${encodeURIComponent(slug)}/program`), {
      next: { revalidate: 60 },
      signal: publicApiSignal(),
    });
    if (!response.ok) return null;
    return parsePublicProgram(await response.json());
  } catch {
    return null;
  }
}

async function registrationOffer(slug: string): Promise<PublicRegistrationOffer | null> {
  try {
    const response = await fetch(publicApiUrl(`/public/events/${encodeURIComponent(slug)}/registration`), {
      cache: 'no-store',
      signal: publicApiSignal(),
    });
    if (!response.ok) return null;
    return parsePublicRegistrationOffer(await response.json());
  } catch {
    return null;
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
  const [event, offer, program] = await Promise.all([getPublicEvent(slug), registrationOffer(slug), publicProgram(slug)]);
  if (!event) notFound();
  const registrationMode = offer?.mode ?? null;

  const jsonLd = eventJsonLd(event);

  return <>
    <RecordPublicVisit slug={event.event.slug} />
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <main id="main-content" className={styles.page} tabIndex={-1}>
    {/* A chave preserva o fiber Fragment: um filho RSC suspenso não repete a hidratação do main. */}
    <Fragment key="public-event-content">
      {jsonLd && <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />}

    <PublicSiteHeader current="evento" />

      <PublicEventPresentation event={event} registrationMode={registrationMode} categories={offer?.categories ?? []} programContent={program?.activities.length ? <PublicEventProgram program={program} wide={publicProgramWideLayout(event.publication.themeConfig)} /> : null} />
    </Fragment>
    </main>
  </>;
}

