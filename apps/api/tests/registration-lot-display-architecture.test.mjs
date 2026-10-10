import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('a escolha fica na capacidade do evento e a auditoria não leva preço nem nome', async () => {
  const [service, controller, module] = await Promise.all([
    read('../src/registration-lot-display.service.ts'),
    read('../src/registration-lot-display.controller.ts'),
    read('../src/app.module.ts'),
  ]);
  assert.match(service, /organizationId: event\.organizationId/u);
  assert.match(service, /EVENT_EDITOR_ROLES/u);
  assert.match(service, /registration\.lot_display_configured/u);
  const audit = service.slice(
    service.indexOf("action: 'registration.lot_display_configured'"),
    service.indexOf('private async modeFor'),
  );
  assert.doesNotMatch(audit, /url|email|priceCents|name|registrationData/u);
  assert.doesNotMatch(controller, /organizationId/u);
  assert.match(module, /RegistrationLotDisplayController/u);
  assert.match(module, /RegistrationLotDisplayService/u);
});

test('a reserva do lote atual usa o mesmo evento e a escada não vende lote futuro', async () => {
  const service = await read('../src/registration-reservations.service.ts');
  assert.match(service, /A organização está mostrando só o lote atual\./u);
  assert.match(service, /!options\?\.waitlistUserId && await this\.lotDisplayMode\(tx, event\.id\) === 'CURRENT'/u);
  assert.match(service, /organizationId: event\.organizationId/u);
  assert.match(service, /selectDisplayedLots\(mode, category\.lots, now\)/u);
  const purchasable = service.slice(service.indexOf('const lots = shownOpen.flatMap'), service.indexOf('return { ...category, lots }'));
  assert.doesNotMatch(purchasable, /upcoming/u);
  assert.match(service, /state: 'UPCOMING'/u);
  const response = service.slice(service.indexOf('private toPublicReservation'));
  assert.doesNotMatch(response, /registrationData|organizationId/u);
});
