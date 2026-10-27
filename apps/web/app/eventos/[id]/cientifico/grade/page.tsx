'use client';

import { useParams } from 'next/navigation';
import ScientificEventCentral from '../../../../../components/scientific-event-central';

export default function GradeCientificaPage() {
  const params = useParams<{ id: string }>();
  return <ScientificEventCentral eventId={params.id} flow="program" />;
}
