import type { Metadata } from 'next';
import './globals.css';
import './auth-compact.css';

export const metadata: Metadata = {
  applicationName: 'Evolvia',
  title: {
    default: 'Evolvia',
    template: '%s | Evolvia',
  },
  description: 'Criação inteligente e self-service de eventos.',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    shortcut: '/icon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
