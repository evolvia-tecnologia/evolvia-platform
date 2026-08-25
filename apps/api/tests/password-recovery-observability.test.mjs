import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PasswordRecoveryOperationalDiagnostics,
  PrismaPasswordRecoveryAudit,
} from '../dist/auth/password-recovery-observability.js';

function createAuditHarness() {
  const calls = [];
  const prisma = {
    passwordRecoveryAuditEvent: {
      async create(input) {
        calls.push(input);
        return { id: 'audit_1' };
      },
    },
  };
  return { audit: new PrismaPasswordRecoveryAudit(prisma), calls };
}

test('persiste resultado e identificador interno sem dado sensível ou escopo inventado', async () => {
  const { audit, calls } = createAuditHarness();

  await audit.record({
    action: 'password_recovery.request',
    outcome: 'DELIVERED',
    subjectUserId: 'usr_1',
  });

  assert.deepEqual(calls, [{
    data: {
      action: 'password_recovery.request',
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

test('audita solicitação ignorada sem presumir identidade', async () => {
  const { audit, calls } = createAuditHarness();

  await audit.record({
    action: 'password_recovery.request',
    outcome: 'IGNORED',
  });

  assert.equal(calls[0].data.subjectUserId, null);
});

test('diagnóstico operacional emite somente evento e estágio permitidos', async () => {
  const warnings = [];
  const diagnostics = new PasswordRecoveryOperationalDiagnostics({
    warn(message) {
      warnings.push(message);
    },
  });

  await diagnostics.capture({
    operation: 'password_recovery.request',
    stage: 'DELIVERY',
  });

  assert.deepEqual(warnings, [{
    event: 'password_recovery.operation_failed',
    stage: 'DELIVERY',
  }]);
  assert.equal(JSON.stringify(warnings).includes('usr_1'), false);
});

test('migration é expansiva, restringe a ação e preserva auditoria após exclusão da conta', async () => {
  const sql = await readFile(
    new URL(
      '../prisma/migrations/20260817194500_password_recovery_audit/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(sql, /CREATE TABLE "PasswordRecoveryAuditEvent"/u);
  assert.match(sql, /CHECK \("action" = 'password_recovery\.request'\)/u);
  assert.match(sql, /ON DELETE SET NULL/u);
  assert.doesNotMatch(sql, /"email"|"tokenHash"|"organizationId"|"eventId"|"originKey"/u);
});
