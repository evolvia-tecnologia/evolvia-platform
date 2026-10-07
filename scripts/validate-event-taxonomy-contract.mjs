import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXPECTED_TYPE_COUNT = 20;

/**
 * Cruzamento de identidade das 6 famílias. Não é um terceiro catálogo de tipos:
 * os valores vêm só de EVENT_PROFILE_GROUPS e CANONICAL_EVENT_TYPE_PROFILES.
 */
export const WEB_FAMILY_TO_BACKEND = Object.freeze({
  scientific: 'SCIENTIFIC_EVENT',
  corporate: 'CORPORATE_TRAINING',
  fair: 'FAIR_EXHIBITION',
  entertainment: 'ENTERTAINMENT',
  community: 'SOCIAL_COMMUNITY',
  other: 'OTHER',
});

export const DEFAULT_SOURCES = Object.freeze({
  webCatalog: new URL('../apps/web/lib/event-profile-catalog.ts', import.meta.url),
  apiPolicy: new URL('../apps/api/src/wizard-policy.ts', import.meta.url),
  prismaSchema: new URL('../apps/api/prisma/schema.prisma', import.meta.url),
});

export function extractExportedConstArray(source, name) {
  const marker = `export const ${name} = [`;
  const start = source.indexOf(marker);
  if (start === -1) {
    throw new Error(`Fonte canônica ausente: ${name} não foi encontrado.`);
  }

  const bodyStart = start + marker.length;
  const endMarker = '\n] as const';
  const end = source.indexOf(endMarker, bodyStart);
  if (end === -1) {
    throw new Error(`Fonte canônica malformada: ${name} não termina com ] as const.`);
  }

  return source.slice(bodyStart, end);
}

function quoted(value) {
  return `«${value}»`;
}

function duplicatesOf(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    else seen.add(value);
  }
  return [...duplicates];
}

function listQuoted(values) {
  return [...values].map(quoted).join(', ');
}

export function parseWebCatalog(source) {
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new Error('Fonte canônica ausente: o catálogo Web está vazio.');
  }

  const body = extractExportedConstArray(source, 'EVENT_PROFILE_GROUPS');
  const groupPattern = /\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)',\s*description:\s*'([^']+)',\s*options:\s*\[([\s\S]*?)\]\s*,?\s*\}/gu;
  const optionPattern = /\{\s*value:\s*'([^']+)',\s*icon:\s*'([^']*)',\s*title:\s*'([^']+)',\s*description:\s*'([^']+)'\s*,?\s*\}/gu;

  const entries = [];
  let groupMatch = groupPattern.exec(body);
  while (groupMatch) {
    const [, familyId, familyLabel, , optionsBody] = groupMatch;
    optionPattern.lastIndex = 0;
    let optionMatch = optionPattern.exec(optionsBody);
    let optionCount = 0;
    while (optionMatch) {
      optionCount += 1;
      entries.push({
        familyId,
        familyLabel,
        value: optionMatch[1],
        title: optionMatch[3],
      });
      optionMatch = optionPattern.exec(optionsBody);
    }
    if (optionCount === 0) {
      throw new Error(`Família Web ${quoted(familyId)} não possui tipos no catálogo canônico.`);
    }
    groupMatch = groupPattern.exec(body);
  }

  if (entries.length === 0) {
    throw new Error('Fonte canônica malformada: nenhum tipo foi extraído de EVENT_PROFILE_GROUPS.');
  }

  return entries;
}

export function parseBackendCatalog(source) {
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new Error('Fonte canônica ausente: o catálogo da API está vazio.');
  }

  const body = extractExportedConstArray(source, 'CANONICAL_EVENT_TYPE_PROFILES');
  const entryPattern = /\{\s*eventType:\s*'([^']+)',\s*profileCode:\s*EventProfileCode\.([A-Z_]+)\s*,?\s*\}/gu;
  const entries = [];
  let match = entryPattern.exec(body);
  while (match) {
    entries.push({
      eventType: match[1],
      profileCode: match[2],
    });
    match = entryPattern.exec(body);
  }

  if (entries.length === 0) {
    throw new Error('Fonte canônica malformada: nenhum tipo foi extraído de CANONICAL_EVENT_TYPE_PROFILES.');
  }

  return entries;
}

export function parseBackendFamilies(source) {
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new Error('Fonte canônica ausente: o enum EventProfileCode está vazio.');
  }

  const enumMatch = source.match(/enum EventProfileCode \{([^}]+)\}/u);
  if (!enumMatch) {
    throw new Error('Fonte canônica ausente: enum EventProfileCode não foi encontrado.');
  }

  const families = enumMatch[1].match(/\b[A-Z][A-Z0-9_]*\b/gu) ?? [];
  if (families.length === 0) {
    throw new Error('Fonte canônica malformada: EventProfileCode não declara famílias.');
  }

  return new Set(families);
}

export function validateEventTaxonomyContract({
  webEntries,
  backendEntries,
  backendFamilies,
} = {}) {
  const falhas = [];
  const web = Array.isArray(webEntries) ? webEntries : [];
  const backend = Array.isArray(backendEntries) ? backendEntries : [];
  const families = backendFamilies instanceof Set
    ? backendFamilies
    : new Set(backendFamilies ?? []);

  const webValues = web.map((item) => item?.value);
  const backendValues = backend.map((item) => item?.eventType);

  for (const value of webValues) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      falhas.push('Label divergente no catálogo Web: há tipo sem valor canônico.');
    }
  }
  for (const value of backendValues) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      falhas.push('Label divergente no catálogo da API: há tipo sem valor canônico.');
    }
  }

  for (const duplicated of duplicatesOf(webValues.filter((value) => typeof value === 'string'))) {
    falhas.push(`Duplicidade no catálogo Web: o tipo ${quoted(duplicated)} aparece mais de uma vez.`);
  }
  for (const duplicated of duplicatesOf(backendValues.filter((value) => typeof value === 'string'))) {
    falhas.push(`Duplicidade no catálogo da API: o tipo ${quoted(duplicated)} aparece mais de uma vez.`);
  }

  if (web.length !== EXPECTED_TYPE_COUNT) {
    falhas.push(
      `Cardinalidade do catálogo Web divergente: esperado ${EXPECTED_TYPE_COUNT} tipos, encontrado ${web.length}.`,
    );
  }
  if (backend.length !== EXPECTED_TYPE_COUNT) {
    falhas.push(
      `Cardinalidade do catálogo da API divergente: esperado ${EXPECTED_TYPE_COUNT} tipos, encontrado ${backend.length}.`,
    );
  }

  const webSet = new Set(webValues.filter((value) => typeof value === 'string' && value.trim().length > 0));
  const backendSet = new Set(backendValues.filter((value) => typeof value === 'string' && value.trim().length > 0));
  const missingInBackend = [...webSet].filter((value) => !backendSet.has(value));
  const missingInWeb = [...backendSet].filter((value) => !webSet.has(value));

  if (
    missingInBackend.length > 0
    && missingInWeb.length > 0
    && webSet.size === backendSet.size
  ) {
    falhas.push(
      `Label divergente: valores só no Web: ${listQuoted(missingInBackend)}; valores só na API: ${listQuoted(missingInWeb)}.`,
    );
  } else {
    for (const value of missingInBackend) {
      falhas.push(`Ausência na API: o tipo Web ${quoted(value)} não possui mapeamento backend.`);
    }
    for (const value of missingInWeb) {
      falhas.push(`Ausência no Web: o tipo da API ${quoted(value)} não existe no catálogo canônico.`);
    }
  }

  if (families.size === 0) {
    falhas.push('Família backend inexistente: o enum EventProfileCode não declara famílias.');
  }

  for (const item of backend) {
    const profileCode = item?.profileCode;
    if (typeof profileCode !== 'string' || profileCode.trim().length === 0) {
      falhas.push(`Família backend inexistente no tipo ${quoted(item?.eventType ?? '')}.`);
      continue;
    }
    if (!families.has(profileCode)) {
      falhas.push(
        `Família backend inexistente: ${quoted(profileCode)} no tipo ${quoted(item.eventType)}.`,
      );
    }
  }

  for (const item of web) {
    if (typeof item?.value !== 'string') continue;
    const mapped = backend.find((candidate) => candidate?.eventType === item.value);
    if (!mapped) continue;

    const expected = WEB_FAMILY_TO_BACKEND[item.familyId];
    if (!expected) {
      falhas.push(
        `Família backend inexistente: a família Web ${quoted(item.familyId)} do tipo ${quoted(item.value)} não possui código canônico.`,
      );
      continue;
    }
    if (mapped.profileCode !== expected) {
      falhas.push(
        `Família backend divergente para ${quoted(item.value)}: esperado ${expected} (família Web ${item.familyId}), encontrado ${mapped.profileCode}.`,
      );
    }
  }

  return {
    ok: falhas.length === 0,
    falhas,
    cardinality: {
      web: web.length,
      backend: backend.length,
      expected: EXPECTED_TYPE_COUNT,
    },
  };
}

export async function loadCanonicalSources(paths = DEFAULT_SOURCES) {
  const [webSource, backendSource, prismaSource] = await Promise.all([
    readFile(paths.webCatalog, 'utf8'),
    readFile(paths.apiPolicy, 'utf8'),
    readFile(paths.prismaSchema, 'utf8'),
  ]);

  return { webSource, backendSource, prismaSource };
}

export function validateCanonicalSources({ webSource, backendSource, prismaSource }) {
  return validateEventTaxonomyContract({
    webEntries: parseWebCatalog(webSource),
    backendEntries: parseBackendCatalog(backendSource),
    backendFamilies: parseBackendFamilies(prismaSource),
  });
}

export async function validateRepositoryTaxonomy(paths = DEFAULT_SOURCES) {
  return validateCanonicalSources(await loadCanonicalSources(paths));
}

function isMainModule() {
  const invoked = process.argv[1];
  return Boolean(invoked) && fileURLToPath(import.meta.url) === resolve(invoked);
}

function shouldRunCli() {
  if (!isMainModule()) return false;
  if (process.env.NODE_TEST_CONTEXT) return false;
  if (process.argv.includes('--test')) return false;
  return !process.execArgv.some((arg) => arg === '--test' || arg.startsWith('--test='));
}

export async function runCli(paths = DEFAULT_SOURCES) {
  const result = await validateRepositoryTaxonomy(paths);
  if (!result.ok) {
    console.error(result.falhas.join('\n'));
    return 1;
  }

  console.log(
    `Contrato da taxonomia Web/API validado: ${EXPECTED_TYPE_COUNT} tipos com exatamente um mapeamento backend.`,
  );
  return 0;
}

if (shouldRunCli()) {
  runCli().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
