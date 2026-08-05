'use client';

import { useParams } from 'next/navigation';
import EventWizard from '../../../../components/event-wizard';

export default function ConfiguracaoEventoPage() {
  const params = useParams<{ id: string }>();
  return <EventWizard eventId={params.id} />;
}
