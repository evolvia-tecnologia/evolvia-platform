import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPublicationRichTextSafe,
  PublicationRichTextPolicyError,
} from '../src/publication-text-style.ts';
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


test('recusa fechamentos extras e spans aninhados sem bloquear texto legado', () => {
  const open = '[[fmt sans 16 text]]';
  const close = '[[/fmt]]';
  for (const value of [close + open + 'x' + close, open + 'x' + close + close,
    open + open + 'x' + close + close, '[[fmt sans 16 text']) {
    assert.throws(() => assertPublicationRichTextSafe(value), PublicationRichTextPolicyError);
  }
  assert.doesNotThrow(() => assertPublicationRichTextSafe('https://exemplo.com'));
  assert.doesNotThrow(() => assertPublicationRichTextSafe(open + 'A' + close + open + 'B' + close));
});
