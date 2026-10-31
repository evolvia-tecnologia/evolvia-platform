import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { validateRegistrationTermsPdf, validateScientificPdf } from '../src/registration-terms-document.policy.ts';

function ascii85(bytes) {
  let output = '';
  for (let i = 0; i < bytes.length; i += 4) {
    const chunk = bytes.subarray(i, i + 4);
    let total = 0;
    for (let j = 0; j < 4; j += 1) total = total * 256 + (chunk[j] ?? 0);
    const encoded = Array(5);
    for (let j = 4; j >= 0; j -= 1) { encoded[j] = String.fromCharCode(total % 85 + 33); total = Math.floor(total / 85); }
    output += encoded.slice(0, chunk.length + 1).join('');
  }
  return Buffer.from(output + '~>');
}
function pdf(body, filters = '[/ASCII85Decode /FlateDecode]') {
  return Buffer.concat([Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${body.length} /Filter ${filters} >>\nstream\n`), body, Buffer.from('\nendstream\nendobj\n%%EOF\n')]);
}
const input = (bytes) => ({ fileName: 'aviso-qa.pdf', contentBase64: bytes.toString('base64') });

test('inspeciona ASCII85 e Flate em ordem e preserva os bytes passivos', () => {
  const bytes = pdf(ascii85(deflateSync(Buffer.from('BT (Aviso ficticio) Tj ET'))));
  for (const validate of [validateRegistrationTermsPdf, validateScientificPdf]) assert.deepEqual(validate(input(bytes)).bytes, bytes);
  for (const text of ['a', 'ab', 'abc', 'abcd', 'abcde']) {
    const direct = pdf(ascii85(Buffer.from(text)), '/A85');
    assert.doesNotThrow(() => validateRegistrationTermsPdf(input(direct)));
  }
});

test('recusa recurso ativo depois de decodificar, inclusive nome escapado', () => {
  for (const content of ['/JavaScript (x)', '/#4A#53 (x)', '/EmbeddedFile 2 0 R', '/Encrypt <<>>', '/OpenAction <<>>', '/ObjStm']) {
    assert.throws(() => validateRegistrationTermsPdf(input(pdf(ascii85(deflateSync(Buffer.from(content)))))));
  }
});

test('recusa ASCII85 inválido, filtros opacos e expansão excessiva', () => {
  for (const value of ['!~>', 'uuuuu~>', '!z~>', '!v~>', '!!!!!', '!!!!!~>extra']) assert.throws(() => validateRegistrationTermsPdf(input(pdf(Buffer.from(value), '/A85'))));
  assert.throws(() => validateRegistrationTermsPdf(input(pdf(ascii85(Buffer.from('test')), '[/A85 /LZWDecode]'))));
  assert.throws(() => validateRegistrationTermsPdf(input(pdf(ascii85(deflateSync(Buffer.alloc(5 * 1024 * 1024 + 1, 65)))))));
});

test('o dicionário do stream atual prevalece sobre o comprimento do anterior', () => {
  const first = pdf(ascii85(deflateSync(Buffer.from('primeiro'))));
  const second = pdf(ascii85(deflateSync(Buffer.from('segundo com outro comprimento'))));
  assert.doesNotThrow(() => validateRegistrationTermsPdf(input(Buffer.concat([first, second.subarray(9)]))));
});

test('não ignora conteúdo escondido além do comprimento declarado', () => {
  const bytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length 1 >>\nstream\nA /JavaScript (x)\nendstream\nendobj\n%%EOF');
  assert.throws(() => validateRegistrationTermsPdf(input(bytes)));
});
