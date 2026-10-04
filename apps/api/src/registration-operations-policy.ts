import { RegistrationReservationStatus } from '@prisma/client';

export type RegistrationPresenceFilter = 'ALL' | 'VALIDATED' | 'PENDING';

export function normalizeRegistrationPresence(value: unknown): RegistrationPresenceFilter {
  if (value === undefined || value === null || value === '' || value === 'ALL') return 'ALL';
  if (value === 'VALIDATED' || value === 'PENDING') return value;
  throw new Error('Validação inválida.');
}

export function effectiveRegistrationStatus(
  status: RegistrationReservationStatus,
  expiresAt: Date | null,
  now: Date,
): RegistrationReservationStatus {
  return status === RegistrationReservationStatus.PENDING_PAYMENT && expiresAt !== null && expiresAt <= now
    ? RegistrationReservationStatus.EXPIRED : status;
}
