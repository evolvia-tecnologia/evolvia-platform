'use client';

import { useParams } from 'next/navigation';
import ScientificProgram from '../../../../../components/scientific-program';

export default function ScientificProgramPage() {
  const params = useParams<{ id: string }>();
  return <ScientificProgram eventId={params.id} />;
}
