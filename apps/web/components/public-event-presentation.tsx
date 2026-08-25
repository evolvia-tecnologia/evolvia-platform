import PublicEvaSupport from './public-eva-support';
import styles from '../app/evento/[slug]/page.module.css';

export type PublicEventPresentationData = {
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

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

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
}: {
  event: PublicEventPresentationData;
  eyebrow?: string;
}) {
  const startsAt = formatDate(event.event.startDate);
  const endsAt = formatDate(event.event.endDate);

  return <article className={styles.eventShell}>
    <header className={styles.hero}>
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
      venue={event.event.venue}
      accessibilitySummary={event.publication.accessibilitySummary}
      publicContactEmail={event.publication.publicContactEmail}
      publicContactPhone={event.publication.publicContactPhone}
    />
  </article>;
}
