'use client';

import { useParams } from 'next/navigation';
import PublicationEditor from '../../../../../components/publication-editor';

export default function DivulgacaoDoEventoPage() {
  const params = useParams<{ id: string }>();
  return <PublicationEditor eventId={params.id} />;
}
