import CheckInConsole from '../../../../../components/check-in-console';
import EventWorkspace from '../../../../../components/event-workspace';

export default async function CheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventWorkspace eventId={id} section="check-in" contentTag="div"><CheckInConsole eventId={id} /></EventWorkspace>;
}
