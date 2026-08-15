import type { MetadataRoute } from 'next';

const API_BASE_URL = process.env.EVOLVIA_API_INTERNAL_URL ?? 'http://api:4000';
const PUBLIC_BASE_URL = (process.env.EVOLVIA_PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const PUBLIC_INDEXING_ENABLED = process.env.EVOLVIA_PUBLIC_INDEXING === '1';

type SitemapEvent = {
  slug: string;
  updatedAt: string;
};

async function publishedEvents(): Promise<SitemapEvent[]> {
  const response = await fetch(`${API_BASE_URL}/public/events/meta/sitemap`, {
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error('Não foi possível carregar o índice dos eventos publicados.');
  return response.json() as Promise<SitemapEvent[]>;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!PUBLIC_INDEXING_ENABLED) return [];

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${PUBLIC_BASE_URL}/`,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${PUBLIC_BASE_URL}/eventos`,
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ];

  try {
    const events = await publishedEvents();
    return [
      ...staticEntries,
      ...events.map((event) => ({
        url: `${PUBLIC_BASE_URL}/evento/${encodeURIComponent(event.slug)}`,
        lastModified: new Date(event.updatedAt),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
    ];
  } catch {
    return staticEntries;
  }
}
