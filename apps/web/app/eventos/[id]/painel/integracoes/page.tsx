import EventAdminDashboard from '../../../../../components/event-admin-dashboard';

export default async function IntegracoesDoEventoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventAdminDashboard eventId={id} section="integrations" />;
}
