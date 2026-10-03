import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  deskAllows,
  deskCanConfirmFreeRegistration,
  deskDisplayName,
  deskSearchAllowed,
  mergeSelfServiceConfig,
  normalizeDeskSearch,
  normalizeSelfServiceRequest,
  normalizeSelfServiceMethods,
  operationalCapabilities,
  readSelfServiceMethods,
  DeskPolicyError,
} from '../src/event-desk-policy.ts';

test('recursos operacionais não dependem do perfil do evento', () => {
  assert.deepEqual(
    operationalCapabilities(['registration', 'credential', 'access_control', 'material_delivery', 'payment']),
    ['credential', 'access_control', 'material_delivery', 'registration'],
  );
  assert.equal(deskAllows(['credential'], 'credential'), true);
  assert.equal(deskAllows(['registration'], 'access_control'), false);
  assert.equal(deskSearchAllowed(['material_delivery']), true);
  assert.equal(deskSearchAllowed(['registration']), false);
});

test('busca da portaria rejeita curingas e aceita nome, e-mail, documento e protocolo', () => {
  assert.equal(normalizeDeskSearch({ kind: 'NAME', value: '  Ana  Silva ' }).value, 'Ana Silva');
  assert.equal(normalizeDeskSearch({ kind: 'EMAIL', value: 'Ana@Exemplo.com' }).value, 'ana@exemplo.com');
  assert.equal(normalizeDeskSearch({ kind: 'DOCUMENT', value: '529.982.247-25' }).value, '52998224725');
  assert.equal(normalizeDeskSearch({ kind: 'PROTOCOL', value: 'evo-ab12cd34ef567890' }).value, 'EVO-AB12CD34EF567890');
  assert.throws(() => normalizeDeskSearch({ kind: 'NAME', value: 'An%' }), DeskPolicyError);
  assert.throws(() => normalizeDeskSearch({ kind: 'PROTOCOL', value: 'EVO-1' }), DeskPolicyError);
});

test('autoatendimento e posto exigem recurso ativo, evento publicado e lote gratuito', async () => {
  const [checkIn, desk, reservations] = await Promise.all([
    readFile(new URL('../src/check-in.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/event-desk.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/registration-reservations.service.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(checkIn, /code: 'access_control'/u);
  assert.match(desk, /requirePublished/u);
  assert.match(desk, /'credential'/u);
  assert.match(desk, /'material_delivery'/u);
  assert.match(desk, /'registration'/u);
  assert.match(reservations, /Inscrição paga não é confirmada no posto/u);
  assert.doesNotMatch(desk, /SCIENTIFIC_EVENT|CORPORATE_TRAINING|FAIR_EXHIBITION|ENTERTAINMENT|SOCIAL_COMMUNITY/u);
});

test('o totem começa sem buscas e só aceita as que o organizador ligou', () => {
  assert.deepEqual(readSelfServiceMethods(undefined), []);
  assert.deepEqual(readSelfServiceMethods({ selfService: { cpf: true, email: false, qr: true } }), ['CPF', 'QR']);
  const saved = mergeSelfServiceConfig({ other: true }, ['EMAIL']);
  assert.equal(saved.other, true);
  assert.deepEqual(saved.selfService, { cpf: false, email: true, qr: false });
  assert.deepEqual(normalizeSelfServiceMethods({ cpf: true, email: false, qr: false }), ['CPF']);
  assert.equal(normalizeSelfServiceRequest({ method: 'CPF', value: '529.982.247-25' }).value, '52998224725');
  assert.equal(normalizeSelfServiceRequest({ method: 'EMAIL', value: 'Ana@Exemplo.com' }).value, 'ana@exemplo.com');
  assert.throws(() => normalizeSelfServiceRequest({ method: 'CPF', value: '111.111.111-11' }), DeskPolicyError);
  assert.throws(() => normalizeSelfServiceRequest({ method: 'QR', value: 'EVO-AB12CD34EF567890' }), DeskPolicyError);
});

test('a credencial mostra o nome de tratamento e a inscrição paga não confirma no posto', () => {
  assert.equal(deskDisplayName({ preferred_name: 'Ana', full_name: 'Ana Silva', identity_document: '52998224725' }), 'Ana');
  assert.equal(deskDisplayName({ full_name: 'Ana Silva' }), 'Ana Silva');
  assert.equal(deskDisplayName({ identity_document: '52998224725' }), 'Participante');
  assert.equal(deskCanConfirmFreeRegistration(0), true);
  assert.equal(deskCanConfirmFreeRegistration(1500), false);
});
