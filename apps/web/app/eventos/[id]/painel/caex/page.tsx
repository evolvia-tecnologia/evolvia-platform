import ExhibitorCaex from '../../../../../components/exhibitor-caex';
import EventWorkspace from '../../../../../components/event-workspace';

export default async function CaexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventWorkspace eventId={id} section="caex" contentTag="div"><ExhibitorCaex eventId={id} /></EventWorkspace>;
}
