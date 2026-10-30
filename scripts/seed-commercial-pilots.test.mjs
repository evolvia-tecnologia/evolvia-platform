import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSynthetic, validateTarget, seedPilots } from './seed-commercial-pilots.mjs';

const env = {
  EVOLVIA_API_URL: 'https://homolog.example.test/api',
  EVOLVIA_PILOT_ALLOWED_HOST: 'homolog.example.test',
  EVOLVIA_PILOT_TARGET: 'HOMOLOGATION',
  EVOLVIA_PILOT_ORGANIZATION_ID: 'orgtest12345',
};
const executionEnv = {
  ...env,
  EVOLVIA_API_URL: 'https://homologacao.evolviatecnologia.com/api',
  EVOLVIA_PILOT_ALLOWED_HOST: 'homologacao.evolviatecnologia.com',
};

test('rejeita produção, HTTP e host não autorizado', () => {
  assert.equal(validateTarget(env), 'https://homolog.example.test/api');
  assert.throws(() => validateTarget({
    ...env, EVOLVIA_API_URL: 'http://homolog.example.test/api',
  }), /TLS/);
  assert.throws(() => validateTarget({
    ...env, EVOLVIA_API_URL: 'https://production.example.test/api',
  }), /allowlist/);
  assert.throws(() => validateTarget({
    ...env, EVOLVIA_PILOT_ALLOWED_HOST: 'production.example.test',
    EVOLVIA_API_URL: 'https://production.example.test/api',
  }), /homologação/);
  assert.throws(() => validateTarget({
    ...env, EVOLVIA_PILOT_TARGET: 'PRODUCTION',
  }), /HOMOLOGATION/);
  assert.throws(() => validateTarget({
    ...executionEnv, EVOLVIA_PILOT_EXECUTE: 'YES',
  }), /Token/);
});

test('execução só permite origem oficial HTTPS:443 e /api', () => {
  const active = { ...executionEnv, EVOLVIA_PILOT_EXECUTE: 'YES',
    EVOLVIA_PILOT_TOKEN: 'token-sintetico' };
  assert.equal(validateTarget(active), 'https://homologacao.evolviatecnologia.com/api');
  assert.throws(() => validateTarget({ ...active,
    EVOLVIA_API_URL: 'https://homologacao.evolviatecnologia.com:8443/api',
  }), /host oficial/);
  assert.throws(() => validateTarget({ ...active,
    EVOLVIA_API_URL: 'https://homologacao.evolviatecnologia.com/',
  }), /Execução exige a base/);
  assert.throws(() => validateTarget({ ...active,
    EVOLVIA_API_URL: 'https://homologacao.evolviatecnologia.com.attacker.example/api',
    EVOLVIA_PILOT_ALLOWED_HOST: 'homologacao.evolviatecnologia.com.attacker.example',
  }), /host oficial/);
  assert.throws(() => validateTarget({ ...active,
    EVOLVIA_API_URL: 'https://homologacao-outro.example.test/api',
    EVOLVIA_PILOT_ALLOWED_HOST: 'homologacao-outro.example.test',
  }), /host oficial/);
});

test('fixtures têm quantidades, dados sintéticos e cotas corretas', () => {
  const data = buildSynthetic('20261030');
  assert.equal(data.participants.length, 30);
  assert.equal(data.speakers.length, 5);
  assert.equal(data.staff.length, 3);
  assert.equal(data.operators.length, 2);
  assert.equal(data.exhibitors.length, 8);
  assert.equal(data.exhibitors.filter((c) => c.kind === 'PROVIDER').length, 2);
  assert.ok(data.exhibitors.every((c) => c.loginEmail.endsWith('@evolvia-ci.invalid')));
  assert.ok(data.exhibitors.filter((c) => c.kind === 'PROVIDER')
    .every((c) => c.quotaExhibitor === 0));
  assert.equal(new Set(data.exhibitors.map((c) => c.document)).size, 8);
});

test('dry-run não acessa rede, não cria IDs e não simula impressão', async () => {
  const result = await seedPilots(env);
  assert.equal(result.mode, 'DRY_RUN');
  assert.deepEqual(result.created, []);
  assert.ok(result.notExecuted.includes('impressão física/PDF'));
  assert.ok(result.notExecuted.includes('login externo'));
});


test('falha após criar wizard registra ID persistido sem fingir piloto completo', async (t) => {
  const checkpoints = [];
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json' },
  });
  t.mock.method(globalThis, 'fetch', async (url) => {
    const path = new URL(url).pathname;
    if (path === '/api/health/ready') return json({ status: 'ready', dependencies: { database: 'ok' } });
    if (path === '/api/events') return json([]);
    if (path === '/api/event-wizard/start') return json({
      event: { id: 'event-test-partial-001', profileCode: 'CORPORATE_TRAINING', organizationId: env.EVOLVIA_PILOT_ORGANIZATION_ID },
      session: { revision: 0 }, answers: {},
    }, 201);
    if (path === '/api/event-wizard/event-test-partial-001/complete') {
      return json({ message: 'Falha sintética' }, 500);
    }
    throw new Error('Endpoint não previsto no teste: ' + path);
  });
  await assert.rejects(
    seedPilots({ ...executionEnv, EVOLVIA_PILOT_EXECUTE: 'YES', EVOLVIA_PILOT_TOKEN: 'token-sintetico' },
      (checkpoint) => checkpoints.push(checkpoint)),
    /HTTP 500/,
  );
  assert.deepEqual(checkpoints, [{
    phase: 'wizard_started', id: 'event-test-partial-001',
    name: 'Summit Evolvia Corporativo 2026', profile: 'CORPORATE_TRAINING',
  }]);
  assert.ok(!checkpoints.some((checkpoint) => checkpoint.phase === 'seed_verified'));
});


test('bloqueia resposta 201 de outro tenant antes de configurar inscrições', async (t) => {
  const calls = [];
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json' },
  });
  t.mock.method(globalThis, 'fetch', async (url) => {
    const path = new URL(url).pathname;
    calls.push(path);
    if (path === '/api/health/ready') return json({ status: 'ready', dependencies: { database: 'ok' } });
    if (path === '/api/events') return json([]);
    if (path === '/api/event-wizard/start') return json({
      event: { id: 'event-wrong-tenant', profileCode: 'CORPORATE_TRAINING', organizationId: 'another-tenant' },
      session: { revision: 0 }, answers: {},
    }, 201);
    throw new Error('Mutação indevida após tenant divergente: ' + path);
  });
  await assert.rejects(
    seedPilots({ ...executionEnv, EVOLVIA_PILOT_EXECUTE: 'YES', EVOLVIA_PILOT_TOKEN: 'token-sintetico' }),
    /organização divergente/,
  );
  assert.deepEqual(calls, ['/api/health/ready', '/api/events', '/api/event-wizard/start']);
});

test('bloqueia listagem com evento de outro tenant antes de qualquer POST', async (t) => {
  const calls = [];
  const json = (data, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json' },
  });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ path, method: options?.method ?? 'GET' });
    if (path === '/api/health/ready') {
      return json({ status: 'ready', dependencies: { database: 'ok' } });
    }
    if (path === '/api/events') {
      return json([{ id: 'foreign-event', organizationId: 'another-tenant',
        name: 'Evento de outra organização' }]);
    }
    throw new Error('Mutação ou leitura indevida após listagem divergente: ' + path);
  });
  await assert.rejects(
    seedPilots({ ...executionEnv, EVOLVIA_PILOT_EXECUTE: 'YES', EVOLVIA_PILOT_TOKEN: 'token-sintetico' }),
    /Listagem retornou evento fora da organização solicitada/,
  );
  assert.deepEqual(calls, [
    { path: '/api/health/ready', method: 'GET' },
    { path: '/api/events', method: 'GET' },
  ]);
});
