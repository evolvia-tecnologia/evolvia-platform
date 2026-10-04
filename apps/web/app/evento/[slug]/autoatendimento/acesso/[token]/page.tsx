'use client';

import { useParams } from 'next/navigation';
import SelfServiceKiosk from '../../../../../../components/self-service-kiosk';

export default function SelfServiceAccessPage() {
  const params = useParams<{ slug: string; token: string }>();
  return <SelfServiceKiosk slug={params?.slug ?? ''} accessToken={params?.token ?? ''} />;
}
