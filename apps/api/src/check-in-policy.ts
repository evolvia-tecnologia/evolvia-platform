import { createHmac, timingSafeEqual } from 'node:crypto';

const RESERVATION_ID = /^[a-z0-9]{10,40}$/u;
const QR_CODE = /^EVQ1\.([a-z0-9]{10,40})\.([a-f0-9]{64})$/u;
const BARCODE = /^EVB1\.([a-z0-9]{10,40})\.([a-f0-9]{16})$/u;

function signature(eventId: string, reservationId: string, secret: string): string {
  if (secret.length < 32) throw new Error('Configuração da credencial indisponível.');
  return createHmac('sha256', secret)
    .update('evolvia:checkin:v1\0').update(eventId).update('\0').update(reservationId)
    .digest('hex');
}

export function issueCheckInCode(eventId: string, reservationId: string, secret: string): string {
  if (!RESERVATION_ID.test(reservationId) || !eventId) throw new Error('Reserva inválida.');
  return `EVQ1.${reservationId}.${signature(eventId, reservationId, secret)}`;
}

export function verifyCheckInCode(eventId: string, code: unknown, secret: string): string | null {
  if (typeof code !== 'string' || code.length > 120 || !eventId) return null;
  const normalized = code.trim().toLowerCase().replace(/^evq1\./u, 'EVQ1.');
  const match = QR_CODE.exec(normalized);
  if (!match) return null;
  const expected = Buffer.from(signature(eventId, match[1], secret), 'hex');
  const actual = Buffer.from(match[2], 'hex');
  return timingSafeEqual(expected, actual) ? match[1] : null;
}

export function issueBarcodeValue(eventId: string, reservationId: string, secret: string): string {
  if (!RESERVATION_ID.test(reservationId) || !eventId) throw new Error('Reserva inválida.');
  return `EVB1.${reservationId}.${signature(eventId, reservationId, secret).slice(0, 16)}`;
}

export function verifyBarcodeValue(eventId: string, code: unknown, secret: string): string | null {
  if (typeof code !== 'string' || code.length > 80 || !eventId) return null;
  const match = BARCODE.exec(code.trim().toLowerCase().replace(/^evb1\./u, 'EVB1.'));
  if (!match) return null;
  const expected = Buffer.from(signature(eventId, match[1], secret).slice(0, 16));
  const actual = Buffer.from(match[2]);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? match[1] : null;
}

export function verifyCredentialScan(eventId: string, code: unknown, secret: string): string | null {
  return verifyCheckInCode(eventId, code, secret) ?? verifyBarcodeValue(eventId, code, secret);
}
