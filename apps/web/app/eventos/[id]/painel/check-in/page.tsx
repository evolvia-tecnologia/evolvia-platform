import EventDesk from '../../../../../components/event-desk';
import EventWorkspace from '../../../../../components/event-workspace';

export default async function CheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventWorkspace eventId={id} section="check-in" contentTag="div"><EventDesk eventId={id} /></EventWorkspace>;
}
