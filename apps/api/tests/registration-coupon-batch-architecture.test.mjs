import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('o lote nasce no evento pago e a auditoria não guarda o código', async () => {
  const [service, controller, module] = await Promise.all([
    read('../src/registration-coupon-batch.service.ts'),
    read('../src/registration-coupon-batch.controller.ts'),
    read('../src/app.module.ts'),
  ]);
  assert.match(service, /organizationId: event\.organizationId/u);
  assert.match(service, /EVENT_EDITOR_ROLES/u);
  assert.match(service, /RegistrationMode\.PAID/u);
  assert.match(service, /registration\.coupon_batch_created/u);
  const audit = service.slice(
    service.indexOf("action: 'registration.coupon_batch_created'"),
    service.indexOf('} as Prisma.InputJsonObject'),
  );
  assert.doesNotMatch(audit, /code|email|sponsor|url|registrationData/u);
  assert.doesNotMatch(controller, /organizationId/u);
  assert.match(module, /RegistrationCouponBatchController/u);
  assert.match(module, /RegistrationCouponBatchService/u);
});
