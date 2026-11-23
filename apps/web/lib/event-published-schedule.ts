export type PublishedScheduleSnapshot = {
  startDate?: string | null;
  endDate?: string | null;
  timeZone?: string | null;
  venue?: string | null;
};

export type PublishedScheduleResponse = PublishedScheduleSnapshot & {
  updatedAt: string;
  alterados?: string[];
};

export type PublishedScheduleBody = {
  expectedUpdatedAt: string;
  motivo: string;
  startDate?: string | null;
  endDate?: string | null;
  timeZone?: string | null;
  venue?: string | null;
};

function sameInstant(left: unknown, right: unknown): boolean {
  const normalize = (value: unknown): unknown => {
    if (value == null) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    return value;
  };
  const a = normalize(left);
  const b = normalize(right);
  if (a == null && b == null) return true;
  if (typeof a !== 'string' || typeof b !== 'string') return a === b;
  const parsedLeft = Date.parse(a);
  const parsedRight = Date.parse(b);
  if (Number.isNaN(parsedLeft) || Number.isNaN(parsedRight)) return a === b;
  return parsedLeft === parsedRight;
}

function canonicalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function isPublishedEventStatus(status: string | null | undefined): boolean {
  return status === 'PUBLISHED';
}

/** Corpo canônico do PATCH /events/:eventId/schedule (#666 / C-05). */
export function buildPublishedScheduleBody(input: {
  expectedUpdatedAt: string;
  motivo: string;
  startDate?: string | null;
  endDate?: string | null;
  timeZone?: string | null;
  venue?: string | null;
  includeVenue?: boolean;
}): PublishedScheduleBody {
  const motivo = input.motivo.trim();
  const body: PublishedScheduleBody = {
    expectedUpdatedAt: input.expectedUpdatedAt,
    motivo,
  };
  if (input.startDate !== undefined) body.startDate = input.startDate;
  if (input.endDate !== undefined) body.endDate = input.endDate;
  if (input.timeZone !== undefined) body.timeZone = input.timeZone;
  if (input.includeVenue && input.venue !== undefined) body.venue = input.venue;
  return body;
}

export function publishedScheduleRejection(
  snapshot: PublishedScheduleSnapshot,
  response: PublishedScheduleSnapshot | null | undefined,
  options?: { requireVenue?: boolean },
): string | null {
  const server = response ?? {};
  const zone = (value: string | null | undefined) => value ?? '';
  const datesMatch = sameInstant(snapshot.startDate ?? null, server.startDate ?? null)
    && sameInstant(snapshot.endDate ?? null, server.endDate ?? null)
    && zone(snapshot.timeZone) === zone(server.timeZone);
  if (!datesMatch) {
    return 'O servidor manteve a data anterior. A alteração desta tela não foi gravada.';
  }
  if (options?.requireVenue) {
    const venueMatch = canonicalText(snapshot.venue) === canonicalText(server.venue);
    if (!venueMatch) {
      return 'O servidor manteve o local anterior. A alteração desta tela não foi gravada.';
    }
  }
  return null;
}

export function publishedScheduleUnavailableMessage(status: number | undefined): string | null {
  if (status === 404) {
    return 'A alteração de agenda em evento publicado ainda não está disponível nesta base (rota #666). As datas desta tela não foram gravadas.';
  }
  return null;
}
