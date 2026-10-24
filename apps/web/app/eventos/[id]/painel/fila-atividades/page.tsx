import EventWorkspace from '../../../../../components/event-workspace';
import ActivityWaitlistAdmin from '../../../../../components/activity-waitlist-admin';

export default async function ActivityWaitlistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventWorkspace eventId={id} section="overview" contentTag="div"><ActivityWaitlistAdmin eventId={id} /></EventWorkspace>;
}
