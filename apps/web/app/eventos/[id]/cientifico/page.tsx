'use client';

import { useParams } from 'next/navigation';
import ScientificEventCentral from '../../../../components/scientific-event-central';

export default function CentralEventoCientificoPage() {
  const params = useParams<{ id: string }>();
  return <ScientificEventCentral eventId={params.id} />;
}
