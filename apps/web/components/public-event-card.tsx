'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { formatEstimatedAudience, publicEventTypeLabel, type PublicEventProfileCode } from '../lib/public-event-profile';
import styles from './public-event-card.module.css';

export type PublicEventCardItem = {
  name: string; slug: string; eventType: string; profileCode: PublicEventProfileCode | null;
  estimatedAudience: number | null; format: 'IN_PERSON' | 'ONLINE' | 'HYBRID';
  startDate: string | null; endDate: string | null; timeZone: string | null;
  venue: string | null; shortDescription: string | null;
  cardMedia?: { url: string; usage: 'COVER' | 'LOGO' } | null;
};
export default function PublicEventCard({ event, schedule, audienceText, inProgress = false }: { event: PublicEventCardItem; schedule: string | null; audienceText?: string | null; inProgress?: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const type = publicEventTypeLabel(event.eventType, event.profileCode);
  const format = event.format === 'ONLINE' ? 'Online' : event.format === 'HYBRID' ? 'Híbrido' : 'Presencial';
  const range = schedule;
  const media = event.cardMedia;
  const expectedUrl = media && (media.usage === 'COVER' || media.usage === 'LOGO') ? `/api/public/events/${encodeURIComponent(event.slug)}/media/${media.usage}` : null;
  const image = media?.url === expectedUrl && failedImage !== expectedUrl ? expectedUrl : null;
  useEffect(() => {
    setMounted(true);
    const element = imageRef.current;
    if (expectedUrl && element?.complete && element.naturalWidth === 0) {
      setFailedImage(expectedUrl);
    }
  }, [expectedUrl]);
  const audience = audienceText === undefined ? formatEstimatedAudience(event.estimatedAudience) : audienceText;
  const venue = event.format === 'ONLINE' ? 'Evento online' : event.venue || 'Local a confirmar';
  return <article className={styles.card}>
      <div className={styles.media}>
        {image ? <img ref={imageRef} className={styles.image} src={image} alt="" width={640} height={360} loading="lazy" decoding="async" onError={() => { if (mounted) setFailedImage(image); }} /> : <div className={styles.placeholder} aria-hidden="true"><span className={styles.mark}><i /><i /><i /></span><span className={styles.placeholderType}>{type}</span><span className={styles.placeholderName}>{event.name}</span></div>}
        <span className={styles.format}>{format}</span>
        {inProgress && <span className={styles.live}>Em andamento</span>}
      </div>
      <div className={styles.body}>
        <p className={styles.type}>{type}</p>
        <h3><Link className={styles.titleLink} href={`/${encodeURIComponent(event.slug)}`}>{event.name}</Link></h3>
        <div className={styles.details}>
          <p><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18" /></svg><span>{range || 'Data a confirmar'}</span></p>
          <p><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg><span>{venue}</span></p>
        </div>
        {event.shortDescription && <p className={styles.description}>{event.shortDescription}</p>}
        <div className={styles.footer}>{audience && <span className={styles.audience}>Público estimado: {audience} pessoas</span>}<span className={styles.action} aria-hidden="true">Ver evento <span aria-hidden="true">→</span></span></div>
      </div>
  </article>;
}
