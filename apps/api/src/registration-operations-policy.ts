import { RegistrationReservationStatus } from '@prisma/client';

export function effectiveRegistrationStatus(
  status: RegistrationReservationStatus,
  expiresAt: Date | null,
  now: Date,
): RegistrationReservationStatus {
  return status === RegistrationReservationStatus.PENDING_PAYMENT && expiresAt !== null && expiresAt <= now
    ? RegistrationReservationStatus.EXPIRED : status;
}
