'use client';

import { useParams } from 'next/navigation';
import EventConfigurationRouter from '../../../../components/event-configuration-router';

export default function ConfiguracaoEventoPage() {
  const params = useParams<{ id: string }>();
  return <EventConfigurationRouter eventId={params.id} />;
}
