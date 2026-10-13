import RegistrationCommercialBuilder from '../../../../../../components/registration-commercial-builder';
import RegistrationLotDisplay from '../../../../../../components/registration-lot-display';
import EventWorkspace from '../../../../../../components/event-workspace';

export default async function RegistrationCommercialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventWorkspace eventId={id} section="commercial" contentTag="div">
    <RegistrationCommercialBuilder eventId={id} />
    <RegistrationLotDisplay eventId={id} />
  </EventWorkspace>;
}
