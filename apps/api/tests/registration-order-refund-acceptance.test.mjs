import assert from 'node:assert/strict';
import test from 'node:test';
import { requirePersistedGroupRefundConsent } from '../dist/registration-order-refund-acceptance.js';

const scope = { orderId: 'order-qa', eventId: 'event-qa', organizationId: 'tenant-qa' };

function prisma({ ready = true, total = 2, accepted = 2 } = {}) {
  const queries = [];
  return {
    queries,
    $queryRaw: async (strings, ...params) => {
      const sql = strings.join('?');
      queries.push({ sql, params });
      if (sql.includes('to_regclass')) return [{ ready }];
      assert.match(sql, /RegistrationRefundAcceptance/u);
      assert.match(sql, /COUNT\(\*\) FILTER/u);
      assert.match(sql, /p\."version" = a\."version"/u);
      assert.match(sql, /refund_policy_acceptance/u);
      assert.match(sql, /refund_policy_version/u);
      assert.deepEqual(params, [scope.orderId, scope.eventId, scope.organizationId]);
      return [{ total, accepted }];
    },
  };
}

test('G2.11: cobranca so e liberada com dois aceites persistidos e versionados', async () => {
  const db = prisma();
  await requirePersistedGroupRefundConsent(db, scope);
  assert.equal(db.queries.length, 2);
});

for (const [name, scenario] of [
  ['tabela de aceites ausente', { ready: false }],
  ['um de dois aceites ausente', { total: 2, accepted: 1 }],
  ['tres entradas com apenas dois aceites', { total: 3, accepted: 2 }],
  ['pedido sem linhas', { total: 0, accepted: 0 }],
  ['mais de dez participantes', { total: 11, accepted: 11 }],
]) {
  test('G2.11: bloqueia ' + name + ' antes do Asaas', async () => {
    const db = prisma(scenario);
    await assert.rejects(() => requirePersistedGroupRefundConsent(db, scope),
      (error) => error.getStatus?.() === 409);
    assert.equal(db.queries.length, scenario.ready === false ? 1 : 2);
  });
}
