import EventWorkspace from '../../../../../components/event-workspace';
import OperatorCapabilities from '../../../../../components/operator-capabilities';

export default async function OperatorCapabilitiesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventWorkspace eventId={id} section="check-in" contentTag="div"><OperatorCapabilities eventId={id} /></EventWorkspace>;
}
