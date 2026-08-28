import type { MetadataRoute } from 'next';

const PUBLIC_BASE_URL = (process.env.EVOLVIA_PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const PUBLIC_INDEXING_ENABLED = process.env.EVOLVIA_PUBLIC_INDEXING === '1';

export default function robots(): MetadataRoute.Robots {
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
        disallow: [
          '/login',
          '/cadastro',
          '/termos-de-uso',
          '/privacidade',
          '/painel',
          '/convites',
          '/eventos/novo',
          '/eventos/*/painel',
          '/eventos/*/cientifico',
          '/eventos/*/configuracao',
        ],
      },
    ],
    sitemap: `${PUBLIC_BASE_URL}/sitemap.xml`,
  };
}
