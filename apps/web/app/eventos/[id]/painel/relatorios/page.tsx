import EventWorkspace from '../../../../../components/event-workspace';
import PostEventReports from '../../../../../components/post-event-reports';

export default async function EventReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventWorkspace eventId={id} section="reports"><PostEventReports key={id} eventId={id} /></EventWorkspace>;
}
