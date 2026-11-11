'use client';

import { useContext } from 'react';
import { showsCertificateNavigation, showsRoleCertificateNavigation } from '../lib/event-flow';
import EventCertificate from './event-certificate';
import { EventCapabilityContext } from './event-workspace';
import EventRoleCertificates from './event-role-certificates';

export default function EventCertificateDesk({ eventId }: { eventId: string }) {
  const capabilities = useContext(EventCapabilityContext);
  return <>
    {showsCertificateNavigation(capabilities) && <EventCertificate eventId={eventId} />}
    {showsRoleCertificateNavigation(capabilities) && <EventRoleCertificates eventId={eventId} />}
  </>;
}
