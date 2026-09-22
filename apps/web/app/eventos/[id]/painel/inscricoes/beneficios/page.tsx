import RegistrationBenefitsBuilder from '../../../../../../components/registration-benefits-builder';

export default async function RegistrationBenefitsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RegistrationBenefitsBuilder eventId={id} />;
}
