import type { Metadata } from 'next';
import PublicSiteHeader from '../../../../../components/public-site-header';
import { RegistrationWaitlist } from '../../../../../components/registration-waitlist';
import { fetchPublicEventProfile } from '../../../../../lib/public-api';
import { publicPageTitle } from '../../../../../lib/public-registration-cta';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const profile = await fetchPublicEventProfile(slug);
  return {
    title: publicPageTitle('waitlist', profile.profileCode, profile.eventType),
    robots: { index: false, follow: false },
  };
}

export default async function RegistrationWaitlistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await fetchPublicEventProfile(slug);
  return <>
    <a className="skip-link" href="#waitlist-main">Pular para a fila de espera</a>
    <PublicSiteHeader current="evento" />
    <div id="waitlist-main" tabIndex={-1}>
      <RegistrationWaitlist
        slug={slug}
        initialProfileCode={profile.profileCode}
        initialEventType={profile.eventType}
      />
    </div>
  </>;
}
