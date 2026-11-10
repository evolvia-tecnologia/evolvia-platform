import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import PublicRegistrationForm from '../../../../components/public-registration-form';
import PublicSiteHeader from '../../../../components/public-site-header';
import PublicSportsLanding from '../../../../components/public-sports-landing';
import type { PublicEventPresentationData } from '../../../../components/public-event-presentation';
import { readPublishedAthletePrompts, readPublishedShirtSizes } from '../../../../lib/sports-athlete-and-kits';
import { fetchPublicEventProfile, fetchPublicJson } from '../../../../lib/public-api';
import { parsePublicRegistrationOffer, publicPageTitle } from '../../../../lib/public-registration-cta';
import { isRunningProfile } from '../../../../lib/sports-public-profile';

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
  const [eventResult, registrationResult] = await Promise.all([
    fetchPublicJson(`/public/events/${encodeURIComponent(slug)}`, { cache: 'no-store' }),
    fetchPublicJson(`/public/events/${encodeURIComponent(slug)}/registration`, { cache: 'no-store' }),
  ]);
  const event = eventResult.ok && eventResult.payload && typeof eventResult.payload === 'object' && Array.isArray((eventResult.payload as { sections?: unknown }).sections)
    ? eventResult.payload as PublicEventPresentationData
    : null;
  const offer = registrationResult.ok ? parsePublicRegistrationOffer(registrationResult.payload) : null;
  const initialProtocol = typeof query.protocolo === 'string' ? query.protocolo : undefined;
  const offerLotId = !initialProtocol && typeof query.oferta === 'string' ? query.oferta : undefined;
  const runningEvent = isRunningProfile(profile.eventType) ? event : null;
  const sportsPreface = runningEvent
    ? <PublicSportsLanding
      event={runningEvent}
      context="registration"
      registrationOpen={offer !== null}
      shirtSizes={readPublishedShirtSizes(registrationResult.payload)}
      athletePrompts={readPublishedAthletePrompts(registrationResult.payload)}
    />
    : null;
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
        heading={runningEvent?.event.name}
        preface={sportsPreface}
      />
    </div>
  </>;
}
