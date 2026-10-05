import type { CSSProperties } from 'react';
import Link from 'next/link';
import PublicEvaSupport from './public-eva-support';
import PublicEventLocation from './public-event-location';
import PublicRichText from './public-rich-text';
import { formatEventDate } from '../lib/event-time-zone';
import { publicPhoneHref } from '../lib/public-event-contact';
import {
  formatEstimatedAudience,
  publicEventTypeLabel,
  type PublicEventProfileCode,
} from '../lib/public-event-profile';
import {
  publicParticipantCtaLabel,
  publicRegistrationCtaLabel,
  type PublicRegistrationCategory,
  type PublicRegistrationMode,
} from '../lib/public-registration-cta';
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
  organizer?: {
    legalName: string;
    taxId: string;
  } | null;
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

function formatCnpj(value: string): string {
  const digits = value.replace(/\D/gu, '');
  if (digits.length !== 14) return value;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
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
  registrationMode = null,
  categories = [],
}: {
  event: PublicEventPresentationData;
  eyebrow?: string;
  mediaSources?: Partial<Record<'LOGO' | 'COVER' | 'SOCIAL_SHARE', string>>;
  registrationMode?: PublicRegistrationMode | null;
  categories?: PublicRegistrationCategory[];
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
  const organizerTaxId = event.organizer ? formatCnpj(event.organizer.taxId) : null;
  const shellClasses = [
    styles.eventShell,
    theme.contentWidth === 'WIDE' ? styles.wideContent : '',
    theme.fontScale === 'LARGE' ? styles.largeText : '',
    theme.preset === 'HIGH_CONTRAST' ? styles.highContrast : '',
  ].filter(Boolean).join(' ');
  const phone = event.publication.publicContactPhone?.trim() || null;
  const phoneHref = publicPhoneHref(phone);
  const registrationHref = `/evento/${encodeURIComponent(event.event.slug)}/inscricao`;
  const participantHref = `/evento/${encodeURIComponent(event.event.slug)}/participante`;
  const registrationLabel = registrationMode
    ? publicRegistrationCtaLabel(registrationMode, event.event.profileCode, event.event.eventType)
    : null;
  const participantLabel = publicParticipantCtaLabel(event.event.profileCode, event.event.eventType);
  const hasAbout = Boolean(event.publication.fullDescription?.trim());
  const hasLocation = Boolean(event.event.venue?.trim()) && event.event.format !== 'ONLINE';
  const hasAccessibility = Boolean(event.publication.accessibilitySummary?.trim());
  const hasContact = Boolean(event.publication.publicContactEmail || phone);
  const visibleSections = event.sections.flatMap((section, index) => {
    const text = sectionText(section.content);
    return text ? [{ section, index, text }] : [];
  });

  return <article className={shellClasses} style={themeStyle}>
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
        <div><dt>Tipo</dt><dd>{publicEventTypeLabel(event.event.eventType, event.event.profileCode)}</dd></div>
        <div><dt>Formato</dt><dd>{formatLabel(event.event.format)}</dd></div>
        {startsAt && <div><dt>Início</dt><dd>{startsAt}</dd></div>}
        {endsAt && <div><dt>Encerramento</dt><dd>{endsAt}</dd></div>}
        {estimatedAudience && <div><dt>Público estimado</dt><dd>{estimatedAudience} pessoas. Não é o limite de vagas.</dd></div>}
        {event.event.venue && <div><dt>Local</dt><dd>{event.event.venue}</dd></div>}
      </dl>
      <div className={styles.heroActions}>
        {registrationMode && registrationLabel && <Link className={styles.registrationCta} href={registrationHref}>{registrationLabel}</Link>}
        <Link className={`${styles.registrationCta} ${styles.secondaryCta}`} href={participantHref}>{participantLabel}</Link>
      </div>
    </header>

    <nav className={styles.pageNav} aria-label="Seções da página">
      {hasAbout && <a href="#sobre">Sobre</a>}
      <a href="#inscricoes">Inscrições</a>
      {visibleSections.map(({ section, index }) => section.title
        ? <a key={`${section.sortOrder}-${index}`} href={`#secao-${index}`}>{section.title}</a>
        : null)}
      {hasLocation && <a href="#local">Local</a>}
      {hasAccessibility && <a href="#acessibilidade">Acessibilidade</a>}
      {hasContact && <a href="#contato">Contato</a>}
      {event.organizer && <a href="#organizacao">Organização</a>}
    </nav>

    {hasAbout && <section className={styles.section} id="sobre" aria-labelledby="about-title">
      <h2 id="about-title">Sobre o evento</h2>
      <PublicRichText className={styles.prose} text={event.publication.fullDescription ?? ''} />
    </section>}

    <section className={styles.section} id="inscricoes" aria-labelledby="registration-title">
      <h2 id="registration-title">Inscrições</h2>
      {registrationMode && registrationLabel ? <>
        <p className={styles.registrationLead}>A participação começa com uma inscrição nova. Quem já concluiu a inscrição entra na área do participante.</p>
        {categories.length > 0 && <ul className={styles.offerList}>
          {categories.map((category) => <li key={category.id}>
            <strong>{category.name}</strong>
            {category.description && <p>{category.description}</p>}
            <span className={styles.offerPrice}>{category.priceLabel}</span>
          </li>)}
        </ul>}
        <div className={styles.heroActions}>
          <Link className={styles.registrationCta} href={registrationHref}>{registrationLabel}</Link>
          <Link className={`${styles.registrationCta} ${styles.secondaryCta}`} href={participantHref}>{participantLabel}</Link>
        </div>
      </> : <>
        <p className={styles.registrationLead}>Não há inscrição nova aberta agora. Quem já se inscreveu continua pela área do participante.</p>
        <div className={styles.heroActions}>
          <Link className={`${styles.registrationCta} ${styles.secondaryCta}`} href={participantHref}>{participantLabel}</Link>
        </div>
      </>}
    </section>

    {visibleSections.map(({ section, index, text }) => {
      const sectionId = `secao-${index}`;
      const titleId = `${sectionId}-titulo`;
      return <section className={section.kind === 'HIGHLIGHT' ? styles.highlight : styles.section} id={section.title ? sectionId : undefined} key={`${section.sortOrder}-${index}`} aria-labelledby={section.title ? titleId : undefined}>
        {section.title && <h2 id={titleId}>{section.title}</h2>}
        <PublicRichText className={styles.prose} text={text} />
      </section>;
    })}

    <PublicEventLocation venue={event.event.venue} format={event.event.format} />

    {hasAccessibility && <section className={styles.section} id="acessibilidade" aria-labelledby="accessibility-title">
      <h2 id="accessibility-title">Acessibilidade</h2>
      <PublicRichText className={styles.prose} text={event.publication.accessibilitySummary ?? ''} />
    </section>}

    {hasContact && <section className={styles.contact} id="contato" aria-labelledby="contact-title">
      <h2 id="contact-title">Contato do evento</h2>
      <div>
        {event.publication.publicContactEmail && <a href={`mailto:${event.publication.publicContactEmail}`}>{event.publication.publicContactEmail}</a>}
        {phone && (phoneHref
          ? <a href={phoneHref}>{phone}</a>
          : <span>{phone}</span>)}
      </div>
    </section>}

    {event.organizer && <footer className={styles.organizer} id="organizacao">
      <p>Organização responsável: {event.organizer.legalName}</p>
      <p>CNPJ {organizerTaxId}</p>
    </footer>}

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
