import { createHash } from 'node:crypto';
import { RegistrationReservationStatus } from '@prisma/client';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function registrationEmailHash(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL.test(email)) return null;
  return sha256(email);
}

export function registrationDocumentHash(value: string): string | null {
  const document = value.replace(/[ .\-/]/gu, '').toUpperCase();
  if (document.length < 5 || document.length > 40 || !/^[A-Z0-9]+$/u.test(document)) return null;
  return sha256(document);
}

export function effectiveRegistrationStatus(
  status: RegistrationReservationStatus,
  expiresAt: Date | null,
  now: Date,
): RegistrationReservationStatus {
  return status === RegistrationReservationStatus.PENDING_PAYMENT && expiresAt !== null && expiresAt <= now
    ? RegistrationReservationStatus.EXPIRED : status;
}
