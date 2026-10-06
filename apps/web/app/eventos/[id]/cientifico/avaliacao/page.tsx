'use client';

import EventWorkspace from '../../../../../components/event-workspace';
import { useParams } from 'next/navigation';
import ScientificReviews from '../../../../../components/scientific-reviews';

export default function ScientificReviewsPage() {
  const params = useParams<{ id: string }>();
  return <EventWorkspace eventId={params.id} section="scientific" contentTag="div"><ScientificReviews eventId={params.id} /></EventWorkspace>;
}
