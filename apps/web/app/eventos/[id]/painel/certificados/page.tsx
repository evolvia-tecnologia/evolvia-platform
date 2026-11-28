import EventCertificateDesk from '../../../../../components/event-certificate-desk';
import EventWorkspace from '../../../../../components/event-workspace';

export default async function CertificateSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventWorkspace eventId={id} section="certificates" contentTag="div"><EventCertificateDesk eventId={id} /></EventWorkspace>;
}
