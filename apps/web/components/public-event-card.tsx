'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatCalendarDateKey, formatEventDate } from '../lib/event-time-zone';
import { formatEstimatedAudience, publicEventTypeLabel, type PublicEventProfileCode } from '../lib/public-event-profile';
import styles from './public-event-card.module.css';

export type PublicEventCardItem = {
  name: string; slug: string; eventType: string; profileCode: PublicEventProfileCode | null;
  estimatedAudience: number | null; format: 'IN_PERSON' | 'ONLINE' | 'HYBRID';
  startDate: string | null; endDate: string | null; timeZone: string | null;
  venue: string | null; shortDescription: string | null;
  cardMedia?: { url: string; usage: 'COVER' | 'LOGO' } | null;
};
export default function PublicEventCard({ event, inProgress = false }: { event: PublicEventCardItem; inProgress?: boolean }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const type = publicEventTypeLabel(event.eventType, event.profileCode);
  const format = event.format === 'ONLINE' ? 'Online' : event.format === 'HYBRID' ? 'Híbrido' : 'Presencial';
  const date = formatEventDate(event.startDate, event.timeZone, { dateStyle: 'medium' });
  const end = formatEventDate(event.endDate, event.timeZone, { dateStyle: 'medium' });
  const range = date && end && formatCalendarDateKey(event.startDate!, event.timeZone) !== formatCalendarDateKey(event.endDate!, event.timeZone) ? `${date} a ${end}` : date;
  const media = event.cardMedia;
  const expectedUrl = media && (media.usage === 'COVER' || media.usage === 'LOGO') ? `/api/public/events/${encodeURIComponent(event.slug)}/media/${media.usage}` : null;
  const image = media?.url === expectedUrl && failedImage !== expectedUrl ? expectedUrl : null;
  const audience = formatEstimatedAudience(event.estimatedAudience);
  const venue = event.format === 'ONLINE' ? 'Evento online' : event.venue || 'Local a confirmar';
  return <article className={styles.card}>
    <Link className={styles.link} href={`/${encodeURIComponent(event.slug)}`} aria-label={`Ver evento: ${event.name}`}>
      <div className={styles.media}>
        {image ? <img className={styles.image} src={image} alt="" width={640} height={360} loading="lazy" decoding="async" onError={() => setFailedImage(image)} /> : <div className={styles.placeholder} aria-hidden="true"><span className={styles.mark}><i /><i /><i /></span><span className={styles.placeholderType}>{type}</span><span className={styles.placeholderName}>{event.name}</span></div>}
        <span className={styles.format}>{format}</span>
        {inProgress && <span className={styles.live}>Em andamento</span>}
      </div>
      <div className={styles.body}>
        <p className={styles.type}>{type}</p>
        <h3>{event.name}</h3>
        <div className={styles.details}>
          <p><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18" /></svg><span>{range || 'Data a confirmar'}</span></p>
          <p><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg><span>{venue}</span></p>
        </div>
        {event.shortDescription && <p className={styles.description}>{event.shortDescription}</p>}
        <div className={styles.footer}>{audience && <span className={styles.audience}>Público estimado: {audience}</span>}<span className={styles.action}>Ver evento <span aria-hidden="true">→</span></span></div>
      </div>
    </Link>
  </article>;
}
