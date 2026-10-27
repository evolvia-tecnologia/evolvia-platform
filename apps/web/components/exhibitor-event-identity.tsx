'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import styles from './exhibitor-event-identity.module.css';

export type EventLogo = { url: string; width: number; height: number };
export type OrganizerSupportChannels = { email: string | null; whatsapp: { number: string; label: string } | null };
export type EventIdentity = { event: { name: string; slug: string }; logo: EventLogo | null; support: OrganizerSupportChannels };

const EMAIL_PATTERN = /^[A-Za-z0-9._+-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/u;

export function mailtoHref(email: unknown): string | null {
  return typeof email === 'string' && email.length <= 160 && EMAIL_PATTERN.test(email) ? `mailto:${email}` : null;
}

export function whatsappHref(number: unknown): string | null {
  return typeof number === 'string' && /^[1-9][0-9]{7,14}$/u.test(number) ? `https://wa.me/${number}` : null;
}

// A logo is only accepted when it points to the identity route of the same
// event slug, so a late or foreign payload cannot show another event's brand.
export function parseEventLogo(value: unknown, slug: string): EventLogo | null {
  if (!value || typeof value !== 'object') return null;
  const logo = value as Record<string, unknown>;
  const prefix = `/api/public/events/${encodeURIComponent(slug)}/exhibitor-identity/logo?v=`;
  if (typeof logo.url !== 'string' || !logo.url.startsWith(prefix) || !/^[A-Za-z0-9_-]{1,64}$/u.test(logo.url.slice(prefix.length))) return null;
  if (![logo.width, logo.height].every((size) => Number.isSafeInteger(size) && Number(size) > 0 && Number(size) <= 10000)) return null;
  return { url: logo.url, width: Number(logo.width), height: Number(logo.height) };
}

export function parseEventIdentity(value: unknown, slug: string): EventIdentity | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;
  const event = payload.event as Record<string, unknown> | null | undefined;
  if (!event || typeof event !== 'object' || event.slug !== slug || typeof event.name !== 'string' || !event.name.trim()) return null;
  const support = (payload.support && typeof payload.support === 'object' ? payload.support : {}) as Record<string, unknown>;
  const whatsapp = support.whatsapp as Record<string, unknown> | null | undefined;
  return {
    event: { name: event.name, slug },
    logo: parseEventLogo(payload.logo, slug),
    support: {
      email: mailtoHref(support.email) ? support.email as string : null,
      whatsapp: whatsapp && typeof whatsapp === 'object' && whatsappHref(whatsapp.number) && typeof whatsapp.label === 'string' && whatsapp.label.trim()
        ? { number: whatsapp.number as string, label: whatsapp.label.trim().slice(0, 40) }
        : null,
    },
  };
}

export function useEventIdentity(slug: string): EventIdentity | null {
  const [loaded, setLoaded] = useState<EventIdentity | null>(null);
  useEffect(() => {
    let active = true;
    api<unknown>(`/public/events/${encodeURIComponent(slug)}/exhibitor-identity`)
      .then((data) => { if (active) setLoaded(parseEventIdentity(data, slug)); })
      .catch(() => { if (active) setLoaded(null); });
    return () => { active = false; };
  }, [slug]);
  return loaded?.event.slug === slug ? loaded : null;
}

export function EventBrand({ name, logo, className }: { name: string; logo: EventLogo | null; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const classes = [styles.brand, className].filter(Boolean).join(' ');
  if (!logo || failedUrl === logo.url) return <span className={classes}><span className={styles.brandName}>{name}</span></span>;
  return <span className={classes}>
    <img className={styles.logo} src={logo.url} alt={name} width={logo.width} height={logo.height} decoding="async" onError={() => setFailedUrl(logo.url)} />
  </span>;
}

export function OrganizerSupport({ support, eventName }: { support: OrganizerSupportChannels | null; eventName: string }) {
  const email = mailtoHref(support?.email);
  const whatsapp = whatsappHref(support?.whatsapp?.number);
  if (!email && !whatsapp) return null;
  return <section className={styles.support} aria-label={`Suporte do organizador de ${eventName}`}>
    <h2 className={styles.supportTitle}>Suporte do organizador</h2>
    <p className={styles.supportHint}>Canais divulgados pela organização de {eventName}.</p>
    <ul className={styles.channels}>
      {whatsapp && <li><a className={styles.channel} href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp do organizador: ${support!.whatsapp!.label} (abre em nova aba)`}>
        <span className={styles.channelKind}>WhatsApp</span><span>{support!.whatsapp!.label}</span>
      </a></li>}
      {email && <li><a className={styles.channel} href={email} aria-label={`E-mail do organizador: ${support!.email}`}>
        <span className={styles.channelKind}>E-mail</span><span>{support!.email}</span>
      </a></li>}
    </ul>
  </section>;
}
