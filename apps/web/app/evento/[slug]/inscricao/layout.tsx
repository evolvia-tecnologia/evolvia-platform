import type { ReactNode } from 'react';
import RegistrationHoldNotice from '../../../../components/registration-hold-notice';

export default async function PublicRegistrationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <>
    <RegistrationHoldNotice slug={slug} />
    {children}
  </>;
}
