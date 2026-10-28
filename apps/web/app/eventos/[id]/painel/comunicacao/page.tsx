import EventWorkspace from '../../../../../components/event-workspace';
import EventCommunication from '../../../../../components/event-communication';

export default async function EventCommunicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventWorkspace eventId={id} section="communication" contentTag="div"><EventCommunication eventId={id} /></EventWorkspace>;
}
