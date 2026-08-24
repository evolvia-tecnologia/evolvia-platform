import type { ReactNode } from 'react';

export const metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function ResetPasswordLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
