'use client';

import EventWorkspace from '../../../../../components/event-workspace';
import { useParams } from 'next/navigation';
import ScientificGuests from '../../../../../components/scientific-guests';

export default function ScientificGuestsPage() {
  const params = useParams<{ id: string }>();
  return <EventWorkspace eventId={params.id} section="scientific" contentTag="div"><ScientificGuests eventId={params.id} /></EventWorkspace>;
}
