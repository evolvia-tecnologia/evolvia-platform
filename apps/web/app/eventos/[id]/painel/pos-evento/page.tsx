'use client';

import { useParams } from 'next/navigation';
import EventWorkspace from '../../../../../components/event-workspace';
import PostEventReports from '../../../../../components/post-event-reports';

export default function PostEventPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  return <EventWorkspace key={id} eventId={id} section="overview"><PostEventReports key={id} eventId={id} /></EventWorkspace>;
}
