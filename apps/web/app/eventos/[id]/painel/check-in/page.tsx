import CheckInConsole from '../../../../../components/check-in-console';

export default async function CheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CheckInConsole eventId={id} />;
}
