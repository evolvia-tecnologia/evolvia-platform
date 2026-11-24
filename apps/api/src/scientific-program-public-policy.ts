import {
  ScientificInvitationStatus,
  ScientificParticipationType,
  ScientificPersonStatus,
  ScientificProgramSpaceKind,
} from '@prisma/client';

const PUBLIC_WORK_STATUSES = new Set(['ACCEPTED', 'ACCEPTED_WITH_CHANGES']);

export type PublicProgramWorkSource = {
  title: string;
  status: string;
  stationPublicCode: number | null;
  authors: Array<{ person: { name: string } }>;
};

export type PublicProgramWork = {
  title: string;
  code: number | null;
  authors: string[];
};

export type PublicProgramActivityRow = {
  id: string;
  title: string;
  activityType: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  space: { name: string; kind: ScientificProgramSpaceKind; location: string | null; active: boolean } | null;
  taxonomyArea: { name: string; active: boolean } | null;
  submission?: PublicProgramWorkSource | null;
  participants: Array<{
    participationType: ScientificParticipationType;
    customRoleLabel: string | null;
    person: {
      name: string;
      status: ScientificPersonStatus;
      guestProfile: {
        displayName: string | null;
        professionalTitle: string | null;
        invitationStatus: ScientificInvitationStatus;
        portraitUrl?: string | null;
      } | null;
    };
  }>;
};

export type PublicProgramParticipant = {
  name: string;
  professionalTitle: string | null;
  participationType: ScientificParticipationType;
  customRoleLabel: string | null;
  portraitUrl: string | null;
};

const PORTRAIT_URL_MAX = 300;

/** https only, no credentials. Empty or unsafe values stay off the public page. */
export function publishedPortraitUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > PORTRAIT_URL_MAX) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (!parsed.hostname) return null;
  return parsed.href;
}

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

/**
 * Only people who confirmed the invitation are shown, using the guest profile
 * they reviewed. E-mail, institution, internal and operational notes never leave.
 */
export function publicProgramParticipants(rows: PublicProgramActivityRow['participants']): PublicProgramParticipant[] {
  return rows.flatMap((row) => {
    const profile = row.person.guestProfile;
    if (row.person.status !== ScientificPersonStatus.ACTIVE) return [];
    if (profile?.invitationStatus !== ScientificInvitationStatus.CONFIRMED) return [];
    const name = profile.displayName?.trim() || row.person.name.trim();
    if (!name) return [];
    return [{
      name,
      professionalTitle: profile.professionalTitle?.trim() || null,
      participationType: row.participationType,
      customRoleLabel: row.participationType === ScientificParticipationType.OTHER
        ? row.customRoleLabel?.trim() || null
        : null,
      portraitUrl: publishedPortraitUrl(profile.portraitUrl),
    }];
  });
}

/** Accepted work shown on a published session. E-mail, institution and files stay out. */
export function presentPublicProgramWork(submission: PublicProgramWorkSource | null | undefined): PublicProgramWork | null {
  if (!submission || !PUBLIC_WORK_STATUSES.has(submission.status)) return null;
  const title = submission.title.trim();
  if (!title) return null;
  const code = Number.isInteger(submission.stationPublicCode) && (submission.stationPublicCode ?? 0) > 0
    ? submission.stationPublicCode
    : null;
  return {
    title,
    code,
    authors: submission.authors.flatMap((author) => {
      const name = author.person.name.trim();
      return name ? [name] : [];
    }),
  };
}

export function presentPublicProgramActivity(row: PublicProgramActivityRow): PublicProgramActivity {
  const space = row.space?.active ? row.space : null;
  return {
    id: row.id,
    title: row.title,
    activityType: row.activityType,
    description: row.description?.trim() || null,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    space: space ? { name: space.name, location: space.location?.trim() || null } : null,
    online: space?.kind === ScientificProgramSpaceKind.VIRTUAL,
    area: row.taxonomyArea?.active ? row.taxonomyArea.name : null,
    participants: publicProgramParticipants(row.participants),
    work: presentPublicProgramWork(row.submission),
  };
}
