import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertModerationReason,
  canTransitionModerationCase,
  normalizeModerationActionReason,
  normalizeModerationSummary,
} from '../dist/platform-admin/moderation-domain.js';

test('casos seguem transições explícitas e estados terminais não reabrem silenciosamente', () => {
  assert.equal(canTransitionModerationCase('OPEN', 'IN_REVIEW'), true);
  assert.equal(canTransitionModerationCase('OPEN', 'ACTION_REQUIRED'), true);
  assert.equal(canTransitionModerationCase('IN_REVIEW', 'RESOLVED'), true);
  assert.equal(canTransitionModerationCase('ACTION_REQUIRED', 'IN_REVIEW'), true);

  assert.equal(canTransitionModerationCase('OPEN', 'OPEN'), false);
  assert.equal(canTransitionModerationCase('RESOLVED', 'IN_REVIEW'), false);
  assert.equal(canTransitionModerationCase('DISMISSED', 'OPEN'), false);
});

test('motivos são allowlist e não aceitam códigos inventados', () => {
  assert.doesNotThrow(() => assertModerationReason('SUSPECTED_FRAUD'));
  assert.doesNotThrow(() => assertModerationReason('PAST_EVENT'));
  assert.throws(() => assertModerationReason('FAKE_SCORE'), /MODERATION_REASON_INVALID/);
});

test('resumo de caso é normalizado e limitado sem carregar texto arbitrariamente grande', () => {
  assert.equal(
    normalizeModerationSummary('  Evento   imitando   marca conhecida  '),
    'Evento imitando marca conhecida',
  );
  assert.throws(() => normalizeModerationSummary(' x '), /MODERATION_SUMMARY_INVALID_LENGTH/);
  assert.throws(() => normalizeModerationSummary('a'.repeat(501)), /MODERATION_SUMMARY_INVALID_LENGTH/);
});

test('ação crítica exige motivo descritivo e normalizado', () => {
  assert.equal(
    normalizeModerationActionReason('  Suspensão   para preservar evidências durante revisão.  '),
    'Suspensão para preservar evidências durante revisão.',
  );
  assert.throws(() => normalizeModerationActionReason('não'), /MODERATION_ACTION_REASON_INVALID_LENGTH/);
  assert.throws(() => normalizeModerationActionReason('a'.repeat(1001)), /MODERATION_ACTION_REASON_INVALID_LENGTH/);
});
