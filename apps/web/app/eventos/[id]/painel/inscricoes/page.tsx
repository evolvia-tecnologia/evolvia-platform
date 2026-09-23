import RegistrationOperations from '../../../../../components/registration-operations';

export default async function RegistrationOperationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RegistrationOperations eventId={id} />;
}
