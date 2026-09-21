import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_ROUTES = Object.freeze([
  '/',
  '/eventos',
  '/login',
  '/cadastro',
  '/termos-de-uso',
  '/privacidade',
]);

export const REQUIRED_CHECKS = Object.freeze([
  'keyboardOnly',
  'focusOrder',
  'focusVisible',
  'skipLink',
  'landmarks',
  'headings',
  'controlNames',
  'statusAnnouncements',
  'zoom200',
  'reflow320',
]);

const ALLOWED_STATUS = new Set(['PENDING', 'FAILED', 'PASSED']);
const ALLOWED_ASSISTIVE_TECHNOLOGY = new Set(['NVDA', 'VoiceOver']);
const ALLOWED_TESTER_ROLES = new Set(['product-owner', 'qa', 'accessibility-reviewer']);
const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function sortedUniqueStrings(values) {
  if (!Array.isArray(values) || values.some((value) => !nonEmptyString(value))) return null;
  return [...new Set(values)].sort();
}

function sameStringSet(actual, expected) {
  const normalized = sortedUniqueStrings(actual);
  if (!normalized) return false;
  const normalizedExpected = [...expected].sort();
  return normalized.length === normalizedExpected.length
    && normalized.every((value, index) => value === normalizedExpected[index]);
}

function validateAttempt(attempt, index) {
  const failures = [];
  const path = `attempts[${index}]`;
  if (!attempt || typeof attempt !== 'object' || Array.isArray(attempt)) {
    return [`${path} deve ser um objeto.`];
  }

  if (!SHA_PATTERN.test(attempt.commitSha ?? '')) {
    failures.push(`${path}.commitSha deve conter o SHA completo de 40 caracteres.`);
  }
  if (!ISO_UTC_PATTERN.test(attempt.testedAtUtc ?? '')) {
    failures.push(`${path}.testedAtUtc deve usar ISO 8601 em UTC.`);
  }
  for (const field of ['environmentUrl', 'testerRole', 'operatingSystem', 'browser']) {
    if (!nonEmptyString(attempt[field])) failures.push(`${path}.${field} é obrigatório.`);
  }
  if (nonEmptyString(attempt.testerRole) && !ALLOWED_TESTER_ROLES.has(attempt.testerRole)) {
    failures.push(`${path}.testerRole deve identificar somente o papel, sem nome ou e-mail.`);
  }
  if (
    nonEmptyString(attempt.environmentUrl)
    && !/^https:\/\/homologacao\.evolviatecnologia\.com(?:\/|$)/u.test(attempt.environmentUrl)
  ) {
    failures.push(`${path}.environmentUrl deve apontar para a homologação canônica HTTPS.`);
  }
  if (!ALLOWED_ASSISTIVE_TECHNOLOGY.has(attempt.assistiveTechnology?.name)) {
    failures.push(`${path}.assistiveTechnology.name deve ser NVDA ou VoiceOver.`);
  }
  if (!nonEmptyString(attempt.assistiveTechnology?.version)) {
    failures.push(`${path}.assistiveTechnology.version é obrigatória.`);
  }
  if (!sameStringSet(attempt.routes, REQUIRED_ROUTES)) {
    failures.push(`${path}.routes deve conter exatamente a matriz pública obrigatória.`);
  }
  if (!attempt.checks || typeof attempt.checks !== 'object' || Array.isArray(attempt.checks)) {
    failures.push(`${path}.checks deve ser um objeto.`);
  } else {
    for (const check of REQUIRED_CHECKS) {
      if (typeof attempt.checks[check] !== 'boolean') {
        failures.push(`${path}.checks.${check} deve ser booleano.`);
      }
    }
    const unexpectedChecks = Object.keys(attempt.checks)
      .filter((check) => !REQUIRED_CHECKS.includes(check));
    if (unexpectedChecks.length > 0) {
      failures.push(`${path}.checks contém campos desconhecidos: ${unexpectedChecks.join(', ')}.`);
    }
  }
  if (!Array.isArray(attempt.notes) || attempt.notes.some((note) => !nonEmptyString(note))) {
    failures.push(`${path}.notes deve ser uma lista de textos não vazios.`);
  } else if (attempt.notes.some((note) => note.length > 500 || /\b[^\s@]+@[^\s@]+\b/u.test(note))) {
    failures.push(`${path}.notes não pode conter e-mail nem texto acima de 500 caracteres.`);
  }
  return failures;
}

export function validateGate1HumanEvidence(evidence) {
  const failures = [];
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return ['A evidência deve ser um objeto JSON.'];
  }
  if (evidence.schemaVersion !== 1) failures.push('schemaVersion deve ser 1.');
  if (evidence.gate !== 'gate-1') failures.push('gate deve ser gate-1.');
  if (!ALLOWED_STATUS.has(evidence.status)) {
    failures.push('status deve ser PENDING, FAILED ou PASSED.');
  }
  const blockers = Array.isArray(evidence.blockers) ? evidence.blockers : [];
  if (!Array.isArray(evidence.blockers) || blockers.some((item) => !nonEmptyString(item))) {
    failures.push('blockers deve ser uma lista de textos não vazios.');
  }
  if (!Array.isArray(evidence.attempts)) {
    failures.push('attempts deve ser uma lista.');
    return failures;
  }

  evidence.attempts.forEach((attempt, index) => {
    failures.push(...validateAttempt(attempt, index));
  });

  if (evidence.status === 'PENDING') {
    if (blockers.length === 0) failures.push('PENDING exige ao menos um bloqueio explícito.');
    if (evidence.attempts.length > 0) failures.push('PENDING não pode conter tentativa executada.');
  }
  if (evidence.status === 'FAILED') {
    if (blockers.length === 0) failures.push('FAILED exige bloqueios observados.');
    if (evidence.attempts.length === 0) failures.push('FAILED exige ao menos uma tentativa humana.');
  }
  if (evidence.status === 'PASSED') {
    if (blockers.length > 0) failures.push('PASSED não pode manter bloqueios.');
    if (evidence.attempts.length === 0) failures.push('PASSED exige ao menos uma tentativa humana.');
    for (const [index, attempt] of evidence.attempts.entries()) {
      for (const check of REQUIRED_CHECKS) {
        if (attempt?.checks?.[check] !== true) {
          failures.push(`PASSED exige attempts[${index}].checks.${check}=true.`);
        }
      }
    }
  }
  return failures;
}

export async function validateEvidenceFile(path) {
  const raw = await readFile(path, 'utf8');
  const evidence = JSON.parse(raw);
  return { evidence, failures: validateGate1HumanEvidence(evidence) };
}

function isMainModule() {
  return Boolean(process.argv[1])
    && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
}

if (isMainModule()) {
  const path = resolve(
    process.argv[2] ?? 'docs/evidence/gate1-human-accessibility.json',
  );
  try {
    const { evidence, failures } = await validateEvidenceFile(path);
    if (failures.length > 0) {
      throw new Error(failures.map((failure) => `- ${failure}`).join('\n'));
    }
    process.stdout.write(
      `Evidência humana do Gate 1 válida: ${evidence.status} (${evidence.attempts.length} tentativa(s)).\n`,
    );
  } catch (error) {
    process.stderr.write(`Evidência humana do Gate 1 inválida:\n${error.message}\n`);
    process.exitCode = 1;
  }
}
