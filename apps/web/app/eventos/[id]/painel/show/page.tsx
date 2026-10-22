import EventWorkspace from '../../../../../components/event-workspace';
import ShowOperationsConsole from '../../../../../components/show-operations-console';

export default async function ShowOperationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventWorkspace eventId={id} section="show" contentTag="div"><ShowOperationsConsole eventId={id} /></EventWorkspace>;
}
