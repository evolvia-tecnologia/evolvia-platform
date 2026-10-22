import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const matrix = JSON.parse(read('docs/governance/GATES_STATUS.json'));
assert.equal(matrix.gates.length, 11);
assert.match(matrix.sourceSha, /^[a-f0-9]{40}$/, 'sourceSha global inválido');
const ids = new Set();
let integrated = 0, criteria = 0;
for (const gate of matrix.gates) {
  let points = 0, count = 0;
  for (const item of gate.criteria) {
    assert.ok(!ids.has(item.id), 'Critério duplicado: ' + item.id);
    ids.add(item.id);
    for (const key of ['integrated', 'ci', 'deployed', 'accepted']) {
      assert.equal(typeof item[key], 'boolean', item.id + ': ' + key);
      points += Number(item[key]);
    }
    if (item.integrated) count++;
    if (item.ci) assert.match(item.ciSourceSha, /^[a-f0-9]{40}$/);
    if (item.deployed) assert.match(item.deployedSourceSha, /^[a-f0-9]{40}$/);
    if (item.accepted) assert.ok(item.evidence, 'F exige evidência');
  }
  assert.equal(gate.total, gate.criteria.length * 4);
  assert.equal(gate.points, points);
  assert.ok(Math.abs(gate.percent - points / gate.total * 100) < 1e-9);
  assert.ok(Math.abs(gate.implementationPercent - count / gate.criteria.length * 100) < 1e-9);
  integrated += count; criteria += gate.criteria.length;
}
assert.equal(criteria, 93);
assert.equal(matrix.criteriaCount, criteria);
assert.equal(matrix.integratedCriteria, integrated);
for (const [key, field] of [['globalPercent', 'percent'], ['globalImplementationPercent', 'implementationPercent']]) {
  assert.ok(Math.abs(matrix[key] - matrix.gates.reduce((sum, g) => sum + g[field], 0) / matrix.gates.length) < 1e-9);
}
const fmt = number => number.toFixed(1).replace('.', ',');
const summary = 'Implementação **' + fmt(matrix.globalImplementationPercent) + '%**; conclusão comprovada **' + fmt(matrix.globalPercent) + '%**; **' + integrated + '/93** unidades integradas; **0/11 Gates encerrados**.';
for (const path of ['GATES_STATUS.md', 'PROJECT_STATE.md', 'BACKLOG.md', 'EVOLVIA_MASTER_CODEX.md']) {
  const text = read('docs/governance/' + path);
  assert.ok(text.includes(summary), path + ': resumo divergente');
  assert.ok(text.includes(matrix.sourceSha), path + ': SHA ausente');
}
const projectState = read('docs/governance/PROJECT_STATE.md');
const frontMatter = projectState.match(/^---\n([\s\S]*?)\n---\n/u);
assert.ok(frontMatter, 'PROJECT_STATE: front matter YAML ausente');
assert.doesNotMatch(frontMatter[1], /^#/mu, 'PROJECT_STATE: markdown dentro do front matter');
for (const line of frontMatter[1].split('\n')) {
  if (!line.trim()) continue;
  assert.match(line, /^[a-z_]+:\s+\S/u, 'PROJECT_STATE: linha de YAML inválida: ' + line);
}

const markdown = read('docs/governance/GATES_STATUS.md');
for (const g of matrix.gates) {
  const row = '| ' + g.id + ' | ' + g.name + ' | ' + fmt(g.implementationPercent) + '% | ' + fmt(g.percent) + '% | ' + g.points + '/' + g.total + ' |';
  assert.ok(markdown.includes(row), 'Tabela divergente G' + g.id);
  for (const item of g.criteria) assert.ok(markdown.includes('| ' + item.id + ' — '), 'Critério ausente: ' + item.id);
}
console.log('Gates: 93 critérios, 11 Gates, cálculos e quatro documentos consistentes.');
