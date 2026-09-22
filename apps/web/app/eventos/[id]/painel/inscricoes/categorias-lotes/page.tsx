import RegistrationCommercialBuilder from '../../../../../../components/registration-commercial-builder';

export default async function RegistrationCommercialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RegistrationCommercialBuilder eventId={id} />;
}
