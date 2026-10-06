import EventCertificate from '../../../../../components/event-certificate';
import EventWorkspace from '../../../../../components/event-workspace';

export default async function CertificateSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventWorkspace eventId={id} section="certificates" contentTag="div"><EventCertificate eventId={id} /></EventWorkspace>;
}
