import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { ContractError, analyzeOwnedPaths, normalizeOwnedPath } from './detect-owned-path-conflicts.mjs';

const execFileAsync = promisify(execFile);
const script = fileURLToPath(new URL('./detect-owned-path-conflicts.mjs', import.meta.url));

test('normaliza separadores e prefixos locais sem esconder travessia', () => {
  assert.deepEqual(normalizeOwnedPath('./apps\\web\\page.tsx'), { path: 'apps/web/page.tsx', kind: 'file' });
  assert.deepEqual(normalizeOwnedPath('apps/web/components/'), { path: 'apps/web/components', kind: 'directory' });
  for (const invalid of ['', '/etc/passwd', 'C:\\temp\\x', '../secret', 'apps//page', 'apps/./page', 'a\0b']) {
    assert.throws(() => normalizeOwnedPath(invalid), ContractError);
  }
});

test('aceita frentes disjuntas e produz saída mínima', () => {
  assert.deepEqual(analyzeOwnedPaths({ fronts: [
    { id: 'codex:302', paths: ['scripts/a.mjs'] },
    { id: 'cursor:294', paths: ['docs/quality/b.md'] },
  ] }), { version: 1, status: 'CLEAR', conflicts: [] });
});

test('detecta caminho idêntico entre frentes', () => {
  const result = analyzeOwnedPaths({ fronts: [
    { id: 'codex', paths: ['./apps/web/page.tsx'] },
    { id: 'cursor', paths: ['apps\\web\\page.tsx'] },
  ] });
  assert.equal(result.status, 'CONFLICT');
  assert.deepEqual(result.conflicts, [{ frontA: 'codex', pathA: 'apps/web/page.tsx', frontB: 'cursor', pathB: 'apps/web/page.tsx', type: 'SAME_PATH' }]);
});

test('detecta arquivo dentro de diretório reservado em ambos os sentidos', () => {
  for (const fronts of [
    [{ id: 'a', paths: ['apps/web/'] }, { id: 'b', paths: ['apps/web/page.tsx'] }],
    [{ id: 'a', paths: ['apps/web/page.tsx'] }, { id: 'b', paths: ['apps/web/'] }],
  ]) {
    assert.equal(analyzeOwnedPaths({ fronts }).conflicts[0].type, 'DIRECTORY_CONTAINS_PATH');
  }
});

test('recusa duplicidades internas, ids duplicados e ids potencialmente pessoais', () => {
  assert.throws(() => analyzeOwnedPaths({ fronts: [{ id: 'codex', paths: ['a', './a'] }] }), /duplicou/u);
  assert.throws(() => analyzeOwnedPaths({ fronts: [{ id: 'codex', paths: ['a'] }, { id: 'codex', paths: ['b'] }] }), /duplicado/u);
  assert.throws(() => analyzeOwnedPaths({ fronts: [{ id: 'nome pessoa', paths: ['a'] }] }), /Identificador/u);
});

test('ordem das frentes e paths não altera a saída', () => {
  const first = analyzeOwnedPaths({ fronts: [
    { id: 'z', paths: ['shared/', 'z.ts'] },
    { id: 'a', paths: ['a.ts', 'shared/x.ts'] },
  ] });
  const second = analyzeOwnedPaths({ fronts: [
    { id: 'a', paths: ['shared/x.ts', 'a.ts'] },
    { id: 'z', paths: ['z.ts', 'shared/'] },
  ] });
  assert.deepEqual(first, second);
});

test('ordenação é estável por código Unicode e não depende do locale do executor', () => {
  const result = analyzeOwnedPaths({ fronts: [
    { id: 'z', paths: ['shared/'] },
    { id: 'A', paths: ['shared/x', 'shared/Á'] },
    { id: 'a', paths: ['shared/Z'] },
  ] });
  assert.deepEqual(result.conflicts.map(({ frontA, pathA }) => [frontA, pathA]), [
    ['A', 'shared/x'],
    ['A', 'shared/Á'],
    ['a', 'shared/Z'],
  ]);
});

test('limita cardinalidade antes da análise quadrática', () => {
  const tooManyFronts = Array.from({ length: 129 }, (_, index) => ({ id: `f${index}`, paths: [`p${index}`] }));
  assert.throws(() => analyzeOwnedPaths({ fronts: tooManyFronts }), /limite de 128 frentes/u);

  const tooManyPaths = Array.from({ length: 2_049 }, (_, index) => `p${index}`);
  assert.throws(
    () => analyzeOwnedPaths({ fronts: [{ id: 'codex', paths: tooManyPaths }] }),
    /limite de 2048 owned paths/u,
  );
});

test('CLI usa códigos 0, 1 e 2 sem rede ou shell', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'owned-paths-'));
  try {
    const clear = join(directory, 'clear.json');
    const conflict = join(directory, 'conflict.json');
    const invalid = join(directory, 'invalid.json');
    const missing = join(directory, 'missing.json');
    await writeFile(clear, JSON.stringify({ fronts: [{ id: 'a', paths: ['a'] }, { id: 'b', paths: ['b'] }] }));
    await writeFile(conflict, JSON.stringify({ fronts: [{ id: 'a', paths: ['shared/'] }, { id: 'b', paths: ['shared/file'] }] }));
    await writeFile(invalid, '{');

    assert.match((await execFileAsync(process.execPath, [script, clear])).stdout, /"status": "CLEAR"/u);
    await assert.rejects(execFileAsync(process.execPath, [script, invalid]), (error) => error.code === 1);
    await assert.rejects(execFileAsync(process.execPath, [script, missing]), (error) => {
      assert.equal(error.code, 1);
      assert.equal(error.stderr.trim(), 'Arquivo de entrada não encontrado.');
      assert.doesNotMatch(error.stderr, /missing\.json/u);
      return true;
    });
    await assert.rejects(execFileAsync(process.execPath, [script, conflict]), (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stdout, /"status": "CONFLICT"/u);
      return true;
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
