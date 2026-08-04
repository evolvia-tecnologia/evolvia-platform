import { MembershipRole } from '@prisma/client';

export const EVENT_EDITOR_ROLES: readonly MembershipRole[] = [
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.MANAGER,
];

export function canManageMembers(role: MembershipRole): boolean {
  return role === MembershipRole.OWNER || role === MembershipRole.ADMIN;
}

export function canAssignRole(
  actorRole: MembershipRole,
  currentTargetRole: MembershipRole | null,
  requestedRole: MembershipRole,
): boolean {
  if (!canManageMembers(actorRole)) return false;
  if (actorRole === MembershipRole.OWNER) return true;
  return currentTargetRole !== MembershipRole.OWNER && requestedRole !== MembershipRole.OWNER;
}

export function requiresAnotherOwner(
  currentRole: MembershipRole,
  requestedRole: MembershipRole | null,
): boolean {
  return currentRole === MembershipRole.OWNER && requestedRole !== MembershipRole.OWNER;
}
