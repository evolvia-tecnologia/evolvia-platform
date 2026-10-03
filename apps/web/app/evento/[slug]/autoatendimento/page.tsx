'use client';

import { useParams } from 'next/navigation';
import SelfServiceKiosk from '../../../../components/self-service-kiosk';

export default function SelfServicePage() {
  const params = useParams<{ slug: string }>();
  return <SelfServiceKiosk slug={params?.slug ?? ''} />;
}
