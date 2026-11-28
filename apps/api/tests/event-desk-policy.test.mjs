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
  normalizeSelfServiceDocument,
  normalizeSelfServiceRequest,
  normalizeSelfServiceMethods,
  operationalCapabilities,
  defaultLabelConfig,
  labelFieldAllowed,
  labelText,
  normalizeLabelConfig,
  readLabelConfig,
  readSelfServiceMethods,
  DeskPolicyError,
} from '../src/event-desk-policy.ts';

test('etiqueta combina cidade/UF e usa nome preferido, cargo e empresa sem dados sensíveis', () => {
  const config = normalizeLabelConfig({ ...defaultLabelConfig(), extraFields: ['job_title', 'city_state'], showCategory: false });
  const label = labelText({ preferred_name: 'Bia', full_name: 'Beatriz de Teste', job_title: 'Pesquisadora', institution: 'Instituto Fictício', city: 'Osasco', state: 'SP', email: 'nao-expor@example.test', identity_document: 'nao-expor' }, 'Congressista', config);
  assert.deepEqual(label, { name: 'Bia', company: 'Instituto Fictício', lines: ['Pesquisadora', 'Osasco / SP'], category: null });
  assert.deepEqual(labelText({ full_name: 'Nome completo', city: 'Campinas' }, '', config).lines, ['Campinas']);
  assert.deepEqual(labelText({ state: 'SP' }, '', config).lines, ['SP']);
  assert.deepEqual(labelText({}, '', config).lines, []);
  assert.deepEqual(labelText({ city_state: 'Valor legado', city: 'Outra cidade', state: 'SP' }, '', config).lines, ['Valor legado']);
});

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
  const context = checkIn.slice(checkIn.indexOf('async selfServiceContext'), checkIn.indexOf('async selfServicePreview'));
  assert.match(context, /logo\?\.state === 'ACTIVE' && logo\.usage === 'LOGO'/u);
  assert.match(context, /\/media\/LOGO/u);
  assert.match(context, /logoAlt: logoReady \? logo\.altText : null/u);
  assert.doesNotMatch(context, /storageKey|contentBase64/u);
  assert.match(checkIn, /logoAsset: \{ select: \{ altText: true, state: true, usage: true \} \}/u);
  assert.match(desk, /requirePublished/u);
  assert.match(desk, /'credential'/u);
  assert.match(desk, /'material_delivery'/u);
  assert.match(desk, /'registration'/u);
  assert.match(reservations, /Inscrição paga não é confirmada no posto/u);
  assert.match(desk, /registration\.desk_corrected/u);
  assert.match(desk, /editableRegistrationFields/u);
  assert.match(desk, /requireOrganizer/u);
  assert.doesNotMatch(desk, /SCIENTIFIC_EVENT|CORPORATE_TRAINING|FAIR_EXHIBITION|ENTERTAINMENT|SOCIAL_COMMUNITY/u);
});

test('o totem começa sem buscas e só aceita as que o organizador ligou', () => {
  assert.deepEqual(readSelfServiceMethods(undefined), []);
  assert.deepEqual(readSelfServiceMethods({ selfService: { cpf: true, email: false, qr: true } }), ['CPF', 'QR']);
  const saved = mergeSelfServiceConfig({ other: true }, ['EMAIL']);
  assert.equal(saved.other, true);
  assert.deepEqual(saved.selfService, { cpf: false, email: true, qr: false, protocol: false });
  assert.deepEqual(normalizeSelfServiceMethods({ cpf: true, email: false, qr: false }), ['CPF']);
  assert.deepEqual(normalizeSelfServiceMethods({ cpf: false, email: false, qr: false, protocol: true }), ['PROTOCOL']);
  assert.equal(normalizeSelfServiceRequest({ method: 'PROTOCOL', value: 'evo-ab12cd34ef567890' }).value, 'EVO-AB12CD34EF567890');
  assert.equal(normalizeSelfServiceRequest({ method: 'CPF', value: '529.982.247-25' }).value, '52998224725');
  assert.equal(normalizeSelfServiceDocument('ab-123456'), 'AB123456');
  assert.equal(normalizeSelfServiceRequest({ method: 'CPF', value: 'ab 123456' }).value, 'AB123456');
  assert.equal(normalizeSelfServiceRequest({ method: 'EMAIL', value: 'Ana@Exemplo.com' }).value, 'ana@exemplo.com');
  assert.throws(() => normalizeSelfServiceRequest({ method: 'CPF', value: '111.111.111-11' }), DeskPolicyError);
  assert.throws(() => normalizeSelfServiceRequest({ method: 'CPF', value: 'AB12' }), DeskPolicyError);
  assert.throws(() => normalizeSelfServiceRequest({ method: 'QR', value: 'EVO-AB12CD34EF567890' }), DeskPolicyError);
});

test('a etiqueta térmica já vem com nome, empresa e QR Code', () => {
  const label = defaultLabelConfig();
  assert.equal(label.preset, '8x3');
  assert.deepEqual([label.widthMm, label.heightMm], [80, 30]);
  assert.equal(label.nameField, 'preferred_name');
  assert.equal(label.companyField, 'institution');
  assert.equal(label.codeMode, 'QR');
  assert.equal(label.showCategory, true);
  assert.deepEqual(readLabelConfig(undefined), label);
  const custom = normalizeLabelConfig({
    ...label,
    preset: '4x2',
    extraFields: ['job_title'],
    codeMode: 'BOTH',
  });
  assert.deepEqual([custom.widthMm, custom.heightMm], [40, 20]);
  assert.deepEqual(custom.extraFields, ['job_title']);
  assert.equal(labelFieldAllowed('identity_document'), false);
  assert.equal(labelFieldAllowed('job_title'), true);
  assert.throws(() => normalizeLabelConfig({ ...label, extraFields: ['email'] }), DeskPolicyError);
  assert.throws(() => normalizeLabelConfig({ ...label, preset: 'custom', widthMm: 10, heightMm: 10 }), DeskPolicyError);
});

test('a credencial mostra o nome de tratamento e a inscrição paga não confirma no posto', () => {
  assert.equal(deskDisplayName({ preferred_name: 'Ana', full_name: 'Ana Silva', identity_document: '52998224725' }), 'Ana');
  assert.equal(deskDisplayName({ full_name: 'Ana Silva' }), 'Ana Silva');
  assert.equal(deskDisplayName({ identity_document: '52998224725' }), 'Participante');
  assert.equal(deskCanConfirmFreeRegistration(0), true);
  assert.equal(deskCanConfirmFreeRegistration(1500), false);
});

