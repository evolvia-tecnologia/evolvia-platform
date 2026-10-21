import type { Metadata } from 'next';
import ParticipantArea from '../../../../components/participant-area';
import PublicSiteHeader from '../../../../components/public-site-header';

const API_BASE_URL = process.env.EVOLVIA_API_INTERNAL_URL ?? 'http://api:4000';

export const metadata: Metadata = {
  title: 'Área do participante',
  robots: { index: false, follow: false },
};

async function publicEventProfile(slug: string): Promise<{ profileCode: string | null; eventType: string | null }> {
  try {
    const apiBase = API_BASE_URL.replace(/\/+$/u, '');
    const response = await fetch(`${apiBase}/public/events/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    if (!response.ok) return { profileCode: null, eventType: null };
    const payload = await response.json() as { event?: { profileCode?: string | null; eventType?: string | null } };
    return {
      profileCode: payload.event?.profileCode ?? null,
      eventType: payload.event?.eventType ?? null,
    };
  } catch {
    return { profileCode: null, eventType: null };
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
