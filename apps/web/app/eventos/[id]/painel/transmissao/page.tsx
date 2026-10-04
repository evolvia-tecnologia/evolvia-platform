import EventTransmission from '../../../../../components/event-transmission';
import EventWorkspace from '../../../../../components/event-workspace';

export default async function TransmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventWorkspace eventId={id} section="transmission" contentTag="div"><EventTransmission eventId={id} /></EventWorkspace>;
}
