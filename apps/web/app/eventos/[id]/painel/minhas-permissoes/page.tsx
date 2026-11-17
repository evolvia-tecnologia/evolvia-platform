import EventWorkspace from '../../../../../components/event-workspace';
import OperatorJourney from '../../../../../components/operator-journey';

export default async function MinhasPermissoesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventWorkspace eventId={id} section="check-in" contentTag="div">
    <OperatorJourney eventId={id} />
  </EventWorkspace>;
}
