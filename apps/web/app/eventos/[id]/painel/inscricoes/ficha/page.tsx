import RegistrationFormBuilder from '../../../../../../components/registration-form-builder';

export default async function RegistrationFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RegistrationFormBuilder eventId={id} />;
}
