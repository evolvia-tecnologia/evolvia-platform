'use client';

import { useState } from 'react';
import { normalizedPublicVenue, publicVenueMapUrl } from '../lib/public-event-location';
import styles from '../app/evento/[slug]/page.module.css';

export default function PublicEventLocation({
  venue,
  format,
}: {
  venue: string | null;
  format: 'IN_PERSON' | 'ONLINE' | 'HYBRID';
}) {
  const [status, setStatus] = useState('');
  const address = normalizedPublicVenue(venue);
  if (!address || format === 'ONLINE') return null;
  const locationAddress: string = address;
  const mapUrl = publicVenueMapUrl(locationAddress);

  async function copyAddress() {
    if (!navigator.clipboard?.writeText) {
      setStatus('Não foi possível copiar. Selecione o local acima para copiar manualmente.');
      return;
    }
    try {
      await navigator.clipboard.writeText(locationAddress);
      setStatus('Local copiado.');
    } catch {
      setStatus('Não foi possível copiar. Selecione o local acima para copiar manualmente.');
    }
  }

  return <section className={styles.section} aria-labelledby="event-location-title">
    <h2 id="event-location-title">Como chegar</h2>
    <p className={styles.prose}>{address}</p>
    <div className={styles.locationActions}>
      <button type="button" onClick={copyAddress}>Copiar local</button>
      {mapUrl && <a href={mapUrl} target="_blank" rel="noopener noreferrer" aria-label="Buscar local no Google Maps (abre em nova aba)">Ver no Google Maps</a>}
    </div>
    <p className={styles.locationStatus} role="status" aria-live="polite">{status}</p>
  </section>;
}
