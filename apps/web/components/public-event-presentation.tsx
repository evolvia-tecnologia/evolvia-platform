import PublicEvaSupport from './public-eva-support';
import { formatEventDate } from '../lib/event-time-zone';
import styles from '../app/evento/[slug]/page.module.css';

export type PublicEventPresentationData = {
  event: {
    name: string;
    slug: string;
    format: 'IN_PERSON' | 'ONLINE' | 'HYBRID';
    startDate: string | null;
    endDate: string | null;
    timeZone: string | null;
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
  media: {
    logo: PublicEventMedia | null;
    cover: PublicEventMedia | null;
    socialShare: PublicEventMedia | null;
  };
  sections: Array<{
    kind: string;
    title: string | null;
    sortOrder: number;
    content: unknown;
  }>;
};

export type PublicEventMedia = {
  usage: 'LOGO' | 'COVER' | 'SOCIAL_SHARE';
  mimeType: string;
  width: number;
  height: number;
  altText: string | null;
  decorative: boolean;
  url: string;
};

function formatLabel(format: PublicEventPresentationData['event']['format']): string {
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

export default function PublicEventPresentation({
  event,
  eyebrow = 'EVENTO PUBLICADO NA EVOLVIA',
  mediaSources,
}: {
  event: PublicEventPresentationData;
  eyebrow?: string;
  mediaSources?: Partial<Record<'LOGO' | 'COVER' | 'SOCIAL_SHARE', string>>;
}) {
  const startsAt = formatEventDate(event.event.startDate, event.event.timeZone);
  const endsAt = formatEventDate(event.event.endDate, event.event.timeZone);

  return <article className={styles.eventShell}>
    {event.media.cover && <img
      className={styles.cover}
      src={mediaSources?.COVER ?? event.media.cover.url}
      alt={event.media.cover.decorative ? '' : event.media.cover.altText ?? ''}
      width={event.media.cover.width}
      height={event.media.cover.height}
    />}
    <header className={styles.hero}>
      {event.media.logo && <img
        className={styles.eventLogo}
        src={mediaSources?.LOGO ?? event.media.logo.url}
        alt={event.media.logo.altText ?? ''}
        width={event.media.logo.width}
        height={event.media.logo.height}
      />}
      <p className={styles.eyebrow}>{eyebrow}</p>
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

    <PublicEvaSupport
      eventName={event.event.name}
      format={event.event.format}
      startDate={event.event.startDate}
      endDate={event.event.endDate}
      timeZone={event.event.timeZone}
      venue={event.event.venue}
      accessibilitySummary={event.publication.accessibilitySummary}
      publicContactEmail={event.publication.publicContactEmail}
      publicContactPhone={event.publication.publicContactPhone}
    />
  </article>;
}
