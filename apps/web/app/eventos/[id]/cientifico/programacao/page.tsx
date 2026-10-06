'use client';

import EventWorkspace from '../../../../../components/event-workspace';
import { useParams } from 'next/navigation';
import ScientificProgram from '../../../../../components/scientific-program';

export default function ScientificProgramPage() {
  const params = useParams<{ id: string }>();
  return <EventWorkspace eventId={params.id} section="scientific" contentTag="div"><ScientificProgram eventId={params.id} /></EventWorkspace>;
}
