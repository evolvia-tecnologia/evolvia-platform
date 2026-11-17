import { issueBarcodeValue, issueCheckInCode } from './check-in-policy';
import { labelText, type LabelConfig } from './event-desk-policy';

export function printedCredential(
  eventName: string,
  data: unknown,
  categoryName: string,
  protocol: string,
  eventId: string,
  reservationId: string,
  secret: string,
  config: LabelConfig,
) {
  return {
    eventName,
    ...labelText(data, categoryName, config),
    protocol,
    widthMm: config.widthMm,
    heightMm: config.heightMm,
    codeMode: config.codeMode,
    qr: config.codeMode === 'BARCODE' ? null : issueCheckInCode(eventId, reservationId, secret),
    barcode: config.codeMode === 'QR' ? null : issueBarcodeValue(eventId, reservationId, secret),
  };
}
