import EventWorkspace from '../../../../../components/event-workspace';
import EventEvaluationAdmin from '../../../../../components/event-evaluation-admin';

export default async function EventEvaluationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventWorkspace eventId={id} section="overview" contentTag="div"><EventEvaluationAdmin eventId={id} /></EventWorkspace>;
}
