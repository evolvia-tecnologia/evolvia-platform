import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
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
  const [migration, reservations, form, terms, web] = await Promise.all([
    readFile(new URL('../prisma/migrations/20261003224500_registration_terms_document/migration.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/registration-reservations.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/registration-forms.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/registration-terms-document.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../web/components/public-registration-form.tsx', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(migration, /DROP\s+(TABLE|COLUMN)/iu);
  assert.match(migration, /EventRegistrationTermsDocument/u);
  assert.match(reservations, /termsDocumentId: terms\.id/u);
  assert.match(form, /Anexe o PDF dos termos/u);
  assert.match(terms, /Content-Disposition/u);
  assert.match(terms, /nosniff/u);
  assert.match(web, /type="checkbox"/u);
  assert.match(web, /Abrir \{options\.terms\.fileName\}/u);
});
