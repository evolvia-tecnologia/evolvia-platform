import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { EVENT_PROFILE_GROUPS } from '../lib/event-profile-catalog.ts';

const APPROVED_EVENT_TYPES = EVENT_PROFILE_GROUPS.flatMap((group) =>
  group.options.map((option) => ({
    groupId: group.id,
    eventType: option.value,
    title: option.title,
  })),
);

const ENTERTAINMENT_TYPES = APPROVED_EVENT_TYPES.filter((item) => item.groupId === 'entertainment');
const OTHER_TYPES = APPROVED_EVENT_TYPES.filter((item) => item.groupId !== 'entertainment');

function expectedRequired(eventType) {
  const required = ['registration'];
  if (ENTERTAINMENT_TYPES.some((item) => item.eventType === eventType)) {
    required.push('access_control');
  }
  return required;
}

async function wizardSource() {
  return readFile(new URL('../components/event-wizard.tsx', import.meta.url), 'utf8');
}

async function globalsSource() {
  return readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
}

test('catálogo aprovado ainda tem exatamente 19 tipos e Show/Festival em entretenimento', () => {
  assert.equal(APPROVED_EVENT_TYPES.length, 19);
  assert.equal(new Set(APPROVED_EVENT_TYPES.map((item) => item.eventType)).size, 19);
  assert.deepEqual(
    ENTERTAINMENT_TYPES.map((item) => item.eventType),
    ['Show ou entretenimento', 'Festival'],
  );
  assert.deepEqual(
    ENTERTAINMENT_TYPES.map((item) => item.title),
    ['Show', 'Festival'],
  );
});

test('política do Wizard: Inscrições obrigatória nos 19 tipos; acesso só em Show/Festival', async () => {
  const source = await wizardSource();

  assert.match(source, /const WIZARD_REQUIRED_CAPABILITIES = \{[\s\S]*allProfiles: \['registration'\],[\s\S]*entertainment: \['access_control'\],[\s\S]*\} as const;/u);
  assert.match(source, /const ENTERTAINMENT_PROFILE_GROUP_ID = 'entertainment';/u);
  assert.match(source, /findEventProfileGroup\(eventType\)\?\.id === ENTERTAINMENT_PROFILE_GROUP_ID/u);
  assert.match(source, /required\.push\(\.\.\.WIZARD_REQUIRED_CAPABILITIES\.entertainment\)/u);
  assert.doesNotMatch(source, /allProfiles:\s*\[[^\]]*access_control/u);
  assert.doesNotMatch(source, /entertainment:\s*\[[^\]]*registration/u);

  assert.equal(APPROVED_EVENT_TYPES.length, 19);

  for (const item of APPROVED_EVENT_TYPES) {
    assert.deepEqual(
      expectedRequired(item.eventType),
      item.groupId === 'entertainment' ? ['registration', 'access_control'] : ['registration'],
      item.eventType,
    );
    assert.ok(expectedRequired(item.eventType).includes('registration'), item.eventType);
  }

  for (const item of ENTERTAINMENT_TYPES) {
    assert.ok(expectedRequired(item.eventType).includes('access_control'), item.eventType);
  }

  for (const item of OTHER_TYPES) {
    assert.equal(
      expectedRequired(item.eventType).includes('access_control'),
      false,
      `acesso não pode ser estrutural em ${item.eventType}`,
    );
  }
});

test('controle obrigatório não pode ser desmarcado nem parecer opcional', async () => {
  const source = await wizardSource();

  assert.match(source, /function isRequiredWizardCapability\(code: string, eventType\?: string\)/u);
  assert.match(source, /if \(isRequiredWizardCapability\(item\.code, draft\.eventType\)\) return;/u);
  assert.match(source, /for \(const code of getRequiredWizardCapabilities\(draft\.eventType\)\) selected\.add\(code\);/u);
  assert.match(source, /item\.recommended \|\| required\.has\(item\.code\)/u);

  assert.match(source, /const required = isRequiredWizardCapability\(item\.code, draft\.eventType\);/u);
  assert.match(source, /<article key=\{item\.code\} className="capability-card selected" aria-required="true" aria-disabled="true"/u);
  assert.match(source, /aria-label=\{`\$\{item\.label\}, obrigatório, não pode ser desativado`\}/u);
  assert.match(source, /<span className="recommended-badge">Obrigatório<\/span>/u);
  assert.match(source, /Este recurso faz parte da estrutura do evento e não pode ser removido\./u);
  assert.match(source, /\{required \? 'Obrigatório' : selected \? 'Ativado' : 'Ativar'\}/u);
  assert.match(source, /Recursos estruturais obrigatórios não podem ser removidos\./u);

  assert.match(source, /<button type="button" key=\{item\.code\} className=\{`capability-card \$\{selected \? 'selected' : ''\}`\} onClick=\{\(\) => toggleCapability\(item\)\} aria-pressed=\{selected\}>/u);

  const renderer = source.match(/function renderCapabilityCard\(item: Capability\) \{[\s\S]*?\n  \}/u)?.[0] ?? '';
  assert.ok(renderer.includes('if (required)'), 'renderer de capability precisa ramificar o cartão obrigatório');
  assert.match(renderer, /\{required \? 'Obrigatório' : selected \? 'Ativado' : 'Ativar'\}/u);
  assert.match(renderer, /<span className="recommended-badge">Obrigatório<\/span>/u);

  const requiredCard = renderer.match(/if \(required\) \{[\s\S]*?return <article[\s\S]*?<\/article>;/u)?.[0] ?? '';
  assert.ok(requiredCard.length > 0, 'card obrigatório precisa existir');
  assert.doesNotMatch(requiredCard, /onClick/u);
  assert.doesNotMatch(requiredCard, /aria-pressed/u);
  assert.doesNotMatch(requiredCard, /Ativar/u);
  assert.doesNotMatch(requiredCard, /Recomendado/u);
  assert.match(requiredCard, /obrigatório, não pode ser desativado/u);

  const optionalCard = renderer.match(/return <button type="button"[\s\S]*?<\/button>;/u)?.[0] ?? '';
  assert.ok(optionalCard.length > 0, 'card opcional precisa permanecer acionável');
  assert.match(optionalCard, /onClick=\{\(\) => toggleCapability\(item\)\}/u);
  assert.match(optionalCard, /aria-pressed=\{selected\}/u);
  assert.doesNotMatch(optionalCard, /aria-required/u);
  assert.doesNotMatch(optionalCard, /aria-disabled/u);
});

test('validação e persistência recolocam as capabilities estruturais', async () => {
  const source = await wizardSource();

  assert.match(source, /if \(!selected\.has\('registration'\)\) return 'Inscrições é um recurso obrigatório\.';/u);
  assert.match(
    source,
    /getRequiredWizardCapabilities\(draft\.eventType\)\.includes\('access_control'\) && !selected\.has\('access_control'\)/u,
  );
  assert.match(source, /Controle de acesso é um recurso obrigatório para show e festival\./u);
  assert.match(source, /answers: withRequiredCapabilities\(snapshot, catalogRef\.current\)/u);
  assert.match(source, /answers: withRequiredCapabilities\(draftRef\.current, catalogRef\.current\)/u);
});

test('textos PT-BR, foco/teclado, alvo 44px e reflow 320px permanecem no contrato do Wizard', async () => {
  const [source, globals] = await Promise.all([wizardSource(), globalsSource()]);

  for (const phrase of [
    'Obrigatório',
    'Recomendado',
    'Ativado',
    'Ativar',
    'Inscrições é um recurso obrigatório.',
    'Controle de acesso é um recurso obrigatório para show e festival.',
    'Este recurso faz parte da estrutura do evento e não pode ser removido.',
    'Restaurar sugestões',
  ]) {
    assert.match(source, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'), phrase);
  }

  assert.match(source, /className="capability-card selected"/u);
  assert.match(source, /className=\{`capability-card \$\{selected \? 'selected' : ''\}`\}/u);
  assert.match(source, /aria-pressed=\{selected\}/u);
  assert.match(globals, /\.capability-card:focus-visible/u);
  assert.match(globals, /\.capability-card\{[^}]*min-height:210px/u);
  assert.match(globals, /\.btn\{min-height:44px/u);
  assert.match(globals, /body\{min-width:320px\}/u);
  assert.match(globals, /@media\(max-width:700px\)\{[\s\S]*\.capability-grid[\s\S]*grid-template-columns:1fr/u);
});

test('divergência da política backend #201 falha este contrato', async () => {
  const source = await wizardSource();

  assert.equal(expectedRequired('Congresso ou evento científico').includes('access_control'), false);
  assert.equal(expectedRequired('Feira ou exposição').includes('access_control'), false);
  assert.equal(expectedRequired('Outro tipo de evento').includes('scientific_submission'), false);
  assert.deepEqual(expectedRequired('Show ou entretenimento'), ['registration', 'access_control']);
  assert.deepEqual(expectedRequired('Festival'), ['registration', 'access_control']);

  assert.match(source, /allProfiles: \['registration'\]/u);
  assert.match(source, /entertainment: \['access_control'\]/u);
  assert.doesNotMatch(source, /scientific_submission/u);
  assert.doesNotMatch(source, /WIZARD_REQUIRED_CAPABILITIES = \{[\s\S]*fair:/u);
  assert.doesNotMatch(source, /WIZARD_REQUIRED_CAPABILITIES = \{[\s\S]*corporate:/u);
});
