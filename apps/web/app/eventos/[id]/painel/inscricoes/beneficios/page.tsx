import RegistrationBenefitsBuilder from '../../../../../../components/registration-benefits-builder';
import RegistrationCouponBatch from '../../../../../../components/registration-coupon-batch';
import EventWorkspace from '../../../../../../components/event-workspace';

export default async function RegistrationBenefitsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventWorkspace eventId={id} section="benefits" contentTag="div">
    <RegistrationBenefitsBuilder eventId={id} />
    <RegistrationCouponBatch eventId={id} />
  </EventWorkspace>;
}
