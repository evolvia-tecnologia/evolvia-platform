import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  CERTIFICATE_BODY_MAX,
  CERTIFICATE_TITLE_MAX,
  certificateDisplayName,
  normalizeCertificateSetting,
  publicCertificateView,
} from '../src/presence-certificate.policy.ts';
import { CERTIFICATE_BATCH_MAX, CertificateTextUnsupportedError, certificatePdf } from '../dist/presence-certificate-pdf.js';

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
  assert.equal(first[9], 0x25);
  assert.equal(first.subarray(10, 14).some((byte) => byte > 127), true);
  assert.match(first.toString('latin1'), /\/F1 12 Tf[\s\S]{0,800}\n20 TL\nT\*\n\/F1 16 Tf/u);
  const text = first.toString('latin1');
  const shown = shownText(first);
  assert.match(shown, /Ana Souza/u);
  assert.match(shown, /Congresso/u);
  assert.match(shown, new RegExp(page.code, 'u'));
  assert.match(shown, /Segunda via/u);
  assert.match(shown, /cobrado/u);
  assert.doesNotMatch(shown, /@|protocolo|cpf|email/iu);
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
  assert.match(shownText(bytes), /Bruno Lima/u);
  assert.match(shownText(bytes), /Este lote mostra 2 de 3/u);
  assert.equal([...text.matchAll(/\/Type \/Page /g)].length, 2);
});

function shownText(bytes) {
  const text = bytes.toString('latin1');
  const glyphs = new Map();
  for (const match of text.matchAll(/<([0-9A-F]{4})> <([0-9A-F]{4,8})>/gu)) {
    const units = match[2].match(/.{4}/gu).map((unit) => Number.parseInt(unit, 16));
    glyphs.set(match[1], String.fromCharCode(...units));
  }
  return [...text.matchAll(/<([0-9A-F]*)> Tj/gu)]
    .map((match) => (match[1].match(/.{4}/gu) ?? []).map((glyph) => glyphs.get(glyph) ?? '\uFFFD').join(''))
    .join('');
}

test('nome acentuado sai pela fonte Unicode embutida e o texto longo conserva a cauda', () => {
  const ending = 'FINAL_OBRIGATORIO';
  const bytes = certificatePdf([{
    ...page,
    displayName: 'João Gonçalves',
    eventName: 'Congresso de São Paulo',
    body: `${'A'.repeat(90)}${ending}`,
  }]);
  const text = bytes.toString('latin1');
  const shown = shownText(bytes);
  assert.match(text, /\/Subtype \/CIDFontType2/u);
  assert.match(text, /\/Encoding \/Identity-H/u);
  assert.match(text, /\/FontFile2 \d+ 0 R/u);
  assert.match(text, /\/ToUnicode \d+ 0 R/u);
  assert.match(shown, /João Gonçalves/u);
  assert.match(shown, /Congresso de São Paulo/u);
  assert.match(shown, new RegExp(`${'A'.repeat(90)}${ending}`, 'u'));
  assert.doesNotMatch(shown, /\uFFFD/u);
  assert.equal(offsets(bytes).length >= 3, true);
});

function compact(value) {
  return value.replace(/\s+/gu, '');
}

function poppler(bytes) {
  const dir = mkdtempSync(join(tmpdir(), 'certificado-'));
  const pdf = join(dir, 'certificado.pdf');
  writeFileSync(pdf, bytes);
  const text = spawnSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' });
  assert.equal(text.status, 0, text.stderr || text.error?.message);
  const bbox = spawnSync('pdftotext', ['-bbox-layout', pdf, '-'], { encoding: 'utf8' });
  assert.equal(bbox.status, 0, bbox.stderr || bbox.error?.message);
  const info = spawnSync('pdfinfo', [pdf], { encoding: 'utf8' });
  assert.equal(info.status, 0, info.stderr || info.error?.message);
  const boxes = [...bbox.stdout.matchAll(/xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)"/g)];
  assert.ok(boxes.length > 0);
  for (const match of boxes) {
    const [xMin, yMin, xMax, yMax] = match.slice(1).map(Number);
    assert.ok(xMin >= -0.2 && yMin >= -0.2 && xMax <= 595 && yMax <= 842, `${xMin} ${yMin} ${xMax} ${yMax}`);
  }
  const pages = Number(info.stdout.match(/Pages:\s+(\d+)/u)?.[1]);
  assert.match(info.stdout, /595 x 842 pts/u);
  return { text: text.stdout, pages };
}

function viewOf(input) {
  const setting = normalizeCertificateSetting({
    enabled: true,
    hours: input.hours ?? 8,
    title: input.title,
    body: input.body,
    expectedRevision: 1,
  });
  const displayName = certificateDisplayName({ full_name: input.displayName });
  const view = publicCertificateView({
    eventName: input.eventName,
    displayName,
    hours: setting.hours,
    issuedAt: page.issuedAt,
    code: input.code ?? page.code,
    title: setting.title,
    body: setting.body,
    artAlt: null,
    hasArt: false,
  });
  return certificatePdf([{
    title: view.title,
    body: view.body,
    displayName: view.displayName,
    eventName: view.eventName,
    hours: view.hours,
    issuedAt: view.issuedAt,
    code: input.code ?? page.code,
  }]);
}

test('título, corpo e nome no limite aceito saem inteiros dentro da página', () => {
  assert.equal(CERTIFICATE_TITLE_MAX, 240);
  assert.equal(CERTIFICATE_BODY_MAX, 4000);
  const title = `${'T'.repeat(220)}FINAL_TITULO_240AB`;
  const body = `${'A'.repeat(3980)}FINAL_CORPO_4000AB`;
  const displayName = `${'W'.repeat(164)}FINAL_NOME_180AB`;
  assert.equal(title.length, 238);
  assert.equal(body.length, 3998);
  assert.equal(displayName.length, 180);
  const bytes = viewOf({ title, body, displayName, eventName: 'Congresso de São Paulo' });
  const shown = compact(shownText(bytes));
  assert.ok(shown.includes(title));
  assert.ok(shown.includes(body));
  assert.ok(shown.includes(displayName));
  assert.ok(shown.includes('CongressodeSãoPaulo'));
  assert.ok(shown.includes(page.code));
  const extracted = poppler(bytes);
  const flat = compact(extracted.text);
  assert.ok(flat.includes(title));
  assert.ok(flat.includes(body));
  assert.ok(flat.includes(displayName));
  assert.ok(flat.includes('CongressodeSãoPaulo'));
  assert.ok(extracted.pages > 1);
  assert.equal([...bytes.toString('latin1').matchAll(/\/Type \/Page /g)].length, extracted.pages);
  assert.deepEqual(bytes, viewOf({ title, body, displayName, eventName: 'Congresso de São Paulo' }));
});

test('letras largas e a expansão das tags permanecem dentro da página', () => {
  const wide = viewOf({
    title: 'W'.repeat(52),
    body: 'W'.repeat(64),
    displayName: 'João Gonçalves',
    eventName: 'Congresso de São Paulo',
  });
  const wideShown = compact(shownText(wide));
  assert.ok(wideShown.includes('W'.repeat(52)));
  assert.ok(wideShown.includes('W'.repeat(64)));
  const wideExtract = poppler(wide);
  const wideFlat = compact(wideExtract.text);
  assert.ok(wideFlat.includes('W'.repeat(116)));
  assert.ok(wideFlat.includes('JoãoGonçalves'));
  assert.equal(wideExtract.pages, 1);

  const displayName = `${'W'.repeat(20)}FINAL_NOME_TAG`;
  const title = `${'T'.repeat(200)} {EVENTO} FINAL_TITULO_TAG`;
  const body = `${'A'.repeat(3900)} {NOME} FINAL_CORPO_TAG`;
  const bytes = viewOf({ title, body, displayName, eventName: 'Congresso de São Paulo' });
  const shown = compact(shownText(bytes));
  const expandedTitle = `${'T'.repeat(200)}CongressodeSãoPauloFINAL_TITULO_TAG`;
  const expandedBody = `${'A'.repeat(3900)}${displayName}FINAL_CORPO_TAG`;
  assert.ok(shown.includes(expandedTitle));
  assert.ok(shown.includes(expandedBody));
  const extracted = poppler(bytes);
  const flat = compact(extracted.text);
  assert.ok(flat.includes(expandedTitle));
  assert.ok(flat.includes(expandedBody));
  assert.ok(extracted.pages > 1);
});

test('lote de 40 páginas repete o código da mesma via', () => {
  const copies = Array.from({ length: CERTIFICATE_BATCH_MAX }, (_, index) => ({
    ...page,
    displayName: `Pessoa ${index + 1}`,
    code: index.toString(16).padStart(32, 'a'),
  }));
  const bytes = certificatePdf(copies);
  const again = certificatePdf(copies.map((copy) => ({ ...copy })));
  assert.deepEqual(bytes, again);
  const text = bytes.toString('latin1');
  assert.match(text, /\/Count 40/u);
  assert.equal([...text.matchAll(/\/Type \/Page /g)].length, 40);
  const shown = shownText(bytes);
  for (const copy of copies) assert.ok(shown.includes(copy.code));
  const extracted = poppler(bytes);
  assert.equal(extracted.pages, 40);
  assert.ok(compact(extracted.text).includes(copies[0].code));
  assert.ok(compact(extracted.text).includes(copies[39].code));
});

test('pontuação tipográfica aceita permanece no texto extraído', () => {
  const phrase = '“Pós-evento” — 30° § … ‘nota’';
  const setting = normalizeCertificateSetting({
    enabled: true,
    hours: null,
    title: 'Certificado de participação',
    body: phrase,
    expectedRevision: 1,
  });
  assert.equal(setting.body, phrase);
  const bytes = certificatePdf([{
    ...page,
    title: setting.title,
    body: setting.body,
    displayName: 'João Gonçalves',
    eventName: 'Congresso de São Paulo',
  }]);
  const extracted = poppler(bytes);
  assert.ok(extracted.text.includes(phrase));
  assert.ok(extracted.text.includes('João Gonçalves'));
  assert.ok(extracted.text.includes('Congresso de São Paulo'));
});

test('consulta e lote não emitem outro certificado', async () => {
  const service = await readFile(new URL('../src/presence-certificate.service.ts', import.meta.url), 'utf8');
  const pdf = service.slice(service.indexOf('async publicPdf'), service.indexOf('async offer'));
  assert.match(pdf, /renderPdf/u);
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

test('nomes internacionais saem inteiros no PDF, sem troca por espaço', () => {
  const names = [
    'Łukasz Żółkiewski', 'Đặng Thị Ngọc Ánh', 'Søren Ørsted Æbelø', 'Straße Weiß', 'Θεόδωρος Παπαδόπουλος',
    'Иван Петров', 'Ğülşen Şahin', 'Zoë Brontë-Ñúñez', "O'Connor #2", 'Ana*Maria',
  ];
  const bytes = certificatePdf(names.map((displayName, index) => ({ ...page, displayName, code: index.toString(16).padStart(32, 'c') })));
  const shown = shownText(bytes);
  const extracted = poppler(bytes);
  for (const name of names) {
    assert.ok(shown.includes(`Nome: ${name}`), name);
    assert.ok(extracted.text.includes(name), name);
  }
  assert.doesNotMatch(shown, /\uFFFD/u);
  assert.equal(extracted.pages, names.length);
});

test('caractere sem glifo na fonte é recusado com a lista, sem gerar PDF trocado', () => {
  assert.throws(
    () => certificatePdf([{ ...page, displayName: 'Wang 王小明 👋' }]),
    (error) => error instanceof CertificateTextUnsupportedError && error.characters.join('') === '王小明👋',
  );
  assert.throws(() => certificatePdf([page, { ...page, eventName: 'Evento 東京' }]), CertificateTextUnsupportedError);
});

test('marcação do texto sai como no site e o endereço do link continua no PDF', () => {
  const bytes = certificatePdf([{
    ...page,
    title: '# Certificado **especial**',
    body: 'Certificamos que *Ana* participou.\n- Oficina [Programa](https://exemplo.org/programa)\nNota 5 * 2 #fim',
  }]);
  const shown = compact(shownText(bytes));
  for (const expected of ['Certificado especial', 'Certificamos que Ana participou.', '• Oficina Programa (https://exemplo.org/programa)', 'Nota 5 * 2 #fim']) {
    assert.ok(shown.includes(compact(expected)), expected);
  }
  assert.doesNotMatch(shown, /\*\*|\]\(/u);
});

test('marcadores editoriais de fonte e alinhamento viram texto legível no PDF', () => {
  const bytes = certificatePdf([{
    ...page,
    title: '@center [[fmt sans 20 navy]]Certificado[[/fmt]]',
    body: '[[fmt serif 16 text]]Certificamos **Ana**[[/fmt]]',
  }]);
  const shown = shownText(bytes);
  assert.match(shown, /Certificado/u);
  assert.match(shown, /Certificamos Ana/u);
  assert.doesNotMatch(shown, /\[\[fmt|\[\[\/fmt\]|@center/u);
});
