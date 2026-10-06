'use client';

import EventWorkspace from '../../../../../components/event-workspace';
import { useParams } from 'next/navigation';
import ScientificSubmissions from '../../../../../components/scientific-submissions';

export default function ScientificSubmissionsPage() {
  const params = useParams<{ id: string }>();
  return <EventWorkspace eventId={params.id} section="scientific" contentTag="div"><ScientificSubmissions eventId={params.id} /></EventWorkspace>;
}
