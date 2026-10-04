import RegistrationOperations from '../../../../../components/registration-operations';
import EventWorkspace from '../../../../../components/event-workspace';

export default async function RegistrationOperationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventWorkspace eventId={id} section="registrations" contentTag="div"><RegistrationOperations eventId={id} /></EventWorkspace>;
}
