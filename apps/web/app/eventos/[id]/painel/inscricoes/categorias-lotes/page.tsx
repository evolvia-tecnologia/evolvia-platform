import RegistrationCommercialBuilder from '../../../../../../components/registration-commercial-builder';
import EventWorkspace from '../../../../../../components/event-workspace';

export default async function RegistrationCommercialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventWorkspace eventId={id} section="commercial" contentTag="div"><RegistrationCommercialBuilder eventId={id} /></EventWorkspace>;
}
