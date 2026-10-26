import assert from 'node:assert/strict';
import test from 'node:test';
import { AsaasCheckoutGateway } from '../dist/asaas-checkout.gateway.js';
import { EventIntegrationsService } from '../dist/event-integrations.controller.js';

test('diagnóstico separa configuração, simulação e produção bloqueada sem contato externo nem segredos', () => {
  const before = { ...process.env };
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error('O diagnóstico não pode enviar requisições.'); };
  const base = { NODE_ENV: 'test', ASAAS_ENVIRONMENT: 'sandbox', ASAAS_MODE: '', EVOLVIA_CI_MODE: '',
    ASAAS_ALLOW_PRODUCTION: '', ASAAS_API_KEY: 'private-test-api-key-123456789',
    ASAAS_WEBHOOK_TOKEN: 'private-test-webhook-token-123456789', EVOLVIA_PUBLIC_BASE_URL: 'https://evento.example' };
  try {
    for (const [overrides, state, environment] of [
      [{}, 'CONFIGURED', 'sandbox'],
      [{ ASAAS_API_KEY: '' }, 'NOT_CONFIGURED', 'sandbox'],
      [{ ASAAS_WEBHOOK_TOKEN: '' }, 'NOT_CONFIGURED', 'sandbox'],
      [{ EVOLVIA_PUBLIC_BASE_URL: 'http://unsafe.example' }, 'NOT_CONFIGURED', 'sandbox'],
      [{ ASAAS_ENVIRONMENT: 'production' }, 'BLOCKED', 'production'],
      [{ ASAAS_ENVIRONMENT: 'production', ASAAS_ALLOW_PRODUCTION: 'true' }, 'BLOCKED', 'production'],
      [{ NODE_ENV: 'production', ASAAS_ENVIRONMENT: 'production', ASAAS_ALLOW_PRODUCTION: 'true' }, 'CONFIGURED', 'production'],
      [{ ASAAS_MODE: 'ci_stub', EVOLVIA_CI_MODE: '1' }, 'SIMULATED', 'local'],
      [{ NODE_ENV: 'production', ASAAS_MODE: 'ci_stub', EVOLVIA_CI_MODE: '1' }, 'SIMULATED', 'local'],
      [{ NODE_ENV: 'production', ASAAS_MODE: 'ci_stub', EVOLVIA_CI_MODE: '1', ASAAS_WEBHOOK_TOKEN: '' }, 'NOT_CONFIGURED', 'local'],
      [{ NODE_ENV: 'production', ASAAS_MODE: 'ci_stub', EVOLVIA_CI_MODE: '1', ASAAS_WEBHOOK_TOKEN: 'invalid' }, 'NOT_CONFIGURED', 'local'],
      [{ NODE_ENV: 'production', ASAAS_MODE: 'ci_stub', EVOLVIA_CI_MODE: '1', ASAAS_WEBHOOK_TOKEN: 'evolvia-ci-stub-webhook-token-local' }, 'NOT_CONFIGURED', 'local'],
    ]) {
      Object.assign(process.env, base, overrides);
      const result = new AsaasCheckoutGateway().configurationStatus();
      assert.equal(result.state, state);
      assert.equal(result.environment, environment);
      assert.deepEqual(Object.keys(result).sort(), ['environment', 'message', 'state']);
      assert.doesNotMatch(JSON.stringify(result), /private-test|evento\.example/);
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key];
    Object.assign(process.env, before);
  }
});

test('catálogo consulta diagnóstico somente após autorizar a organização do evento', async () => {
  const order = [];
  const status = { state: 'NOT_CONFIGURED', environment: 'sandbox', message: 'Configuração incompleta.' };
  let allowed = false;
  const service = new EventIntegrationsService({ event: { findUnique: async ({ where }) =>
    where.id === 'A' ? { id: 'A', organizationId: 'org-A', name: 'Evento A' } : null } }, {
    requireRole: async (user, organization) => {
      order.push([user, organization]);
      if (!allowed) throw new Error('Sem acesso');
    },
  }, { configurationStatus: () => { order.push('diagnostic'); return status; } });
  await assert.rejects(service.list('other-org-user', 'A'), /Sem acesso/);
  assert.deepEqual(order, [['other-org-user', 'org-A']]);
  order.length = 0;
  await assert.rejects(service.list('user-A', 'missing'));
  assert.deepEqual(order, []);
  allowed = true;
  const result = await service.list('user-A', 'A');
  assert.deepEqual(order, [['user-A', 'org-A'], 'diagnostic']);
  assert.deepEqual(result.asaas, status);
  assert.equal(result.event.id, 'A');
});
