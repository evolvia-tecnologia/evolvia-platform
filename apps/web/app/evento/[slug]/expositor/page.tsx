import ExhibitorArea from '../../../../components/exhibitor-area';

export default async function ExhibitorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ExhibitorArea slug={slug} />;
}
