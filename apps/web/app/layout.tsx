import type { Metadata } from 'next';
import { DEFAULT_LOCALE } from '../lib/i18n';
import { resolvePublicOrigin } from './robots';
import './design-tokens.css';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(resolvePublicOrigin()),
  applicationName: 'Evolvia',
  title: {
    default: 'Evolvia — criação inteligente de eventos',
    template: '%s | Evolvia',
  },
  description: 'Plataforma brasileira para criar, divulgar e operar eventos com autonomia.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Evolvia',
    title: 'Evolvia — criação inteligente de eventos',
    description: 'Plataforma brasileira para criar, divulgar e operar eventos com autonomia.',
    url: '/',
  },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    shortcut: '/icon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang={DEFAULT_LOCALE}><body>{children}</body></html>;
}
