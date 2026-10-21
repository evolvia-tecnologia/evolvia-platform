import type { Metadata } from 'next';
import ParticipantArea from '../../../../components/participant-area';
import PublicSiteHeader from '../../../../components/public-site-header';

const API_BASE_URL = process.env.EVOLVIA_API_INTERNAL_URL ?? 'http://api:4000';

export const metadata: Metadata = {
  title: 'Área do participante',
  robots: { index: false, follow: false },
};

const EMPTY_PUBLIC_EVENT_PROFILE = { profileCode: null, eventType: null } as const;

async function publicEventProfile(slug: string): Promise<{ profileCode: string | null; eventType: string | null }> {
  try {
    const apiBase = API_BASE_URL.replace(/\/+$/u, '');
    const response = await fetch(`${apiBase}/public/events/${encodeURIComponent(slug)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return EMPTY_PUBLIC_EVENT_PROFILE;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object') return EMPTY_PUBLIC_EVENT_PROFILE;
    const event = (payload as { event?: { profileCode?: string | null; eventType?: string | null } }).event;
    return {
      profileCode: event?.profileCode ?? null,
      eventType: event?.eventType ?? null,
    };
  } catch {
    return EMPTY_PUBLIC_EVENT_PROFILE;
  }
}

export default async function ParticipantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await publicEventProfile(slug);
  return <>
    <a className="skip-link" href="#participant-main">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="evento" />
    <div id="participant-main" tabIndex={-1}>
      <ParticipantArea slug={slug} initialProfileCode={profile.profileCode} initialEventType={profile.eventType} />
    </div>
  </>;
}
