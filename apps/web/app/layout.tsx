import type { Metadata } from 'next';
import { DEFAULT_LOCALE } from '../lib/i18n';
import './design-tokens.css';
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
  return <html lang={DEFAULT_LOCALE}><body>{children}</body></html>;
}
