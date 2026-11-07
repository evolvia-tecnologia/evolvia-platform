import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseModalitySection, collectModalityDraft, isRunningProfile, missingSportsSections, modalityDraftErrors, modalitySectionContent, moveModalityRow, sportsModalityId, sportsSectionDraft, sportsStarterModalities, SPORTS_PUBLIC_SECTIONS, validateSportsModalities } from '../lib/sports-public-profile.ts';

test('somente Corrida habilita experiência esportiva específica', () => {
  assert.equal(isRunningProfile('Corrida'), true);
  assert.equal(isRunningProfile('Feira ou exposição'), false);
  assert.equal(isRunningProfile('Evento esportivo ou torneio'), false);
});

test('página esportiva oferece seções distintas sem duplicações', () => {
  assert.equal(new Set(SPORTS_PUBLIC_SECTIONS.map((section) => section.id)).size, SPORTS_PUBLIC_SECTIONS.length);
  assert.ok(SPORTS_PUBLIC_SECTIONS.some((section) => section.id === 'retirada'));
});

test('subir uma modalidade troca a ordem publicada e preserva o identificador', () => {
  const first = { id: 'corrida-8-km', name: 'Corrida 8 km', distance: '8', kind: 'RUN', capacity: '' };
  const second = { id: 'caminhada-4-km', name: 'Caminhada 4 km', distance: '4', kind: 'WALK', capacity: '' };
  const moved = moveModalityRow([first, second], 1, -1);
  assert.deepEqual(moved.map((row) => row.id), ['caminhada-4-km', 'corrida-8-km']);
  assert.deepEqual(moveModalityRow([first], 0, -1).map((row) => row.id), ['corrida-8-km']);
  assert.deepEqual(collectModalityDraft(moved).modalities.map((item) => item.id), ['caminhada-4-km', 'corrida-8-km']);
});

test('linha em branco não publica e o erro permanece na linha preenchida', () => {
  const blank = { id: '', name: '', distance: '', kind: 'RUN', capacity: '' };
  const invalid = { id: '', name: 'Trilha', distance: 'abc', kind: 'TRAIL', capacity: '' };
  const valid = { id: '', name: 'Corrida 8 km', distance: '8', kind: 'RUN', capacity: '' };
  const empty = collectModalityDraft([blank]);
  assert.equal(empty.modalities.length, 0);
  assert.equal(empty.errors.length, 0);
  const broken = collectModalityDraft([blank, invalid, valid]);
  assert.equal(broken.errors[0].index, 1);
  assert.match(broken.errors[0].message, /distância inválida/u);
  const saved = collectModalityDraft([blank, valid]);
  assert.equal(saved.errors.length, 0);
  assert.equal(saved.modalities[0].id, 'corrida-8-km');
  assert.equal(saved.ids[1], 'corrida-8-km');
  const again = collectModalityDraft([{ ...valid, id: saved.ids[1] }]);
  assert.equal(again.modalities[0].id, 'corrida-8-km');
});

test('modalidade salva permanece na seção e a lista vazia sai dela', () => {
  const sections = [
    { id: 'text', title: 'Percurso', kind: 'TEXT', content: { text: 'Saída às 7h' } },
    { id: 'race', title: 'Outra', kind: 'TEXT', content: { text: 'Dados', modalities: [{ id: 'run-5k', name: 'Corrida 5 km', distanceKm: 5, kind: 'RUN' }] } },
  ];
  assert.equal(chooseModalitySection(sections)?.id, 'race');
  const merged = modalitySectionContent(sections[1].content, []);
  assert.equal(merged.text, 'Dados');
  assert.equal('modalities' in merged, false);
  assert.deepEqual(modalitySectionContent({ text: 'Dados' }, sportsStarterModalities()).modalities?.length, 3);
  assert.equal(sportsModalityId('Corrida 8 km', ['corrida-8-km']), 'corrida-8-km-2');
  assert.deepEqual(modalityDraftErrors([]), []);
  assert.ok(modalityDraftErrors([{ id: 'x', name: '<b>Corrida</b>', kind: 'RUN', distanceKm: 5 }]).some((error) => error.includes('HTML')));
});

test('seções da corrida que já existem não são recriadas e as novas nascem ocultas', () => {
  const missing = missingSportsSections([
    { title: 'Percurso oficial', content: { text: 'Volta no parque' } },
    { title: 'Outra', content: { modalities: [] } },
  ]);
  assert.equal(missing.some((item) => item.id === 'percurso' || item.id === 'modalidades'), false);
  assert.equal(missing.some((item) => item.id === 'regulamento'), true);
  const draft = sportsSectionDraft(missing.find((item) => item.id === 'kits') ?? missing[0], 4);
  assert.equal(draft.enabled, false);
  assert.equal(draft.sortOrder, 4);
  assert.match(draft.content.text, /posto/u);
});

test('modalidades padrão são exemplos válidos e independentes', () => {
  const first = sportsStarterModalities();
  assert.deepEqual(validateSportsModalities(first), []);
  first[0].name = 'Alterado';
  assert.equal(sportsStarterModalities()[0].name, 'Caminhada 4 km');
});

test('validação rejeita duplicidade, distâncias e capacidade inválidas', () => {
  assert.ok(validateSportsModalities([]).length > 0);
  assert.ok(validateSportsModalities([{ id: 'run', name: 'Corrida', kind: 'RUN', distanceKm: 4 }, { id: 'run', name: 'Corrida', kind: 'RUN', distanceKm: 8 }]).length > 0);
  assert.ok(validateSportsModalities([{ id: 'x', name: 'Corrida', kind: 'RUN', distanceKm: -1 }]).length > 0);
  assert.ok(validateSportsModalities([{ id: 'x', name: 'Corrida', kind: 'RUN', distanceKm: 4, capacity: 0 }]).length > 0);
  assert.deepEqual(validateSportsModalities([{ id: 'x', name: 'Corrida', kind: 'RUN', distanceKm: 4, capacity: null }]), []);
  assert.ok(validateSportsModalities([{ id: 'x', name: 'Corrida', kind: 'RUN', distanceKm: Number.NaN }]).length > 0);
  for (const invalidKind of [['RUN'], { value: 'RUN' }, 1, null]) {
    assert.ok(validateSportsModalities([{ id: 'x', name: 'Corrida', kind: invalidKind, distanceKm: 4 }]).some((error) => error.includes('tipo inválido')));
  }
});
