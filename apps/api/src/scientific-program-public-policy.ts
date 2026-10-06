import {
  ScientificInvitationStatus,
  ScientificParticipationType,
  ScientificPersonStatus,
  ScientificProgramSpaceKind,
} from '@prisma/client';

export type PublicProgramActivityRow = {
  id: string;
  title: string;
  activityType: string;
  description: string | null;
  startAt: Date;
  endAt: Date;
  space: { name: string; kind: ScientificProgramSpaceKind; location: string | null; active: boolean } | null;
  taxonomyArea: { name: string; active: boolean } | null;
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
      } | null;
    };
  }>;
};

export type PublicProgramParticipant = {
  name: string;
  professionalTitle: string | null;
  participationType: ScientificParticipationType;
  customRoleLabel: string | null;
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
    }];
  });
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
  };
}
