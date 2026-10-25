import EventReuse from '../../../../../components/event-reuse';

export default async function ReuseEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventReuse eventId={id} />;
}

