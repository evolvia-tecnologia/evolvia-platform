import { OperatorPermission } from '@prisma/client';

// A capacidade vem da configuração do evento, não do perfil recomendado pelo assistente.
export function operationalCapability(permission: OperatorPermission): string {
  switch (permission) {
    case OperatorPermission.CHECK_IN:
      return 'access_control';
    case OperatorPermission.ACCREDITATION:
    case OperatorPermission.BADGE_PRINT:
    case OperatorPermission.KIOSK_OPERATE:
    case OperatorPermission.KIOSK_CONFIGURE:
      return 'credential';
    case OperatorPermission.REGISTRATION_CREATE:
      return 'registration';
  }
}

export function enabledOperationalPermissions(
  permissions: readonly OperatorPermission[],
  activeCapabilities: readonly string[],
): OperatorPermission[] {
  const active = new Set(activeCapabilities);
  return permissions.filter((permission) =>
    (permission === OperatorPermission.CHECK_IN || permission === OperatorPermission.ACCREDITATION)
      && active.has(operationalCapability(permission)));
}
