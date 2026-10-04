import RegistrationFormBuilder from '../../../../../../components/registration-form-builder';
import EventWorkspace from '../../../../../../components/event-workspace';

export default async function RegistrationFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventWorkspace eventId={id} section="form" contentTag="div"><RegistrationFormBuilder eventId={id} /></EventWorkspace>;
}
