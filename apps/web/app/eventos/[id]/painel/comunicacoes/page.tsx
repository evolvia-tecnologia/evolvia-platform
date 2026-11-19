import { redirect } from 'next/navigation';

export default async function LegacyCommunicationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/eventos/${encodeURIComponent(id)}/painel/comunicacao`);
}
