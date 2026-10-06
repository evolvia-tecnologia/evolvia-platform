import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const panel = await readFile(new URL('../components/event-certificate.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/eventos/[id]/painel/certificados/page.tsx', import.meta.url), 'utf8');
const view = await readFile(new URL('../components/presence-certificate-view.tsx', import.meta.url), 'utf8');
const viewCss = await readFile(new URL('../components/presence-certificate-view.module.css', import.meta.url), 'utf8');
const area = await readFile(new URL('../components/participant-area.tsx', import.meta.url), 'utf8');
const help = await readFile(new URL('../lib/public-help.ts', import.meta.url), 'utf8');

test('organizador libera participação sem taxa e com uma EVA', () => {
  assert.match(page, /section="certificates"/u);
  assert.match(panel, /O download não é cobrado/u);
  assert.match(panel, /Não há envio em massa/u);
  assert.equal(panel.match(/<ScientificEvaHelp/gu).length, 1);
  assert.match(panel, /não lê documento/u);
  assert.doesNotMatch(panel, /amountCents|checkout|pix|boleto|walletId/iu);
});

test('consulta pública e a área do participante não expõem documento', () => {
  assert.match(view, /Certificado de participação/u);
  assert.match(view, /feeCents === 0/u);
  assert.match(view, /!\('protocol' in record\)/u);
  assert.match(view, /!\('email' in record\)/u);
  assert.match(view, /window\.print\(\)/u);
  assert.equal(view.match(/<ScientificEvaHelp/gu).length, 1);
  assert.match(viewCss, /@media print/u);
  assert.match(viewCss, /min-height: var\(--space-44\)/u);
  assert.match(viewCss, /@media \(max-width: 360px\)/u);
  assert.match(area, /Baixar certificado/u);
  assert.match(area, /O download não é cobrado/u);
  assert.match(area, /participant\/certificate/u);
  assert.doesNotMatch(area, /registrationData|full_name|preferred_name|emailHash|identityHash/u);
  assert.match(help, /O download não é cobrado/u);
  assert.match(help, /Não há envio em massa/u);
});
