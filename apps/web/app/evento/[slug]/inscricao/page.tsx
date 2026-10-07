import type { Metadata } from 'next';
import PublicRegistrationForm from '../../../../components/public-registration-form';
import PublicSiteHeader from '../../../../components/public-site-header';

export const metadata: Metadata = {
  title: 'Inscrição no evento',
  robots: { index: false, follow: false },
};

export default async function PublicRegistrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ protocolo?: string | string[]; oferta?: string | string[] }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const initialProtocol = typeof query.protocolo === 'string' ? query.protocolo : undefined;
  const offerLotId = !initialProtocol && typeof query.oferta === 'string' ? query.oferta : undefined;
  return <>
    <a className="skip-link" href="#registration-main">Pular para o formulário de inscrição</a>
    <PublicSiteHeader current="evento" />
    <div id="registration-main" tabIndex={-1}>
      <PublicRegistrationForm slug={slug} initialProtocol={initialProtocol} offerLotId={offerLotId} />
    </div>
  </>;
}
