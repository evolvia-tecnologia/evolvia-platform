import type { NestExpressApplication } from '@nestjs/platform-express';

const MAX_EVENT_MEDIA_BYTES = 5 * 1024 * 1024;
const BASE64_CHARACTERS_FOR_MAX_MEDIA = Math.ceil(MAX_EVENT_MEDIA_BYTES / 3) * 4;
const MEDIA_JSON_ENVELOPE_BYTES = 4 * 1024;

/**
 * A mídia é enviada em JSON/Base64 neste Gate. Cinco MiB binários ocupam cerca
 * de 6,67 MiB no transporte; a folga cobre os demais campos e a serialização.
 * A policy de mídia continua sendo a autoridade para o limite binário de 5 MiB.
 */
export const JSON_BODY_LIMIT_BYTES = BASE64_CHARACTERS_FOR_MAX_MEDIA + MEDIA_JSON_ENVELOPE_BYTES;
export const URLENCODED_BODY_LIMIT_BYTES = 100 * 1024;

export function configureHttpBodyParsers(
  app: Pick<NestExpressApplication, 'useBodyParser'>,
): void {
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT_BYTES });
  app.useBodyParser('urlencoded', {
    extended: true,
    limit: URLENCODED_BODY_LIMIT_BYTES,
  });
}
