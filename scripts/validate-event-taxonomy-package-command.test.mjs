import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const PACKAGE_JSON_URL = new URL('../package.json', import.meta.url);
const VERSION_URL = new URL('../VERSION', import.meta.url);
const VALIDATOR_RELATIVE = 'scripts/validate-event-taxonomy-contract.mjs';
const OFFICIAL_SCRIPT_NAME = 'validate:event-taxonomy';
const OFFICIAL_SCRIPT_COMMAND = `node ${VALIDATOR_RELATIVE}`;

function quoted(value) {
  return `«${value}»`;
}

function dependencyNames(pkg) {
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ];
}

export function resolveOfficialTaxonomyCommand(pkg) {
  if (pkg == null || typeof pkg !== 'object' || Array.isArray(pkg)) {
    throw new Error('Comando npm ausente: package.json da raiz não declara um objeto de scripts.');
  }

  const names = dependencyNames(pkg);
  if (names.length > 0) {
    throw new Error(
      `Comando npm desviado: o package.json da raiz não pode declarar dependências (${names.join(', ')}).`,
    );
  }

  const scripts = pkg.scripts;
  if (scripts == null || typeof scripts !== 'object' || Array.isArray(scripts)) {
    throw new Error(`Comando npm ausente: ${OFFICIAL_SCRIPT_NAME}.`);
  }

  if (!Object.hasOwn(scripts, OFFICIAL_SCRIPT_NAME)) {
    throw new Error(`Comando npm ausente: ${OFFICIAL_SCRIPT_NAME}.`);
  }

  const command = scripts[OFFICIAL_SCRIPT_NAME];
  if (command !== OFFICIAL_SCRIPT_COMMAND) {
    throw new Error(
      `Comando npm desviado: esperado ${quoted(OFFICIAL_SCRIPT_COMMAND)}, encontrado ${quoted(command)}.`,
    );
  }

  return { name: OFFICIAL_SCRIPT_NAME, command };
}

async function loadRootPackage() {
  return JSON.parse(await readFile(PACKAGE_JSON_URL, 'utf8'));
}

function spawnNpm(args, cwd = REPO_ROOT) {
  return spawnSync('npm', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_TEST_CONTEXT: '',
      npm_config_fund: 'false',
      npm_config_audit: 'false',
    },
  });
}

function spawnNode(args, cwd = REPO_ROOT) {
  return spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_TEST_CONTEXT: '',
    },
  });
}

test('o package.json da raiz expõe o comando oficial do validador #209', async () => {
  const pkg = await loadRootPackage();
  const resolved = resolveOfficialTaxonomyCommand(pkg);
  const version = (await readFile(VERSION_URL, 'utf8')).trim();

  assert.equal(pkg.private, true);
  assert.equal(pkg.version, version);
  assert.equal(resolved.name, OFFICIAL_SCRIPT_NAME);
  assert.equal(resolved.command, OFFICIAL_SCRIPT_COMMAND);
  assert.equal(existsSync(join(REPO_ROOT, VALIDATOR_RELATIVE)), true);
  assert.equal(existsSync(join(REPO_ROOT, 'package-lock.json')), false);
  assert.equal(existsSync(join(REPO_ROOT, 'npm-shrinkwrap.json')), false);
  assert.deepEqual(dependencyNames(pkg), []);
});

test('npm run --help documenta o comando nomeado e o validador #209', () => {
  const help = spawnNpm(['run', '--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /npm run-script <command>/u);
  assert.match(help.stdout, /\[-- <args>\]/u);

  const listed = spawnNpm(['run']);
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, new RegExp(`^\\s*${OFFICIAL_SCRIPT_NAME}$`, 'mu'));
  assert.match(listed.stdout, /^\s*node scripts\/validate-event-taxonomy-contract\.mjs$/mu);
});

test('npm run executa o validador #209 e preserva o código de saída', () => {
  const direct = spawnNode([VALIDATOR_RELATIVE]);
  const viaNpm = spawnNpm(['run', OFFICIAL_SCRIPT_NAME]);

  assert.equal(direct.status, 0, direct.stderr);
  assert.equal(viaNpm.status, direct.status, viaNpm.stderr);
  assert.match(direct.stdout, /19 tipos com exatamente um mapeamento backend/u);
  assert.match(viaNpm.stdout, /19 tipos com exatamente um mapeamento backend/u);
  assert.match(viaNpm.stdout, /node scripts\/validate-event-taxonomy-contract\.mjs/u);
});

test('código de saída não-zero do comando oficial é preservado pelo npm run', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'evolvia-taxonomy-command-'));
  const failingCommand = 'node -e "process.exit(7)"';
  await writeFile(
    join(fixture, 'package.json'),
    `${JSON.stringify({
      name: 'evolvia-taxonomy-command-fixture',
      private: true,
      scripts: {
        [OFFICIAL_SCRIPT_NAME]: failingCommand,
      },
    }, null, 2)}\n`,
  );

  const fixturePkg = JSON.parse(await readFile(join(fixture, 'package.json'), 'utf8'));
  assert.throws(
    () => resolveOfficialTaxonomyCommand(fixturePkg),
    /Comando npm desviado/u,
  );

  const failing = spawnNpm(['run', OFFICIAL_SCRIPT_NAME], fixture);
  assert.equal(failing.status, 7, failing.stderr);
});

test('comando ausente ou desviado falha em PT-BR', async () => {
  const pkg = await loadRootPackage();

  assert.throws(
    () => resolveOfficialTaxonomyCommand({ ...pkg, scripts: undefined }),
    /Comando npm ausente: validate:event-taxonomy/u,
  );
  assert.throws(
    () => resolveOfficialTaxonomyCommand({ ...pkg, scripts: {} }),
    /Comando npm ausente: validate:event-taxonomy/u,
  );
  assert.throws(
    () => resolveOfficialTaxonomyCommand({
      ...pkg,
      scripts: {
        [OFFICIAL_SCRIPT_NAME]: 'node scripts/validate-event-taxonomy-contract.test.mjs',
      },
    }),
    /Comando npm desviado/u,
  );
  assert.throws(
    () => resolveOfficialTaxonomyCommand({
      ...pkg,
      scripts: {
        [OFFICIAL_SCRIPT_NAME]: `${OFFICIAL_SCRIPT_COMMAND} --watch`,
      },
    }),
    /Comando npm desviado/u,
  );
  assert.throws(
    () => resolveOfficialTaxonomyCommand({
      ...pkg,
      dependencies: { leftpad: '1.0.0' },
    }),
    /não pode declarar dependências/u,
  );
});
