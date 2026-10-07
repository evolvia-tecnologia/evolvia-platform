import type { Metadata } from 'next';
import PublicSiteHeader from '../../../../../components/public-site-header';
import { RegistrationWaitlist } from '../../../../../components/registration-waitlist';

export const metadata: Metadata = {
  title: 'Fila de espera da inscrição',
  robots: { index: false, follow: false },
};

export default async function RegistrationWaitlistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <>
    <a className="skip-link" href="#waitlist-main">Pular para a fila de espera</a>
    <PublicSiteHeader current="evento" />
    <div id="waitlist-main" tabIndex={-1}>
      <RegistrationWaitlist slug={slug} />
    </div>
  </>;
}
