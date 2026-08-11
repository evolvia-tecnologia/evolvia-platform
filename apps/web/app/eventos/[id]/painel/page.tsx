'use client';

import { useParams } from 'next/navigation';
import EventAdminDashboard from '../../../../components/event-admin-dashboard';

export default function PainelDoEventoPage() {
  const params = useParams<{ id: string }>();
  return <EventAdminDashboard eventId={params.id} section="overview" />;
}
