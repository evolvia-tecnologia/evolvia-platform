'use client';

import { useParams } from 'next/navigation';
import ScientificStructure from '../../../../../components/scientific-structure';

export default function ScientificStructurePage() {
  const params = useParams<{ id: string }>();
  return <ScientificStructure eventId={params.id} />;
}
