import assert from 'node:assert/strict';
import test from 'node:test';
import {
  enabledPeopleFields,
  peopleCsv,
  peopleCsvCell,
  peopleDisplayName,
  peopleFieldText,
  peopleSheetHeaders,
  peopleSheetValues,
} from '../src/event-people-sheet.policy.ts';

const fields = [
  { code: 'full_name', label: 'Nome completo', type: 'TEXT', enabled: true },
  { code: 'email', label: 'E-mail', type: 'EMAIL', enabled: true },
  { code: 'photo', label: 'Foto', type: 'PHOTO', enabled: true },
  { code: 'city', label: 'Cidade', type: 'SELECT', enabled: true, options: [{ id: 'sp', label: 'São Paulo' }] },
  { code: 'topics', label: 'Temas', type: 'CHECKBOX', enabled: true, options: [{ id: 'a', label: 'Clínica' }, { id: 'b', label: 'Gestão' }] },
  { code: 'terms_acceptance', label: 'Termos', type: 'CONSENT', enabled: true },
  { code: 'hidden', label: 'Oculto', type: 'TEXT', enabled: false },
];

test('a planilha usa uma coluna por campo habilitado e não leva foto nem campo oculto', () => {
  const headers = peopleSheetHeaders(fields);
  assert.deepEqual(headers, ['Protocolo', 'Categoria', 'Situação', 'Confirmado em', 'Nome completo', 'E-mail', 'Foto', 'Cidade', 'Temas', 'Termos']);
  assert.equal(enabledPeopleFields(fields).some((field) => field.code === 'hidden'), false);
  const row = peopleSheetValues(fields, {
    protocol: 'PROTOCOLO1',
    categoryName: 'Congressista',
    confirmedAt: new Date('2026-10-10T12:00:00.000Z'),
    registrationData: {
      full_name: 'Ana Silva',
      email: 'ana@example.com',
      photo: 'base64-secreto',
      city: 'sp',
      topics: ['a', 'b'],
      terms_acceptance: true,
      hidden: 'não deve aparecer',
      identityHash: 'segredo',
    },
  }, '10/10/2026, 09:00');
  assert.deepEqual(row, ['PROTOCOLO1', 'Congressista', 'Confirmada', '10/10/2026, 09:00', 'Ana Silva', 'ana@example.com', 'Não incluído', 'São Paulo', 'Clínica; Gestão', 'Sim']);
  assert.equal(row.includes('segredo'), false);
  assert.equal(row.includes('base64-secreto'), false);
  assert.equal(row.includes('não deve aparecer'), false);
});

test('nome da lista recusa marcação e a célula neutraliza fórmula', () => {
  assert.equal(peopleDisplayName({ preferred_name: '  Ana   Silva ' }), 'Ana Silva');
  assert.equal(peopleDisplayName({ preferred_name: '<script>' }), 'Nome não exibível');
  assert.equal(peopleDisplayName({}), 'Nome não exibível');
  assert.equal(peopleCsvCell('=CMD()'), `"'=CMD()"`);
  assert.equal(peopleFieldText({ code: 'city', label: 'Cidade', type: 'SELECT', options: [] }, { city: 'xx' }), 'Opção não reconhecida');
  const csv = peopleCsv(['Protocolo'], [['=1']]);
  assert.equal(csv.startsWith('\uFEFF'), true);
  assert.match(csv, /"'=1"/u);
});
