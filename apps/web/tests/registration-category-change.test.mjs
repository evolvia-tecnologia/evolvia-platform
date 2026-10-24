import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('inscrição paga oferece troca só com o mesmo valor e explica o bloqueio', async () => {
  const [component, css, service] = await Promise.all([
    read('../components/registration-operations.tsx'),
    read('../components/registration-operations.module.css'),
    read('../../api/src/registration-operations.service.ts'),
  ]);
  assert.match(component, /Trocar categoria/u);
  assert.match(component, /Confirmar troca/u);
  assert.match(component, /paymentStatus === 'PAID'/u);
  assert.match(component, /não vira cortesia nem desconto/u);
  assert.match(component, /Categoria atualizada\. O valor pago permanece o mesmo\./u);
  assert.match(component, /registration-operations\/\$\{encodeURIComponent\(itemProtocol\)\}\/category/u);
  assert.match(component, /colSpan=\{7\}/u);
  assert.match(css, /\.changeForm select/u);
  assert.match(css, /min-height: 44px/u);
  const change = service.slice(service.indexOf('async changeCategory'), service.indexOf('private async eventFor'));
  const update = change.slice(change.indexOf('eventRegistrationReservation.update'), change.indexOf('auditLog.create'));
  assert.match(change, /registration\.category_changed/u);
  assert.match(change, /TransactionIsolationLevel\.Serializable/u);
  assert.match(component, /Não há outras categorias ou lotes ativos com o mesmo valor pago/u);
  assert.match(update, /categoryId: patch\.categoryId/u);
  assert.doesNotMatch(update, /finalPriceCents|discountPercent|basePriceCents|amountCents/u);
});
