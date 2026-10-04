'use client';

import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import EventWorkspace from '../../../../components/event-workspace';

export default function ScientificLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  const eventId = params?.id ?? '';
  return <EventWorkspace eventId={eventId} section="scientific" contentTag="div">{children}</EventWorkspace>;
}
