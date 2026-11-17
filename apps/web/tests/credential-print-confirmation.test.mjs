import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CONFIRMATION_RETRY, CONFIRMATION_UNKNOWN, confirmationAccepted, confirmationFailureGuidance, deskResultStillVisible, emissionSequence, labelWithoutEmission, openLabelPrint } from '../lib/credential-print-confirmation.ts';

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
  assert.match(desk, /setPrintIssue\(sequence \? \{ reservationId: person\.reservationId, sequence \} : null\)/u);
  assert.doesNotMatch(kiosk, /credential-prints\/confirm/u);
  assert.doesNotMatch(kiosk, /A etiqueta saiu/u);
  assert.match(kiosk, /credentialLabelLayout\(badge\)\.fitWarning/u);
  assert.match(desk, /credentialLabelLayout\(badge\)\.fitWarning/u);
});

test('resposta desconhecida não confirma e a recusa de reimpressão fica legível', () => {
  const issue = { reservationId: 'res-1', sequence: 4 };
  const accepted = { sequence: 4, acaoExigida: 'credencial_imprimir', concluida: true, repetida: false };
  assert.deepEqual(confirmationAccepted(issue, accepted), { repeated: false });
  assert.deepEqual(confirmationAccepted(issue, { ...accepted, repetida: true, acaoExigida: 'credencial_reimprimir' }), { repeated: true });
  for (const result of [null, {}, { ...accepted, sequence: 5 }, { ...accepted, concluida: false }, { ...accepted, acaoExigida: 'outra' }, { ...accepted, repetida: 'false' }]) {
    assert.equal(confirmationAccepted(issue, result), null);
  }
  assert.match(CONFIRMATION_UNKNOWN, /mesma emissão/u);
  assert.equal(
    confirmationFailureGuidance('Esta credencial já foi impressa. Confirmar outra impressão exige permissão de reimpressão.'),
    'Esta credencial já foi impressa. Confirmar outra impressão exige permissão de reimpressão.',
  );
  assert.equal(confirmationFailureGuidance('Error: connect ECONNREFUSED\n    at EventDesk'), CONFIRMATION_RETRY);
  assert.match(CONFIRMATION_RETRY, /mesma confirmação/u);
});
