import type { MetadataRoute } from 'next';

const PUBLIC_BASE_URL = (process.env.EVOLVIA_PUBLIC_BASE_URL ?? 'https://evolviatecnologia.com').replace(/\/$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/eventos', '/evento/'],
        disallow: [
          '/login',
          '/cadastro',
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
