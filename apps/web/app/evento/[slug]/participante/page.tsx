import type { Metadata } from 'next';
import ParticipantArea from '../../../../components/participant-area';
import PublicSiteHeader from '../../../../components/public-site-header';
import { fetchPublicEventProfile } from '../../../../lib/public-api';

export const metadata: Metadata = {
  title: 'Área do participante',
  robots: { index: false, follow: false },
};

export default async function ParticipantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await fetchPublicEventProfile(slug);
  return <>
    <a className="skip-link" href="#participant-main">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="evento" />
    <div id="participant-main" tabIndex={-1}>
      <ParticipantArea slug={slug} initialProfileCode={profile.profileCode} initialEventType={profile.eventType} />
    </div>
  </>;
}
