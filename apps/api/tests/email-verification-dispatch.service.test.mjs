import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  EmailVerificationDispatchService,
  EmailVerificationDispatchUnavailableError,
  EmailVerificationOperationalDiagnostics,
  PrismaEmailVerificationDispatchAudit,
} from '../dist/auth/email-verification-dispatch.service.js';

function createHarness({ issueError, deliveryError, revokeError, auditError } = {}) {
  const issued = {
    tokenId: 'verify_1',
    recipient: 'canonical@example.com',
    token: 'secret-token',
    expiresAt: new Date('2026-08-20T20:00:00.000Z'),
  };
  const state = { deliveries: [], revocations: [], audits: [], diagnostics: [] };
  const service = new EmailVerificationDispatchService({
    verification: {
      async issue() {
        if (issueError) throw issueError;
        return issued;
      },
      async revokeIssuedToken(tokenId) {
        state.revocations.push(tokenId);
        if (revokeError) throw revokeError;
      },
    },
    delivery: {
      async send(input) {
        state.deliveries.push(input);
        if (deliveryError) throw deliveryError;
      },
    },
    audit: {
      async record(input) {
        state.audits.push(input);
        if (auditError) throw auditError;
      },
    },
    diagnostics: {
      async capture(input) {
        state.diagnostics.push(input);
      },
    },
  });
  return { service, state, issued };
}

function createPersistentAuditHarness() {
  const calls = [];
  const prisma = {
    passwordRecoveryAuditEvent: {
      async create(input) {
        calls.push(input);
        return { id: 'audit_email_1' };
      },
    },
  };
  return { audit: new PrismaEmailVerificationDispatchAudit(prisma), calls };
}

test('entrega somente ao destinatário canônico retornado pela emissão', async () => {
  const { service, state, issued } = createHarness();

  await service.send('usr_1');

  assert.deepEqual(state.deliveries, [{
    recipient: issued.recipient,
    token: issued.token,
    expiresAt: issued.expiresAt,
  }]);
  assert.deepEqual(state.audits, [{
    action: 'email_verification.request',
    outcome: 'DELIVERED',
    subjectUserId: 'usr_1',
  }]);
});

test('falha de entrega revoga token emitido e não vaza a causa', async () => {
  const { service, state } = createHarness({ deliveryError: new Error('SMTP 550 secret-token') });

  await assert.rejects(service.send('usr_1'), EmailVerificationDispatchUnavailableError);

  assert.deepEqual(state.revocations, ['verify_1']);
  assert.deepEqual(state.diagnostics, [{
    operation: 'email_verification.request',
    stage: 'DELIVERY',
  }]);
  assert.equal(JSON.stringify(state.audits).includes('secret-token'), false);
  assert.equal(JSON.stringify(state.diagnostics).includes('SMTP'), false);
});

test('falha de persistência não tenta entrega e recebe resultado público único', async () => {
  const { service, state } = createHarness({ issueError: new Error('database offline') });

  await assert.rejects(service.send('usr_1'), EmailVerificationDispatchUnavailableError);

  assert.deepEqual(state.deliveries, []);
  assert.deepEqual(state.revocations, []);
  assert.equal(state.audits[0].outcome, 'PERSISTENCE_FAILED');
  assert.equal(state.diagnostics[0].stage, 'PERSISTENCE');
});

test('falha da revogação é diagnosticada sem substituir o erro público', async () => {
  const { service, state } = createHarness({
    deliveryError: new Error('delivery'),
    revokeError: new Error('revoke'),
  });

  await assert.rejects(service.send('usr_1'), EmailVerificationDispatchUnavailableError);
  assert.deepEqual(state.diagnostics.map((item) => item.stage), ['DELIVERY', 'REVOCATION']);
});

test('falha de auditoria não transforma entrega concluída em falha ao usuário', async () => {
  const { service, state } = createHarness({ auditError: new Error('audit offline') });

  await service.send('usr_1');

  assert.deepEqual(state.diagnostics, [{
    operation: 'email_verification.request',
    stage: 'AUDIT',
  }]);
});

test('diagnóstico operacional registra apenas evento e estágio permitidos', async () => {
  const warnings = [];
  const diagnostics = new EmailVerificationOperationalDiagnostics({
    warn(message) {
      warnings.push(message);
    },
  });

  await diagnostics.capture({ operation: 'email_verification.request', stage: 'DELIVERY' });

  assert.deepEqual(warnings, [{
    event: 'email_verification.operation_failed',
    stage: 'DELIVERY',
  }]);
});

test('auditoria persistente registra somente ação, resultado e usuário interno', async () => {
  const { audit, calls } = createPersistentAuditHarness();

  await audit.record({
    action: 'email_verification.request',
    outcome: 'DELIVERED',
    subjectUserId: 'usr_1',
  });

  assert.deepEqual(calls, [{
    data: {
      action: 'email_verification.request',
      outcome: 'DELIVERED',
      subjectUserId: 'usr_1',
    },
    select: { id: true },
  }]);
  const serialized = JSON.stringify(calls);
  for (const forbidden of ['email', 'token', 'hash', 'organizationId', 'eventId', 'origin']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('migration apenas expande ações auditáveis e não cria campo sensível', async () => {
  const sql = await readFile(
    new URL(
      '../prisma/migrations/20260824180000_email_verification_audit/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(sql, /'email_verification\.request'/u);
  assert.match(sql, /'password_recovery\.request'/u);
  assert.match(sql, /'password_recovery\.reset'/u);
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|"email"|"token"|"hash"/u);
});
