import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPublicationRichTextSafe,
  PublicationRichTextPolicyError,
} from '../src/public-rich-text.policy.ts';
import { CertificateRolePolicyError, normalizeRoleSetting } from '../src/certificate-role.policy.ts';
import { normalizeCertificateSetting, PresenceCertificatePolicyError } from '../src/presence-certificate.policy.ts';

test('certificados aceitam formatação editorial e recusam marcador inválido', () => {
  const body = '@center [[fmt sans 18 navy]]Certificamos **{NOME}**[[/fmt]]';
  const role = normalizeRoleSetting('activity', {
    enabled: true,
    releaseMode: 'manual',
    releaseDays: 0,
    hours: null,
    title: 'Título',
    body,
    expectedRevision: 0,
  });
  assert.equal(role.body, body);
  assert.throws(
    () => normalizeRoleSetting('activity', {
      enabled: true,
      releaseMode: 'manual',
      releaseDays: 0,
      hours: null,
      title: 'Título',
      body: '[[fmt sans 16 navy]]aberto',
      expectedRevision: 0,
    }),
    CertificateRolePolicyError,
  );
});

test('participação reaproveita a mesma política de rich text', () => {
  const setting = normalizeCertificateSetting({
    enabled: true,
    hours: null,
    title: '[[fmt serif 16 text]]Certificado[[/fmt]]',
    body: 'Texto **ok**',
    expectedRevision: 0,
  });
  assert.match(setting.title, /\[\[fmt serif 16 text\]\]/u);
  assert.throws(
    () => normalizeCertificateSetting({
      enabled: true,
      hours: null,
      title: '<script>',
      body: 'x',
      expectedRevision: 0,
    }),
    PresenceCertificatePolicyError,
  );
  assert.throws(() => assertPublicationRichTextSafe('[[/fmt]]'), PublicationRichTextPolicyError);
});
