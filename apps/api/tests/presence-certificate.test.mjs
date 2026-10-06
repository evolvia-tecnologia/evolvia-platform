import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_CERTIFICATE_BODY,
  DEFAULT_CERTIFICATE_TITLE,
  PresenceCertificatePolicyError,
  canIssuePresenceCertificate,
  certificateDisplayName,
  certificateFeeCents,
  normalizeCertificateArtUpload,
  normalizeCertificateCode,
  normalizeCertificateHours,
  normalizeCertificateSetting,
  publicCertificateView,
  renderCertificateTemplate,
} from '../src/presence-certificate.policy.ts';

const CODE = 'ab'.repeat(16);

test('certificado de participação não tem taxa', () => {
  assert.equal(certificateFeeCents(), 0);
  const view = publicCertificateView({
    eventName: 'Congresso',
    displayName: 'Ana Silva',
    hours: 8,
    issuedAt: '2026-10-06T12:00:00.000Z',
    code: CODE,
    title: DEFAULT_CERTIFICATE_TITLE,
    body: DEFAULT_CERTIFICATE_BODY,
    artAlt: null,
    hasArt: false,
  });
  assert.equal(view.feeCents, 0);
  assert.equal(view.role, 'participation');
  assert.equal(view.title, DEFAULT_CERTIFICATE_TITLE);
  assert.equal(view.body, 'Certificamos que **Ana Silva** participou de **Congresso**.');
  assert.equal(view.hasArt, false);
  assert.deepEqual(Object.keys(view).sort(), ['artAlt', 'authentic', 'body', 'displayName', 'eventName', 'feeCents', 'hasArt', 'hours', 'issuedAt', 'role', 'title']);
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
  assert.deepEqual(setting, {
    enabled: true,
    hours: 4,
    title: DEFAULT_CERTIFICATE_TITLE,
    body: DEFAULT_CERTIFICATE_BODY,
    expectedRevision: 2,
  });
  assert.equal(setting.organizationId, undefined);
  assert.throws(() => normalizeCertificateSetting({ enabled: 'sim', hours: null, expectedRevision: 0 }), PresenceCertificatePolicyError);
});

test('tags conhecidas entram no texto e documento ou HTML ficam de fora', () => {
  const rendered = renderCertificateTemplate('{NOME}|{EVENTO}|{CARGA_HORARIA}|{DATA}|{CODIGO}|{CPF}|{EMAIL}', {
    displayName: 'Ana Silva',
    eventName: 'Congresso',
    hours: 8,
    issuedAt: '2026-10-06T12:00:00.000Z',
    code: CODE,
  });
  assert.equal(rendered, `Ana Silva|Congresso|8|06/10/2026|${CODE}|{CPF}|{EMAIL}`);
  assert.equal(renderCertificateTemplate('{CARGA_HORARIA}', {
    displayName: 'Ana Silva', eventName: 'Congresso', hours: null, issuedAt: '2026-10-06T12:00:00.000Z', code: CODE,
  }), 'não informada');
  const saved = normalizeCertificateSetting({
    enabled: true,
    hours: null,
    title: '## Participação de {NOME}',
    body: 'Certificamos **{NOME}** em {EVENTO}.',
    expectedRevision: 1,
  });
  assert.equal(saved.title, '## Participação de {NOME}');
  for (const body of ['<b>{NOME}</b>', 'Olá {CPF}', 'Olá {email}', 'Olá {PROTOCOLO}']) {
    assert.throws(() => normalizeCertificateSetting({ enabled: true, hours: null, body, expectedRevision: 1 }), PresenceCertificatePolicyError);
  }
});

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9]).toString('base64');

test('a arte aceita PNG ou JPEG e recusa SVG, excesso e texto alternativo vazio', () => {
  const png = normalizeCertificateArtUpload({ contentBase64: PNG, altText: 'Fundo azul', expectedRevision: 1, organizationId: 'outra' });
  assert.equal(png.mimeType, 'image/png');
  assert.equal(png.extension, 'png');
  assert.equal(png.altText, 'Fundo azul');
  assert.equal(png.organizationId, undefined);
  const jpeg = normalizeCertificateArtUpload({ contentBase64: JPEG, altText: 'Faixa do evento', expectedRevision: 0 });
  assert.equal(jpeg.mimeType, 'image/jpeg');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64');
  assert.throws(() => normalizeCertificateArtUpload({ contentBase64: svg, altText: 'Marca', expectedRevision: 1 }), /SVG/u);
  assert.throws(() => normalizeCertificateArtUpload({ contentBase64: 'A'.repeat(7_000_000), altText: 'Marca', expectedRevision: 1 }), /5 MB/u);
  assert.throws(() => normalizeCertificateArtUpload({ contentBase64: PNG, altText: ' ', expectedRevision: 1 }), PresenceCertificatePolicyError);
  const wide = Buffer.alloc(24);
  wide.write('89504e470d0a1a0a', 0, 'hex');
  wide.writeUInt32BE(13, 8);
  wide.write('IHDR', 12, 'ascii');
  wide.writeUInt32BE(9000, 16);
  wide.writeUInt32BE(10, 20);
  assert.throws(() => normalizeCertificateArtUpload({ contentBase64: wide.toString('base64'), altText: 'Larga', expectedRevision: 1 }), /8\.192/u);
});
