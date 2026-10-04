import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { validateRegistrationTermsPdf } from '../src/registration-terms-document.policy.ts';

const simplePdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'latin1');

test('aceita um PDF simples e guarda só o nome seguro', () => {
  const validated = validateRegistrationTermsPdf({
    contentBase64: simplePdf.toString('base64'),
    fileName: 'Politica de Privacidade (2026).pdf',
  });
  assert.equal(validated.fileName, 'Politica de Privacidade (2026).pdf');
  assert.equal(validated.checksumSha256.length, 64);
  assert.equal(validated.bytes.subarray(0, 5).toString('latin1'), '%PDF-');
});

test('rejeita nome de PDF escrito com escape hexadecimal', () => {
  const cases = [
    '%PDF-1.4\n/#4AavaScript (app.alert(1))\n%%EOF',
    '%PDF-1.4\n/Ja#76aScript (app.alert(1))\n%%EOF',
    '%PDF-1.4\n/#4A#53 (x)\n%%EOF',
    '%PDF-1.4\n/#45ncrypt << >>\n%%EOF',
    '%PDF-1.4\n/Embedded#46ile 1 0 R\n%%EOF',
    '%PDF-1.4\n/Java#Script (x)\n%%EOF',
  ];
  for (const content of cases) {
    assert.throws(() => validateRegistrationTermsPdf({
      contentBase64: Buffer.from(content, 'latin1').toString('base64'),
      fileName: 'termos.pdf',
    }));
  }
  const benign = Buffer.from('%PDF-1.4\n1 0 obj\n<< /#54ype /Catalog /Pages 2 0 R >>\nendobj\n%%EOF\n', 'latin1');
  const validated = validateRegistrationTermsPdf({ contentBase64: benign.toString('base64'), fileName: 'termos.pdf' });
  assert.equal(validated.bytes.subarray(0, 5).toString('latin1'), '%PDF-');
});

test('rejeita script comprimido e filtro que esconde o conteúdo', () => {
  const hidden = deflateSync(Buffer.from('<< /JavaScript (x) >>', 'latin1'));
  const compressed = Buffer.concat([
    Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${hidden.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'),
    hidden,
    Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
  ]);
  const readable = deflateSync(Buffer.from('Termos de inscricao e politica de privacidade.', 'latin1'));
  const benign = Buffer.concat([
    Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${readable.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'),
    readable,
    Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
  ]);
  assert.throws(() => validateRegistrationTermsPdf({ contentBase64: compressed.toString('base64'), fileName: 'termos.pdf' }));
  assert.throws(() => validateRegistrationTermsPdf({
    contentBase64: Buffer.from('%PDF-1.4\n<< /Filter /LZWDecode /Length 1 >>\nstream\nA\nendstream\n%%EOF', 'latin1').toString('base64'),
    fileName: 'termos.pdf',
  }));
  const expanded = deflateSync(Buffer.alloc(5 * 1024 * 1024 + 1, 0x41));
  const bomb = Buffer.concat([
    Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${expanded.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'),
    expanded,
    Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
  ]);
  assert.throws(() => validateRegistrationTermsPdf({ contentBase64: bomb.toString('base64'), fileName: 'termos.pdf' }));
  const accepted = validateRegistrationTermsPdf({ contentBase64: benign.toString('base64'), fileName: 'termos.pdf' });
  assert.equal(accepted.bytes.subarray(0, 5).toString('latin1'), '%PDF-');
});

test('rejeita HTML, script, senha e nome que não é PDF', () => {
  const cases = [
    { contentBase64: Buffer.from('<html><script>alert(1)</script></html>').toString('base64'), fileName: 'termos.pdf' },
    { contentBase64: Buffer.from('%PDF-1.4\n/JavaScript (app.alert(1))\n%%EOF').toString('base64'), fileName: 'termos.pdf' },
    { contentBase64: Buffer.from('%PDF-1.4\n/Encrypt << >>\n%%EOF').toString('base64'), fileName: 'termos.pdf' },
    { contentBase64: simplePdf.toString('base64'), fileName: '../segredo.html' },
  ];
  for (const input of cases) assert.throws(() => validateRegistrationTermsPdf(input));
});

test('o aceite público abre o PDF anexado e a reserva guarda a versão', async () => {
  const [migration, reservations, form, terms] = await Promise.all([
    readFile(new URL('../prisma/migrations/20261003224500_registration_terms_document/migration.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/registration-reservations.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/registration-forms.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/registration-terms-document.service.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN)/iu);
  assert.match(migration, /EventRegistrationTermsDocument/u);
  assert.match(reservations, /termsDocumentId: terms\.id/u);
  assert.match(reservations, /Os termos de inscrição e a Política de Privacidade do evento ainda não foram configurados pela organização\./u);
  assert.doesNotMatch(reservations, /antes de receber inscrições/u);
  assert.match(form, /Anexe o PDF dos termos/u);
  assert.match(terms, /Content-Disposition/u);
  assert.match(terms, /nosniff/u);
  assert.match(terms, /sandbox/u);
  assert.doesNotMatch(terms, /child_process|execFile|spawn\(/u);
});
