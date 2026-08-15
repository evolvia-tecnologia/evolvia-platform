import type { Metadata } from 'next';
import PublicationPreview from '../../../../../../components/publication-preview';

export const metadata: Metadata = {
  title: 'Pré-visualização privada da Divulgação | Evolvia',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function DivulgacaoPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublicationPreview eventId={id} />;
}
