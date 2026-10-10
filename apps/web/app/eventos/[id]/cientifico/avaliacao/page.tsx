'use client';

import { useParams } from 'next/navigation';
import ScientificReviewDistribution from '../../../../../components/scientific-review-distribution';
import ScientificReviews from '../../../../../components/scientific-reviews';

export default function ScientificReviewsPage() {
  const params = useParams<{ id: string }>();
  return <>
    <ScientificReviews eventId={params.id} />
    <ScientificReviewDistribution eventId={params.id} />
  </>;
}
