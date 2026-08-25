import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  EmailVerificationConfirmationOperationalDiagnostics,
  EmailVerificationConfirmationService,
  PrismaEmailVerificationConfirmationAudit,
} from '../dist/auth/email-verification-confirmation.service.js';
import {
  EmailVerificationRejectedError,
  EmailVerificationUnavailableError,
} from '../dist/auth/email-verification.service.js';

function createHarness({ verificationError, auditError, diagnosticsError } = {}) {
  const state = {
    confirmations: [],
    audits: [],
    diagnostics: [],
  };
  const verifiedAt = new Date('2026-08-24T20:00:00.000Z');
  const service = new EmailVerificationConfirmationService({
    verification: {
      async confirm(token) {
        state.confirmations.push(token);
        if (verificationError) throw verificationError;
        return { verifiedAt };
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
        if (diagnosticsError) throw diagnosticsError;
      },
    },
  });
  return { service, state, verifiedAt };
}

test('confirmação concluída retorna somente horário e audita sem token', async () => {
  const { service, state, verifiedAt } = createHarness();

  assert.deepEqual(await service.confirm('token-opaco'), { verifiedAt });
  assert.deepEqual(state.audits, [{
    action: 'email_verification.confirm',
    outcome: 'VERIFICATION_COMPLETED',
  }]);
  assert.equal(JSON.stringify(state.audits).includes('token-opaco'), false);
});

test('token inválido, expirado, usado ou revogado preserva rejeição pública única', async () => {
  const { service, state } = createHarness({
    verificationError: new EmailVerificationRejectedError(),
  });

  await assert.rejects(
    service.confirm('token-invalido'),
    EmailVerificationRejectedError,
  );
  assert.deepEqual(state.audits, [{
    action: 'email_verification.confirm',
    outcome: 'VERIFICATION_REJECTED',
  }]);
  assert.deepEqual(state.diagnostics, []);
  assert.equal(JSON.stringify(state.audits).includes('token-invalido'), false);
});

test('falha operacional é sanitizada, diagnosticada e auditada sem exceção', async () => {
  const { service, state } = createHarness({
    verificationError: new Error('banco offline com token-opaco'),
  });

  await assert.rejects(
    service.confirm('token-opaco'),
    EmailVerificationUnavailableError,
  );
  assert.deepEqual(state.diagnostics, [{
    operation: 'email_verification.confirm',
    stage: 'PERSISTENCE',
  }]);
  assert.deepEqual(state.audits, [{
    action: 'email_verification.confirm',
    outcome: 'PERSISTENCE_FAILED',
  }]);
  const serialized = JSON.stringify({
    audits: state.audits,
    diagnostics: state.diagnostics,
  });
  assert.equal(serialized.includes('token-opaco'), false);
  assert.equal(serialized.includes('banco offline'), false);
});

test('falha de auditoria não altera sucesso nem rejeição pública', async () => {
  const success = createHarness({ auditError: new Error('audit offline') });
  await success.service.confirm('token-opaco');
  assert.deepEqual(success.state.diagnostics, [{
    operation: 'email_verification.confirm',
    stage: 'AUDIT',
  }]);

  const rejection = createHarness({
    verificationError: new EmailVerificationRejectedError(),
    auditError: new Error('audit offline'),
    diagnosticsError: new Error('diagnóstico offline'),
  });
  await assert.rejects(
    rejection.service.confirm('token-invalido'),
    EmailVerificationRejectedError,
  );
});

test('auditoria persistente grava somente ação e resultado permitidos', async () => {
  const calls = [];
  const audit = new PrismaEmailVerificationConfirmationAudit({
    passwordRecoveryAuditEvent: {
      async create(input) {
        calls.push(input);
        return { id: 'audit_1' };
      },
    },
  });

  await audit.record({
    action: 'email_verification.confirm',
    outcome: 'VERIFICATION_COMPLETED',
  });

  assert.deepEqual(calls, [{
    data: {
      action: 'email_verification.confirm',
      outcome: 'VERIFICATION_COMPLETED',
    },
    select: { id: true },
  }]);
  const serialized = JSON.stringify(calls);
  for (const forbidden of [
    '@',
    'token',
    'hash',
    'origin',
    'organizationId',
    'eventId',
    'subjectUserId',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('diagnóstico registra somente evento e estágio enumerados', async () => {
  const warnings = [];
  const diagnostics = new EmailVerificationConfirmationOperationalDiagnostics({
    warn(message) {
      warnings.push(message);
    },
  });

  await diagnostics.capture({
    operation: 'email_verification.confirm',
    stage: 'PERSISTENCE',
  });

  assert.deepEqual(warnings, [{
    event: 'email_verification.confirm_failed',
    stage: 'PERSISTENCE',
  }]);
});

test('migration amplia enum e ação sem remover dados ou campos', async () => {
  const sql = await readFile(
    new URL(
      '../prisma/migrations/20260824200000_email_verification_confirmation_audit/migration.sql',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(sql, /ADD VALUE IF NOT EXISTS 'VERIFICATION_COMPLETED'/u);
  assert.match(sql, /ADD VALUE IF NOT EXISTS 'VERIFICATION_REJECTED'/u);
  assert.match(sql, /'email_verification\.confirm'/u);
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/u);
});
