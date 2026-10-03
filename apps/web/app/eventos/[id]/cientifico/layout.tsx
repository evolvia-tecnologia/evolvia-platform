'use client';

import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import EventWorkspace from '../../../../components/event-workspace';

export default function ScientificLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  return <EventWorkspace eventId={params.id} section="scientific" contentTag="div">{children}</EventWorkspace>;
}
