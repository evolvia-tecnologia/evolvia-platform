import type { Metadata } from 'next';
import AccessibilityPanel from '../components/accessibility-panel';
import { ACCESSIBILITY_BOOT_SCRIPT } from '../lib/accessibility-preferences';
import { DEFAULT_LOCALE } from '../lib/i18n';
import './design-tokens.css';
import './globals.css';
import './print-surface-global.css';
import './accessibility.css';

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
  return <html lang={DEFAULT_LOCALE}>
    <body>
      <script dangerouslySetInnerHTML={{ __html: ACCESSIBILITY_BOOT_SCRIPT }} />
      <a className="content-skip" href="#conteudo-principal" data-a11y-chrome="">Pular para o conteúdo principal</a>
      <div id="conteudo-principal" tabIndex={-1}>
        {children}
      </div>
      <AccessibilityPanel />
    </body>
  </html>;
}
