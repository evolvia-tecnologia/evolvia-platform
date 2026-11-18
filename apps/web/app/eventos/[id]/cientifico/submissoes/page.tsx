'use client';

import { useParams } from 'next/navigation';
import ScientificFileBatch from '../../../../../components/scientific-file-batch';
import ScientificSubmissions from '../../../../../components/scientific-submissions';

export default function ScientificSubmissionsPage() {
  const params = useParams<{ id: string }>();
  return (
    <>
      <ScientificSubmissions eventId={params.id} />
      <ScientificFileBatch eventId={params.id} />
    </>
  );
}
