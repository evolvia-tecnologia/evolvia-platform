'use client';

import { useParams } from 'next/navigation';
import ScientificSubmissions from '../../../../../components/scientific-submissions';

export default function ScientificSubmissionsPage() {
  const params = useParams<{ id: string }>();
  return <ScientificSubmissions eventId={params.id} />;
}
