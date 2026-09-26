import type { MetadataRoute } from 'next';

const DEV_PUBLIC_ORIGIN = 'http://localhost:3000';
const PUBLIC_INDEXING_ENABLED = process.env.EVOLVIA_PUBLIC_INDEXING === '1';
const PUBLIC_EVENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PUBLIC_DISCOVERY_PATH_PATTERN = /^\/(?:|eventos|evento\/[a-z0-9]+(?:-[a-z0-9]+)*)$/u;

const PRIVATE_ROUTE_DISALLOW = [
  '/login',
  '/cadastro',
  '/termos-de-uso',
  '/privacidade',
  '/painel',
  '/convites',
  '/eventos/novo',
  '/eventos/*/painel',
  '/eventos/*/painel/divulgacao',
  '/eventos/*/painel/divulgacao/preview',
  '/eventos/*/cientifico',
  '/eventos/*/configuracao',
  '/eventos/*/inscricoes',
] as const;

export function resolvePublicOrigin(): string {
  const configured = process.env.EVOLVIA_PUBLIC_BASE_URL?.trim();
  if (!configured) return DEV_PUBLIC_ORIGIN;

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('EVOLVIA_PUBLIC_BASE_URL inválida.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('EVOLVIA_PUBLIC_BASE_URL inválida.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('EVOLVIA_PUBLIC_BASE_URL inválida.');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('EVOLVIA_PUBLIC_BASE_URL inválida.');
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error('EVOLVIA_PUBLIC_BASE_URL inválida.');
  }

  return parsed.origin;
}

export function isPublicEventSlug(slug: string): boolean {
  return typeof slug === 'string'
    && slug.length >= 2
    && slug.length <= 120
    && PUBLIC_EVENT_SLUG_PATTERN.test(slug);
}

export function buildPublicDiscoveryUrl(path: string, origin = resolvePublicOrigin()): string {
  const normalized = path.trim();
  if (!PUBLIC_DISCOVERY_PATH_PATTERN.test(normalized)) {
    throw new Error('Caminho público inválido para indexação.');
  }

  const base = new URL(origin);
  const resolved = new URL(normalized, base);
  if (resolved.origin !== base.origin) {
    throw new Error('URL fora da origem pública configurada.');
  }
  if (resolved.search || resolved.hash) {
    throw new Error('URL pública não pode conter query ou fragmento.');
  }

  return normalized === '/' ? `${base.origin}/` : `${base.origin}${normalized}`;
}

export default function robots(): MetadataRoute.Robots {
  const origin = resolvePublicOrigin();

  if (!PUBLIC_INDEXING_ENABLED) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/eventos', '/evento/'],
        disallow: [...PRIVATE_ROUTE_DISALLOW],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
