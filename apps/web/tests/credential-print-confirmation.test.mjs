import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { emissionSequence, labelWithoutEmission } from '../lib/credential-print-confirmation.ts';

test('só uma sequência inteira da emissão pode ser confirmada', () => {
  assert.equal(emissionSequence({ emissao: { sequence: 2, concluida: false } }), 2);
  for (const result of [null, {}, { emissao: {} }, { emissao: { sequence: 0 } }, { emissao: { sequence: 1.5 } }, { emissao: { sequence: '2' } }, { sequence: 2 }]) {
    assert.equal(emissionSequence(result), null);
  }
});

test('a etiqueta impressa não carrega o metadado da emissão', () => {
  const label = labelWithoutEmission({ eventName: 'Volta', emissao: { sequence: 1 }, protocol: 'A1' });
  assert.deepEqual(label, { eventName: 'Volta', protocol: 'A1' });
});

test('o posto confirma em botão próprio e não trata a impressão do navegador como papel saído', () => {
  const desk = readFileSync(new URL('../components/event-desk.tsx', import.meta.url), 'utf8');
  const kiosk = readFileSync(new URL('../components/self-service-kiosk.tsx', import.meta.url), 'utf8');
  assert.match(desk, /credential-prints\/confirm/u);
  assert.match(desk, /A etiqueta saiu/u);
  assert.match(desk, /emissionSequence\(result\)/u);
  assert.doesNotMatch(desk, /afterprint/u);
  const printButton = desk.slice(desk.indexOf('ref={printButtonRef}'), desk.indexOf('ref={printButtonRef}') + 360);
  assert.match(printButton, /window\.print\(\)/u);
  assert.doesNotMatch(printButton, /credential-prints/u);
  assert.doesNotMatch(kiosk, /credential-prints\/confirm/u);
});
