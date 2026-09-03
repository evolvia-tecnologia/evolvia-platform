import type { CSSProperties } from 'react';
import PublicEvaSupport from './public-eva-support';
import { formatEventDate } from '../lib/event-time-zone';
import {
  formatEstimatedAudience,
  publicEventTypeLabel,
  type PublicEventProfileCode,
} from '../lib/public-event-profile';
import styles from '../app/evento/[slug]/page.module.css';

export type PublicEventPresentationData = {
  event: {
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

type PublicThemeConfig = {
  preset: 'DEFAULT' | 'HIGH_CONTRAST';
  fontScale: 'DEFAULT' | 'LARGE';
  contentWidth: 'STANDARD' | 'WIDE';
  primaryColor: string;
  accentColor: string;
  onPrimaryColor: '#000000' | '#FFFFFF';
  onAccentColor: '#000000' | '#FFFFFF';
};

const DEFAULT_THEME: PublicThemeConfig = {
  preset: 'DEFAULT',
  fontScale: 'DEFAULT',
  contentWidth: 'STANDARD',
  primaryColor: '#0B64E5',
  accentColor: '#22365E',
  onPrimaryColor: '#FFFFFF',
  onAccentColor: '#FFFFFF',
};
const HEX_COLOR = /^#[0-9A-F]{6}$/;

function publicTheme(value: unknown): PublicThemeConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_THEME;
  const candidate = value as Partial<PublicThemeConfig>;
  const primaryColor = typeof candidate.primaryColor === 'string'
    ? candidate.primaryColor.toUpperCase()
    : '';
  const accentColor = typeof candidate.accentColor === 'string'
    ? candidate.accentColor.toUpperCase()
    : '';
  if (!HEX_COLOR.test(primaryColor) || !HEX_COLOR.test(accentColor)) return DEFAULT_THEME;
  return {
    preset: candidate.preset === 'HIGH_CONTRAST' ? 'HIGH_CONTRAST' : 'DEFAULT',
    fontScale: candidate.fontScale === 'LARGE' ? 'LARGE' : 'DEFAULT',
    contentWidth: candidate.contentWidth === 'WIDE' ? 'WIDE' : 'STANDARD',
    primaryColor,
    accentColor,
    onPrimaryColor: candidate.onPrimaryColor === '#000000' ? '#000000' : '#FFFFFF',
    onAccentColor: candidate.onAccentColor === '#000000' ? '#000000' : '#FFFFFF',
  };
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

export function publicMediaAltText(
  media: Pick<PublicEventMedia, 'decorative' | 'altText'>,
  publishedFallback: string,
): string {
  if (media.decorative) return '';
  const published = media.altText?.trim();
  if (published) return published;
  return publishedFallback.trim();
}

export function publicSectionHeading(kind: string, title: string | null): string {
  const published = title?.trim();
  if (published) return published;
  return kind === 'HIGHLIGHT' ? 'Destaque' : 'Informação adicional';
}

export function publicEmailActionHref(email: string): string | null {
  const value = email.trim();
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value)) return null;
  return `mailto:${value}`;
}

export function publicPhoneActionHref(phone: string): string | null {
  const value = phone.trim();
  if (!/^\+?[\d\s()./-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return value.startsWith('+') ? `tel:+${digits}` : `tel:${digits}`;
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
  const estimatedAudience = formatEstimatedAudience(event.event.estimatedAudience);
  const theme = publicTheme(event.publication.themeConfig);
  const themeStyle = {
    '--event-primary': theme.primaryColor,
    '--event-accent': theme.accentColor,
    '--event-on-primary': theme.onPrimaryColor,
    '--event-on-accent': theme.onAccentColor,
  } as CSSProperties;
  const shellClasses = [
    styles.eventShell,
    theme.contentWidth === 'WIDE' ? styles.wideContent : '',
    theme.fontScale === 'LARGE' ? styles.largeText : '',
    theme.preset === 'HIGH_CONTRAST' ? styles.highContrast : '',
  ].filter(Boolean).join(' ');

  const coverAlt = event.media.cover
    ? publicMediaAltText(event.media.cover, event.event.name)
    : null;
  const logoAlt = event.media.logo
    ? publicMediaAltText(event.media.logo, event.event.name)
    : null;
  const contactEmail = event.publication.publicContactEmail?.trim() || '';
  const contactPhone = event.publication.publicContactPhone?.trim() || '';
  const emailHref = contactEmail ? publicEmailActionHref(contactEmail) : null;
  const phoneHref = contactPhone ? publicPhoneActionHref(contactPhone) : null;

  return <article className={shellClasses} style={themeStyle}>
    {event.media.cover && <img
      className={styles.cover}
      src={mediaSources?.COVER ?? event.media.cover.url}
      alt={coverAlt ?? ''}
      width={event.media.cover.width}
      height={event.media.cover.height}
    />}
    <header className={styles.hero}>
      {event.media.logo && <img
        className={styles.eventLogo}
        src={mediaSources?.LOGO ?? event.media.logo.url}
        alt={logoAlt ?? ''}
        width={event.media.logo.width}
        height={event.media.logo.height}
      />}
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1>{event.event.name}</h1>
      {event.publication.shortDescription && <p className={styles.lead}>{event.publication.shortDescription}</p>}
      <dl className={styles.facts} aria-label="Fatos do evento">
        <div><dt>Tipo</dt><dd>{publicEventTypeLabel(event.event.eventType, event.event.profileCode)}</dd></div>
        <div><dt>Formato</dt><dd>{formatLabel(event.event.format)}</dd></div>
        {startsAt && <div><dt>Início</dt><dd>{startsAt}</dd></div>}
        {endsAt && <div><dt>Encerramento</dt><dd>{endsAt}</dd></div>}
        {estimatedAudience && <div><dt>Público estimado</dt><dd>{estimatedAudience} pessoas</dd></div>}
        {event.event.venue && <div><dt>Local</dt><dd>{event.event.venue}</dd></div>}
      </dl>
    </header>

    {event.publication.fullDescription && <section className={styles.section} aria-labelledby="about-title">
      <h2 id="about-title" tabIndex={-1}>Sobre o evento</h2>
      <p className={styles.prose}>{event.publication.fullDescription}</p>
    </section>}

    {event.sections.map((section, index) => {
      const text = sectionText(section.content);
      if (!text) return null;
      const titleId = `section-${index}`;
      const heading = publicSectionHeading(section.kind, section.title);
      return <section className={section.kind === 'HIGHLIGHT' ? styles.highlight : styles.section} key={`${section.sortOrder}-${index}`} aria-labelledby={titleId}>
        <h2 id={titleId} tabIndex={-1}>{heading}</h2>
        <p className={styles.prose}>{text}</p>
      </section>;
    })}

    {event.publication.accessibilitySummary && <section className={styles.section} aria-labelledby="accessibility-title">
      <h2 id="accessibility-title" tabIndex={-1}>Acessibilidade</h2>
      <p className={styles.prose}>{event.publication.accessibilitySummary}</p>
    </section>}

    {(contactEmail || contactPhone) && <section className={styles.contact} aria-labelledby="contact-title">
      <h2 id="contact-title" tabIndex={-1}>Contato do evento</h2>
      <dl className={styles.contactList}>
        {contactEmail && <div>
          <dt>E-mail</dt>
          <dd>{emailHref
            ? <a href={emailHref} aria-label={`Enviar e-mail para ${contactEmail}`}>{contactEmail}</a>
            : <span>{contactEmail}</span>}
          </dd>
        </div>}
        {contactPhone && <div>
          <dt>Telefone</dt>
          <dd>{phoneHref
            ? <a href={phoneHref} aria-label={`Ligar para ${contactPhone}`}>{contactPhone}</a>
            : <span>{contactPhone}</span>}
          </dd>
        </div>}
      </dl>
    </section>}

    <PublicEvaSupport
      eventName={event.event.name}
      eventType={event.event.eventType}
      profileCode={event.event.profileCode}
      estimatedAudience={event.event.estimatedAudience}
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
