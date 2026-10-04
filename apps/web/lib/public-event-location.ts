export function normalizedPublicVenue(venue: string | null | undefined): string | null {
  const normalized = venue?.trim();
  return normalized || null;
}

export function publicVenueMapUrl(venue: string | null | undefined): string | null {
  const normalized = normalizedPublicVenue(venue);
  if (!normalized) return null;
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', normalized);
  return url.toString();
}

export function publicVenueWazeUrl(venue: string | null | undefined): string | null {
  const normalized = normalizedPublicVenue(venue);
  if (!normalized) return null;
  const url = new URL('https://www.waze.com/ul');
  url.searchParams.set('q', normalized);
  url.searchParams.set('navigate', 'yes');
  return url.toString();
}
