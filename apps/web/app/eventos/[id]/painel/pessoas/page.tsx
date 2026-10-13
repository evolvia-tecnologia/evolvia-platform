'use client';

import { useParams } from 'next/navigation';
import EventPeopleSheet from '../../../../../components/event-people-sheet';
import EventWorkspace from '../../../../../components/event-workspace';

export default function EventPeoplePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  return <EventWorkspace key={id} eventId={id} section="overview"><EventPeopleSheet key={id} eventId={id} /></EventWorkspace>;
}
