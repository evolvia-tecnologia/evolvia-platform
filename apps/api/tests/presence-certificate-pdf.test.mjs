import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CERTIFICATE_BATCH_MAX, certificatePdf } from '../src/presence-certificate-pdf.ts';

const page = {
  title: 'Certificado de participação',
  body: 'Certificamos que **Ana Souza** participou de **Congresso**.',
  displayName: 'Ana Souza',
  eventName: 'Congresso',
  hours: 8,
  issuedAt: '2026-10-06T15:00:00.000Z',
  code: 'ab'.repeat(16),
};

function offsets(bytes) {
  const text = bytes.toString('latin1');
  const start = Number(text.match(/startxref\n(\d+)/u)?.[1]);
  const xref = text.slice(start);
  assert.equal(xref.startsWith('xref\n'), true);
  const entries = [...xref.matchAll(/\n(\d{10}) 00000 n /g)].map((match) => Number(match[1]));
  assert.ok(entries.length > 0);
  return entries;
}

test('o PDF da segunda via repete os mesmos bytes e não cobra', () => {
  const first = certificatePdf([page]);
  const second = certificatePdf([{ ...page }]);
  assert.deepEqual(first, second);
  assert.equal(first.subarray(0, 8).toString(), '%PDF-1.4');
  const text = first.toString('latin1');
  assert.match(text, /Ana Souza/u);
  assert.match(text, /Congresso/u);
  assert.match(text, new RegExp(page.code, 'u'));
  assert.match(text, /Segunda via/u);
  assert.match(text, /cobrado/u);
  assert.doesNotMatch(text, /@|protocolo|cpf|email/iu);
  const start = Number(text.match(/startxref\n(\d+)/u)?.[1]);
  assert.equal(text.slice(start, start + 4), 'xref');
  for (const offset of offsets(first)) {
    assert.equal(text.slice(offset, offset + 16).includes(' 0 obj'), true);
  }
});

test('lote limita a quantidade e avisa quando há mais certificados', () => {
  assert.equal(CERTIFICATE_BATCH_MAX, 40);
  const bytes = certificatePdf([
    page,
    { ...page, displayName: 'Bruno Lima', code: 'cd'.repeat(16), note: 'Este lote mostra 2 de 3.' },
  ]);
  const text = bytes.toString('latin1');
  assert.match(text, /\/Count 2/u);
  assert.match(text, /Bruno Lima/u);
  assert.match(text, /Este lote mostra 2 de 3/u);
  assert.equal([...text.matchAll(/\/Type \/Page /g)].length, 2);
});

function shownText(bytes) {
  const text = bytes.toString('latin1');
  return [...text.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((match) => match[1]
    .replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(Number.parseInt(octal, 8)))
    .replace(/\\(.)/g, '$1'))
    .join('');
}

test('nome acentuado usa WinAnsi e o texto longo conserva a cauda', () => {
  const ending = 'FINAL_OBRIGATORIO';
  const bytes = certificatePdf([{
    ...page,
    displayName: 'João Gonçalves',
    eventName: 'Congresso de São Paulo',
    body: `${'A'.repeat(90)}${ending}`,
  }]);
  const text = bytes.toString('latin1');
  const shown = shownText(bytes);
  assert.match(text, /\/Encoding \/WinAnsiEncoding/u);
  assert.match(shown, /João Gonçalves/u);
  assert.match(shown, /Congresso de São Paulo/u);
  assert.match(shown, new RegExp(`${'A'.repeat(90)}${ending}`, 'u'));
  assert.equal(offsets(bytes).length >= 3, true);
});

test('consulta e lote não emitem outro certificado', async () => {
  const service = await readFile(new URL('../src/presence-certificate.service.ts', import.meta.url), 'utf8');
  const pdf = service.slice(service.indexOf('async publicPdf'), service.indexOf('async offer'));
  assert.match(pdf, /certificatePdf/u);
  assert.match(pdf, /feeCents: certificateFeeCents\(\)/u);
  assert.doesNotMatch(pdf, /eventCertificate\.create|certificate\.issued|email|cpf|protocol/iu);
  const batch = service.slice(service.indexOf('async batchPdf'), service.indexOf('async save('));
  assert.match(batch, /take: CERTIFICATE_BATCH_MAX/u);
  assert.match(batch, /certificate\.batch_downloaded/u);
  assert.match(batch, /organizationId: event\.organizationId/u);
  assert.match(batch, /eventId: event\.id/u);
  assert.doesNotMatch(batch, /eventCertificate\.create|email|cpf|protocol|registrationData/iu);
  const controller = await readFile(new URL('../src/presence-certificate-public.controller.ts', import.meta.url), 'utf8');
  assert.match(controller, /:code\/pdf/u);
  assert.match(controller, /application\/pdf/u);
  assert.match(controller, /filename="certificado\.pdf"/u);
});
