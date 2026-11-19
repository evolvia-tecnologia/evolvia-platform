import type { Metadata } from 'next';
import PublicRegistrationGroupForm from '../../../../../components/public-registration-group-form';
import PublicSiteHeader from '../../../../../components/public-site-header';
import { fetchPublicEventProfile } from '../../../../../lib/public-api';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const profile = await fetchPublicEventProfile(slug);
  return {
    title: 'Compra múltipla · ' + (profile.eventType ?? 'Inscrições'),
    robots: { index: false, follow: false },
  };
}

export default async function PublicGroupRegistrationPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pedido?: string | string[] }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const initialOrderId = typeof query.pedido === 'string' && /^[A-Za-z0-9_-]{8,128}$/u.test(query.pedido)
    ? query.pedido : undefined;
  return <>
    <a className="skip-link" href="#group-registration-main">Pular para a compra múltipla</a>
    <PublicSiteHeader current="evento" />
    <div id="group-registration-main" tabIndex={-1}>
      <PublicRegistrationGroupForm slug={slug} initialOrderId={initialOrderId} />
    </div>
  </>;
}
