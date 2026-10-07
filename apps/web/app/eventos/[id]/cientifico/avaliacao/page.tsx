'use client';

import { useParams } from 'next/navigation';
import ScientificReviews from '../../../../../components/scientific-reviews';

export default function ScientificReviewsPage() {
  const params = useParams<{ id: string }>();
  return <ScientificReviews eventId={params.id} />;
}
