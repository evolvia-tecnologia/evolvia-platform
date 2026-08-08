'use client';

import { useParams } from 'next/navigation';
import ScientificGuests from '../../../../../components/scientific-guests';

export default function ScientificGuestsPage() {
  const params = useParams<{ id: string }>();
  return <ScientificGuests eventId={params.id} />;
}
