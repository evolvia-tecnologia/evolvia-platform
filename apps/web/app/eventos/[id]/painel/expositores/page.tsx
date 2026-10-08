import EventExhibitors from '../../../../../components/event-exhibitors';
import EventWorkspace from '../../../../../components/event-workspace';

export default async function ExhibitorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventWorkspace eventId={id} section="exhibitors" contentTag="div"><EventExhibitors eventId={id} /></EventWorkspace>;
}

