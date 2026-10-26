import type { Metadata } from 'next';
import ParticipantActivityWaitlist from '../../../../../components/participant-activity-waitlist';
import PublicSiteHeader from '../../../../../components/public-site-header';

export const metadata: Metadata = {
  title: 'Fila da atividade',
  robots: { index: false, follow: false },
};

export default async function ParticipantActivityWaitlistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <>
    <a className="skip-link" href="#activity-waitlist-main">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="evento" />
    <div id="activity-waitlist-main" tabIndex={-1}>
      <ParticipantActivityWaitlist slug={slug} />
    </div>
  </>;
}
