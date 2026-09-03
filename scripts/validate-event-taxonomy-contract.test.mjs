import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  DEFAULT_SOURCES,
  EXPECTED_TYPE_COUNT,
  WEB_FAMILY_TO_BACKEND,
  extractExportedConstArray,
  loadCanonicalSources,
  parseBackendCatalog,
  parseBackendFamilies,
  parseWebCatalog,
  runCli,
  validateCanonicalSources,
  validateEventTaxonomyContract,
  validateRepositoryTaxonomy,
} from './validate-event-taxonomy-contract.mjs';

const VALIDATOR_URL = new URL('./validate-event-taxonomy-contract.mjs', import.meta.url);
const VALIDATOR_TEST_URL = new URL('./validate-event-taxonomy-contract.test.mjs', import.meta.url);

function clone(value) {
  return structuredClone(value);
}

async function loadParsed() {
  const sources = await loadCanonicalSources();
  return {
    sources,
    webEntries: parseWebCatalog(sources.webSource),
    backendEntries: parseBackendCatalog(sources.backendSource),
    backendFamilies: parseBackendFamilies(sources.prismaSource),
  };
}

test('o contrato real tem exatamente 19 tipos com mapeamento único', async () => {
  const result = await validateRepositoryTaxonomy();
  assert.equal(result.ok, true, result.falhas.join('\n'));
  assert.deepEqual(result.falhas, []);
  assert.equal(result.cardinality.web, EXPECTED_TYPE_COUNT);
  assert.equal(result.cardinality.backend, EXPECTED_TYPE_COUNT);
  assert.equal(result.cardinality.expected, 19);
});

test('as fontes canônicas de #199 e #201 extraem os mesmos 19 valores', async () => {
  const { webEntries, backendEntries, backendFamilies } = await loadParsed();

  assert.equal(webEntries.length, 19);
  assert.equal(backendEntries.length, 19);
  assert.equal(new Set(webEntries.map((item) => item.value)).size, 19);
  assert.equal(new Set(backendEntries.map((item) => item.eventType)).size, 19);
  assert.deepEqual(
    webEntries.map((item) => item.value),
    backendEntries.map((item) => item.eventType),
  );

  for (const family of Object.values(WEB_FAMILY_TO_BACKEND)) {
    assert.equal(backendFamilies.has(family), true, family);
  }

  for (const item of webEntries) {
    const mapped = backendEntries.find((candidate) => candidate.eventType === item.value);
    assert.ok(mapped, item.value);
    assert.equal(mapped.profileCode, WEB_FAMILY_TO_BACKEND[item.familyId], item.value);
  }
});

test('o validador não duplica um terceiro catálogo dos 19 tipos', async () => {
  const { webEntries } = await loadParsed();
  const [validatorSource, testSource] = await Promise.all([
    readFile(VALIDATOR_URL, 'utf8'),
    readFile(VALIDATOR_TEST_URL, 'utf8'),
  ]);

  for (const value of webEntries.map((item) => item.value)) {
    assert.equal(
      validatorSource.includes(`'${value}'`),
      false,
      `o validador não pode hardcodar ${value}`,
    );
  }

  assert.match(validatorSource, /EVENT_PROFILE_GROUPS/u);
  assert.match(validatorSource, /CANONICAL_EVENT_TYPE_PROFILES/u);
  assert.match(testSource, /mutaç/u);
});

test('omitir um tipo Web falha por ausência na API', async () => {
  const parsed = await loadParsed();
  const webEntries = clone(parsed.webEntries);
  const removed = webEntries.shift();
  const result = validateEventTaxonomyContract({
    webEntries,
    backendEntries: parsed.backendEntries,
    backendFamilies: parsed.backendFamilies,
  });

  assert.equal(result.ok, false);
  assert.match(result.falhas.join('\n'), /Cardinalidade do catálogo Web divergente/u);
  assert.match(result.falhas.join('\n'), new RegExp(`Ausência no Web: o tipo da API «${removed.value}»`, 'u'));
});

test('omitir um tipo da API falha por ausência de mapeamento backend', async () => {
  const parsed = await loadParsed();
  const backendEntries = clone(parsed.backendEntries);
  const removed = backendEntries.pop();
  const result = validateEventTaxonomyContract({
    webEntries: parsed.webEntries,
    backendEntries,
    backendFamilies: parsed.backendFamilies,
  });

  assert.equal(result.ok, false);
  assert.match(result.falhas.join('\n'), /Cardinalidade do catálogo da API divergente/u);
  assert.match(
    result.falhas.join('\n'),
    new RegExp(`Ausência na API: o tipo Web «${removed.eventType}» não possui mapeamento backend`, 'u'),
  );
});

test('duplicar um valor Web falha por duplicidade', async () => {
  const parsed = await loadParsed();
  const webEntries = clone(parsed.webEntries);
  webEntries.push({ ...webEntries[0] });
  const result = validateEventTaxonomyContract({
    webEntries,
    backendEntries: parsed.backendEntries,
    backendFamilies: parsed.backendFamilies,
  });

  assert.equal(result.ok, false);
  assert.match(result.falhas.join('\n'), /Duplicidade no catálogo Web/u);
  assert.match(result.falhas.join('\n'), new RegExp(webEntries[0].value, 'u'));
});

test('duplicar um valor da API falha por duplicidade', async () => {
  const parsed = await loadParsed();
  const backendEntries = clone(parsed.backendEntries);
  backendEntries.push({ ...backendEntries[3] });
  const result = validateEventTaxonomyContract({
    webEntries: parsed.webEntries,
    backendEntries,
    backendFamilies: parsed.backendFamilies,
  });

  assert.equal(result.ok, false);
  assert.match(result.falhas.join('\n'), /Duplicidade no catálogo da API/u);
  assert.match(result.falhas.join('\n'), new RegExp(backendEntries[3].eventType, 'u'));
});

test('renomear um label canônico falha como label divergente', async () => {
  const parsed = await loadParsed();
  const webEntries = clone(parsed.webEntries);
  const original = webEntries[1].value;
  webEntries[1] = { ...webEntries[1], value: `${original} (renomeado)` };
  const result = validateEventTaxonomyContract({
    webEntries,
    backendEntries: parsed.backendEntries,
    backendFamilies: parsed.backendFamilies,
  });

  assert.equal(result.ok, false);
  assert.match(result.falhas.join('\n'), /Label divergente/u);
  assert.match(result.falhas.join('\n'), /valores só no Web/u);
  assert.match(result.falhas.join('\n'), /valores só na API/u);
  assert.match(result.falhas.join('\n'), /renomeado/u);
  assert.match(result.falhas.join('\n'), new RegExp(original, 'u'));
});

test('família backend fora do enum falha como inexistente', async () => {
  const parsed = await loadParsed();
  const backendEntries = clone(parsed.backendEntries);
  backendEntries[0] = { ...backendEntries[0], profileCode: 'UNKNOWN_FAMILY' };
  const result = validateEventTaxonomyContract({
    webEntries: parsed.webEntries,
    backendEntries,
    backendFamilies: parsed.backendFamilies,
  });

  assert.equal(result.ok, false);
  assert.match(result.falhas.join('\n'), /Família backend inexistente: «UNKNOWN_FAMILY»/u);
});

test('remapear um tipo para outra família existente falha em PT-BR', async () => {
  const parsed = await loadParsed();
  const backendEntries = clone(parsed.backendEntries);
  const scientific = backendEntries.find((item) => item.profileCode === 'SCIENTIFIC_EVENT');
  scientific.profileCode = 'OTHER';
  const result = validateEventTaxonomyContract({
    webEntries: parsed.webEntries,
    backendEntries,
    backendFamilies: parsed.backendFamilies,
  });

  assert.equal(result.ok, false);
  assert.match(result.falhas.join('\n'), /Família backend divergente/u);
  assert.match(result.falhas.join('\n'), /esperado SCIENTIFIC_EVENT/u);
  assert.match(result.falhas.join('\n'), /encontrado OTHER/u);
});

test('família Web sem código canônico falha como família backend inexistente', async () => {
  const parsed = await loadParsed();
  const webEntries = clone(parsed.webEntries);
  webEntries[0] = { ...webEntries[0], familyId: 'invented' };
  const result = validateEventTaxonomyContract({
    webEntries,
    backendEntries: parsed.backendEntries,
    backendFamilies: parsed.backendFamilies,
  });

  assert.equal(result.ok, false);
  assert.match(result.falhas.join('\n'), /Família backend inexistente: a família Web «invented»/u);
});

test('mutação no texto-fonte da API é detectada pelo parser e pelo contrato', async () => {
  const { sources } = await loadParsed();
  const mutatedBackend = sources.backendSource.replace(
    "eventType: 'Festival', profileCode: EventProfileCode.ENTERTAINMENT",
    "eventType: 'Festival', profileCode: EventProfileCode.NOT_A_FAMILY",
  );
  const result = validateCanonicalSources({
    webSource: sources.webSource,
    backendSource: mutatedBackend,
    prismaSource: sources.prismaSource,
  });

  assert.equal(result.ok, false);
  assert.match(result.falhas.join('\n'), /Família backend inexistente: «NOT_A_FAMILY» no tipo «Festival»/u);
});

test('parser recusa fontes canônicas ausentes ou malformadas em PT-BR', () => {
  assert.throws(() => parseWebCatalog(''), /catálogo Web está vazio/u);
  assert.throws(() => parseBackendCatalog('export const OUTRO = []'), /CANONICAL_EVENT_TYPE_PROFILES não foi encontrado/u);
  assert.throws(() => parseBackendFamilies('enum EventFormat { ONLINE }'), /enum EventProfileCode não foi encontrado/u);
  assert.throws(
    () => extractExportedConstArray('export const EVENT_PROFILE_GROUPS = [', 'EVENT_PROFILE_GROUPS'),
    /não termina com \] as const/u,
  );
});

test('as origens padrão apontam só para os arquivos canônicos do repositório', () => {
  assert.match(String(DEFAULT_SOURCES.webCatalog), /apps\/web\/lib\/event-profile-catalog\.ts$/u);
  assert.match(String(DEFAULT_SOURCES.apiPolicy), /apps\/api\/src\/wizard-policy\.ts$/u);
  assert.match(String(DEFAULT_SOURCES.prismaSchema), /apps\/api\/prisma\/schema\.prisma$/u);
});

test('CLI do repositório real sai 0 e confirma os 19 tipos', async () => {
  const previousExit = process.exitCode;
  process.exitCode = undefined;
  const code = await runCli();
  process.exitCode = previousExit;
  assert.equal(code, 0);

  const spawned = spawnSync(process.execPath, [fileURLToPath(VALIDATOR_URL)], {
    encoding: 'utf8',
    env: { ...process.env, NODE_TEST_CONTEXT: '' },
  });
  assert.equal(spawned.status, 0, spawned.stderr);
  assert.match(spawned.stdout, /19 tipos com exatamente um mapeamento backend/u);
  assert.equal(spawned.stderr, '');
});
