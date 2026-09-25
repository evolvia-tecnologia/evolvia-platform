import ParticipantArea from '../../../../components/participant-area';

export default async function ParticipantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ParticipantArea slug={slug} />;
}
