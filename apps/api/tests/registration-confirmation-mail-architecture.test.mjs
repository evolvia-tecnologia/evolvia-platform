import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('a confirmação por e-mail fica no evento e a auditoria não leva a ficha', async () => {
  const [service, foundation] = await Promise.all([
    read('../src/registration-confirmation-mail.service.ts'),
    read('../src/integration-foundation.service.ts'),
  ]);
  assert.match(service, /organizationId: scope\.organizationId/u);
  assert.match(service, /eventId: scope\.eventId/u);
  assert.match(service, /RegistrationReservationStatus\.CONFIRMED/u);
  assert.doesNotMatch(service, /emailHash|billingSnapshot|identityHash/u);
  const record = service.slice(service.indexOf('private async record'));
  const metadata = record.slice(record.indexOf('metadata:'), record.indexOf('} as Prisma.InputJsonObject'));
  assert.match(metadata, /delivered/u);
  assert.match(metadata, /reason/u);
  assert.doesNotMatch(metadata, /recipient|registrationData|protocol|token|url/u);
  assert.match(foundation, /confirmationMail\?\.sendConfirmed\(notice\)/u);
  assert.doesNotMatch(foundation, /registrationData|billingSnapshot|emailHash/u);
});
