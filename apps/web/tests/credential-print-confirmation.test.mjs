import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deskResultStillVisible, emissionSequence, labelWithoutEmission, openLabelPrint } from '../lib/credential-print-confirmation.ts';

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

test('abrir a impressão não confirma, e o aviso só vale na mesma seleção', () => {
  let prints = 0;
  assert.equal(openLabelPrint(true, () => { prints += 1; }), false);
  assert.equal(prints, 0);
  assert.equal(openLabelPrint(false, () => { prints += 1; }), true);
  assert.equal(prints, 1);
  assert.equal(deskResultStillVisible(4, 4), true);
  assert.equal(deskResultStillVisible(4, 5), false);
  const desk = readFileSync(new URL('../components/event-desk.tsx', import.meta.url), 'utf8');
  const kiosk = readFileSync(new URL('../components/self-service-kiosk.tsx', import.meta.url), 'utf8');
  assert.match(desk, /openLabelPrint\(credentialLabelLayout\(badge\)\.fitWarning, \(\) => window\.print\(\)\)/u);
  assert.match(desk, /deskResultStillVisible\(version, selectionVersion\.current\)/u);
  assert.doesNotMatch(kiosk, /credential-prints\/confirm/u);
});
