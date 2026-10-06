import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PresenceCertificatePolicyError,
  canIssuePresenceCertificate,
  certificateDisplayName,
  certificateFeeCents,
  normalizeCertificateCode,
  normalizeCertificateHours,
  normalizeCertificateSetting,
  publicCertificateView,
} from '../src/presence-certificate.policy.ts';

const CODE = 'ab'.repeat(16);

test('certificado de participação não tem taxa', () => {
  assert.equal(certificateFeeCents(), 0);
  const view = publicCertificateView({
    eventName: 'Congresso',
    displayName: 'Ana Silva',
    hours: 8,
    issuedAt: '2026-10-06T12:00:00.000Z',
  });
  assert.equal(view.feeCents, 0);
  assert.equal(view.role, 'participation');
  assert.deepEqual(Object.keys(view).sort(), ['authentic', 'displayName', 'eventName', 'feeCents', 'hours', 'issuedAt', 'role']);
});

test('só emite com liberação, inscrição confirmada e presença', () => {
  assert.equal(canIssuePresenceCertificate({ enabled: true, status: 'CONFIRMED', checkedIn: true }), true);
  assert.equal(canIssuePresenceCertificate({ enabled: false, status: 'CONFIRMED', checkedIn: true }), false);
  assert.equal(canIssuePresenceCertificate({ enabled: true, status: 'CONFIRMED', checkedIn: false }), false);
  assert.equal(canIssuePresenceCertificate({ enabled: true, status: 'PENDING_PAYMENT', checkedIn: true }), false);
  assert.equal(canIssuePresenceCertificate({ enabled: true, status: 'CANCELLED', checkedIn: true }), false);
});

test('nome publicado rejeita marcação e a carga horária fica na faixa', () => {
  assert.equal(certificateDisplayName({ preferred_name: '  Ana   Silva ' }), 'Ana Silva');
  assert.equal(certificateDisplayName({ full_name: 'Ana Silva' }), 'Ana Silva');
  for (const name of ['<script>', 'Ana\nSilva', 'A', '']) {
    assert.throws(() => certificateDisplayName({ preferred_name: name, full_name: name }), PresenceCertificatePolicyError);
  }
  assert.equal(normalizeCertificateHours(null), null);
  assert.equal(normalizeCertificateHours(''), null);
  assert.equal(normalizeCertificateHours(6), 6);
  assert.throws(() => normalizeCertificateHours(0), PresenceCertificatePolicyError);
  assert.throws(() => normalizeCertificateHours(1000), PresenceCertificatePolicyError);
  assert.throws(() => normalizeCertificateHours(1.5), PresenceCertificatePolicyError);
});

test('código é opaco e a configuração não aceita organização do cliente', () => {
  assert.equal(normalizeCertificateCode(` ${CODE.toUpperCase()} `), CODE);
  assert.throws(() => normalizeCertificateCode('curto'), PresenceCertificatePolicyError);
  assert.throws(() => normalizeCertificateCode(`${CODE}ff`), PresenceCertificatePolicyError);
  const setting = normalizeCertificateSetting({ enabled: true, hours: 4, expectedRevision: 2, organizationId: 'outra' });
  assert.deepEqual(setting, { enabled: true, hours: 4, expectedRevision: 2 });
  assert.throws(() => normalizeCertificateSetting({ enabled: 'sim', hours: null, expectedRevision: 0 }), PresenceCertificatePolicyError);
});
