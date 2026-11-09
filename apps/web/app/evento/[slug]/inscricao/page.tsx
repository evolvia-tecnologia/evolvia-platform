import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import PublicRegistrationForm from '../../../../components/public-registration-form';
import PublicSiteHeader from '../../../../components/public-site-header';
import { fetchPublicEventProfile } from '../../../../lib/public-api';
import { publicPageTitle } from '../../../../lib/public-registration-cta';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const profile = await fetchPublicEventProfile(slug);
  return {
    title: publicPageTitle('registration', profile.profileCode, profile.eventType),
    robots: { index: false, follow: false },
  };
}

export default async function PublicRegistrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ protocolo?: string | string[]; oferta?: string | string[]; pedido?: string | string[] }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const orderId = typeof query.pedido === 'string' ? query.pedido : '';
  if (/^[A-Za-z0-9_-]{8,128}$/u.test(orderId)) {
    redirect('/evento/' + encodeURIComponent(slug) + '/inscricao/grupo?pedido=' + encodeURIComponent(orderId));
  }
  const profile = await fetchPublicEventProfile(slug);
  const initialProtocol = typeof query.protocolo === 'string' ? query.protocolo : undefined;
  const offerLotId = !initialProtocol && typeof query.oferta === 'string' ? query.oferta : undefined;
  return <>
    <a className="skip-link" href="#registration-main">Pular para o formulário de inscrição</a>
    <PublicSiteHeader current="evento" />
    <div id="registration-main" tabIndex={-1}>
      <PublicRegistrationForm
        slug={slug}
        initialProtocol={initialProtocol}
        offerLotId={offerLotId}
        initialProfileCode={profile.profileCode}
        initialEventType={profile.eventType}
      />
    </div>
  </>;
}
