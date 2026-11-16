import type { MetadataRoute } from 'next';

/** --color-brand-navy-950 em `app/design-tokens.css`. */
const CANONICAL_THEME_COLOR = '#111a2f';
/** --color-canvas em `app/design-tokens.css`. */
const CANONICAL_BACKGROUND_COLOR = '#f3f6fb';

const EXISTING_PUBLIC_ICON = {
  src: '/icon.svg',
  type: 'image/svg+xml',
  sizes: 'any',
  purpose: 'any',
} as const;

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Evolvia',
    short_name: 'Evolvia',
    lang: 'pt-BR',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'browser',
    background_color: CANONICAL_BACKGROUND_COLOR,
    theme_color: CANONICAL_THEME_COLOR,
    icons: [EXISTING_PUBLIC_ICON],
  };
}
