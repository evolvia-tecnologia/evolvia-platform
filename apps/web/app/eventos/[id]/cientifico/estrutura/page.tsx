'use client';

import EventWorkspace from '../../../../../components/event-workspace';
import { useParams } from 'next/navigation';
import ScientificStructure from '../../../../../components/scientific-structure';

export default function ScientificStructurePage() {
  const params = useParams<{ id: string }>();
  return <EventWorkspace eventId={params.id} section="scientific" contentTag="div"><ScientificStructure eventId={params.id} /></EventWorkspace>;
}
