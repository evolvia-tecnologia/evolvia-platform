import type { MetadataRoute } from 'next';
import { buildPublicDiscoveryUrl, isPublicEventSlug, resolvePublicOrigin } from './robots';

const API_BASE_URL = process.env.EVOLVIA_API_INTERNAL_URL ?? 'http://api:4000';
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

  const origin = resolvePublicOrigin();
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: buildPublicDiscoveryUrl('/', origin),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: buildPublicDiscoveryUrl('/eventos', origin),
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ];

  try {
    const events = await publishedEvents();
    const eventEntries = events
      .filter((event) => isPublicEventSlug(event.slug))
      .map((event) => ({
        url: buildPublicDiscoveryUrl(`/evento/${event.slug}`, origin),
        lastModified: new Date(event.updatedAt),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }));

    return [...staticEntries, ...eventEntries];
  } catch {
    return staticEntries;
  }
}
