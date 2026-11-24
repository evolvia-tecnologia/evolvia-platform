import { agendaDateLabel, agendaDay, agendaHour, agendaRole, agendaTimeZone } from './scientific-program-agenda';

export type PublicProgramParticipant = {
  name: string;
  professionalTitle: string | null;
  participationType: string;
  customRoleLabel: string | null;
  portraitUrl: string | null;
};

export type PublicProgramWork = {
  title: string;
  code: number | null;
  authors: string[];
};

export type PublicProgramActivity = {
  id: string;
  title: string;
  activityType: string;
  description: string | null;
  startAt: string;
  endAt: string;
  space: { name: string; location: string | null } | null;
  online: boolean;
  area: string | null;
  participants: PublicProgramParticipant[];
  work: PublicProgramWork | null;
};

export type PublicProgram = {
  event: { slug: string; timeZone: string | null; format: string };
  activities: PublicProgramActivity[];
};

export type PublicProgramDay = {
  key: string;
  label: string;
  activities: Array<PublicProgramActivity & {
    startLabel: string;
    endLabel: string;
    endsOnAnotherDay: string | null;
    people: Array<{ name: string; detail: string; portraitUrl: string | null }>;
  }>;
};

const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

export function publicPortraitUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 300) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

const instant = (value: unknown): string | null =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;

function parseWork(value: unknown): PublicProgramWork | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const title = text(raw.title, 1000);
  if (!title) return null;
  const code = typeof raw.code === 'number' && Number.isInteger(raw.code) && raw.code > 0 && raw.code <= 2_147_483_647
    ? raw.code
    : null;
  const authors = Array.isArray(raw.authors)
    ? raw.authors.flatMap((item) => {
      const name = text(item, 160);
      return name ? [name] : [];
    }).slice(0, 40)
    : [];
  return { title, code, authors };
}

function parseActivity(value: unknown): PublicProgramActivity | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id, 64);
  const title = text(raw.title, 180);
  const startAt = instant(raw.startAt);
  const endAt = instant(raw.endAt);
  if (!id || !title || !startAt || !endAt) return null;
  const space = raw.space && typeof raw.space === 'object' ? raw.space as Record<string, unknown> : null;
  const spaceName = space ? text(space.name, 120) : null;
  const participants = Array.isArray(raw.participants) ? raw.participants.flatMap((item): PublicProgramParticipant[] => {
    if (!item || typeof item !== 'object') return [];
    const person = item as Record<string, unknown>;
    const name = text(person.name, 160);
    if (!name) return [];
    return [{
      name,
      professionalTitle: text(person.professionalTitle, 160),
      participationType: text(person.participationType, 40) ?? 'OTHER',
      customRoleLabel: text(person.customRoleLabel, 100),
      portraitUrl: publicPortraitUrl(person.portraitUrl),
    }];
  }) : [];
  return {
    id,
    title,
    activityType: text(raw.activityType, 100) ?? 'Atividade',
    description: text(raw.description, 1200),
    startAt,
    endAt,
    space: spaceName ? { name: spaceName, location: text(space!.location, 240) } : null,
    online: raw.online === true,
    area: text(raw.area, 160),
    participants,
    work: parseWork(raw.work),
  };
}

export function parsePublicProgram(value: unknown): PublicProgram | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const event = raw.event && typeof raw.event === 'object' ? raw.event as Record<string, unknown> : null;
  if (!event || !Array.isArray(raw.activities)) return null;
  return {
    event: {
      slug: text(event.slug, 200) ?? '',
      timeZone: text(event.timeZone, 64),
      format: text(event.format, 20) ?? 'IN_PERSON',
    },
    activities: raw.activities.flatMap((item) => {
      const activity = parseActivity(item);
      return activity ? [activity] : [];
    }),
  };
}

export function publicProgramTimeZone(timeZone: string | null): { zone: string; label: string; confirmed: boolean } {
  const zone = agendaTimeZone(timeZone);
  const confirmed = Boolean(timeZone) && zone === timeZone;
  const name = new Intl.DateTimeFormat('pt-BR', { timeZone: zone, timeZoneName: 'longGeneric' })
    .formatToParts(new Date('2026-01-15T12:00:00Z'))
    .find((part) => part.type === 'timeZoneName')?.value;
  return { zone, label: name && name !== zone ? `${name} (${zone})` : zone, confirmed };
}

export function publicProgramDays(program: PublicProgram): PublicProgramDay[] {
  const { zone } = publicProgramTimeZone(program.event.timeZone);
  const sorted = [...program.activities].sort((a, b) =>
    Date.parse(a.startAt) - Date.parse(b.startAt) || a.title.localeCompare(b.title, 'pt-BR') || a.id.localeCompare(b.id));
  const days = new Map<string, PublicProgramDay>();
  for (const activity of sorted) {
    const key = agendaDay(activity.startAt, zone);
    if (!days.has(key)) days.set(key, { key, label: agendaDateLabel(activity.startAt, zone), activities: [] });
    days.get(key)!.activities.push({
      ...activity,
      startLabel: agendaHour(activity.startAt, zone),
      endLabel: agendaHour(activity.endAt, zone),
      endsOnAnotherDay: agendaDay(activity.endAt, zone) === key ? null : agendaDateLabel(activity.endAt, zone),
      people: activity.participants.map((person) => ({
        name: person.name,
        detail: [agendaRole(person.participationType, person.customRoleLabel), person.professionalTitle].filter(Boolean).join(' · '),
        portraitUrl: person.portraitUrl,
      })),
    });
  }
  return [...days.values()];
}

export function publicProgramWideLayout(themeConfig: unknown): boolean {
  return Boolean(themeConfig && typeof themeConfig === 'object'
    && (themeConfig as Record<string, unknown>).contentWidth === 'WIDE');
}
