import assert from 'node:assert/strict';
import test from 'node:test';
import reservationsService from '../dist/registration-reservations.service.js';

const { canonicalPayload } = reservationsService;

test('hash de reserva individual usa ordem lexicográfica independente de locale', () => {
  const answers = {
    'ä_field': 'valor',
    'a_field': 'valor',
    'A_field': 'valor',
    identity_document: 'PASSAPORTE_FICTICIO',
    email: 'ficticio@example.test',
  };
  const input = { categoryId: 'categoria-ficticia', lotId: 'lote-ficticio', answers };
  const canonical = canonicalPayload(input);
  assert.deepEqual(Object.keys(JSON.parse(canonical).answers), [
    'A_field', 'a_field', 'email', 'identity_document', 'ä_field',
  ]);
  assert.deepEqual(Object.keys(answers), [
    'ä_field', 'a_field', 'A_field', 'identity_document', 'email',
  ], 'a canonicalização não deve modificar o payload original');
});

test('replay com chaves de respostas inseridas em ordem distinta mantém payload idêntico', () => {
  const first = {
    categoryId: 'categoria-ficticia',
    lotId: 'lote-ficticio',
    answers: { z: 'fim', a: 'inicio', email: 'ficticio@example.test' },
  };
  const replay = {
    lotId: 'lote-ficticio',
    categoryId: 'categoria-ficticia',
    answers: { email: 'ficticio@example.test', a: 'inicio', z: 'fim' },
  };
  assert.equal(canonicalPayload(first), canonicalPayload(replay));
});
