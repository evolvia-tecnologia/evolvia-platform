'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import EventWorkspace from '../../../../../components/event-workspace';
import RegistrationRefundOrganizer from '../../../../../components/registration-refund-organizer';
import { getToken } from '../../../../../lib/api';

export default function EventRefundsPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const router = useRouter();
  useEffect(() => {
    if (!getToken()) router.replace('/login');
  }, [router]);
  if (!id) return <p role="alert">Escolha um evento para abrir os reembolsos.</p>;
  return <EventWorkspace eventId={id} section="financial" contentTag="div">
    <main id="main-content">
      <RegistrationRefundOrganizer eventId={id} />
    </main>
  </EventWorkspace>;
}
