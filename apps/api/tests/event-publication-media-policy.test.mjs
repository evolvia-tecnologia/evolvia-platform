import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEventMedia } from '../dist/event-publication/event-publication-media.policy.js';

const VALID_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';

function pngHeader(width, height) {
  const bytes = Buffer.alloc(33);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  Buffer.from('IHDR').copy(bytes, 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = 8;
  bytes[25] = 6;
  return bytes.toString('base64');
}

test('detecta PNG pelo conteúdo e não confia em extensão enviada pelo cliente', () => {
  const result = validateEventMedia({
    usage: 'LOGO',
    contentBase64: VALID_PNG_BASE64,
    altText: 'Marca do Congresso Evolvia',
    decorative: false,
  });
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.extension, 'png');
  assert.equal(result.width, 1);
  assert.equal(result.height, 1);
  assert.match(result.checksumSha256, /^[a-f0-9]{64}$/);
});

test('rejeita SVG e conteúdo arbitrário mesmo quando codificados em base64', () => {
  assert.throws(() => validateEventMedia({
    usage: 'COVER',
    contentBase64: Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64'),
    altText: null,
    decorative: true,
  }), /PNG, JPEG ou WebP/);
});

test('rejeita PNG truncado e conteúdo anexado depois do fim da imagem', () => {
  assert.throws(() => validateEventMedia({
    usage: 'LOGO',
    contentBase64: pngHeader(320, 180),
    altText: 'Marca',
    decorative: false,
  }), /integridade|incompleto|truncado/);

  const withTrailingContent = Buffer.concat([
    Buffer.from(VALID_PNG_BASE64, 'base64'),
    Buffer.from('<script>conteudo anexado</script>'),
  ]).toString('base64');
  assert.throws(() => validateEventMedia({
    usage: 'LOGO',
    contentBase64: withTrailingContent,
    altText: 'Marca',
    decorative: false,
  }), /dados após o fim/);
});

test('limita dimensões e quantidade total de pixels', () => {
  assert.throws(() => validateEventMedia({
    usage: 'COVER',
    contentBase64: pngHeader(8192, 8192),
    altText: 'Auditório principal',
    decorative: false,
  }), /24 megapixels/);
});

test('texto alternativo é obrigatório salvo para capa explicitamente decorativa', () => {
  assert.throws(() => validateEventMedia({
    usage: 'SOCIAL_SHARE',
    contentBase64: VALID_PNG_BASE64,
    altText: '',
    decorative: false,
  }), /texto alternativo/);

  assert.throws(() => validateEventMedia({
    usage: 'LOGO',
    contentBase64: VALID_PNG_BASE64,
    altText: null,
    decorative: true,
  }), /Somente a capa/);

  const cover = validateEventMedia({
    usage: 'COVER',
    contentBase64: VALID_PNG_BASE64,
    altText: null,
    decorative: true,
  });
  assert.equal(cover.decorative, true);
  assert.equal(cover.altText, null);
});
