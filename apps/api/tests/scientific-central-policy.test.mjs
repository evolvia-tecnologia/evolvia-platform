import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SCIENTIFIC_CENTRAL_BLOCKS,
  inferScientificCentralChoice,
  publicScientificCentralBlock,
  readScientificCentralChoice,
} from '../dist/scientific-central-policy.js';

test('Central científica expõe os oito blocos aprovados em português', () => {
  assert.equal(SCIENTIFIC_CENTRAL_BLOCKS.length, 8);
  const labels = SCIENTIFIC_CENTRAL_BLOCKS.map((item) => item.label);
  assert.ok(labels.includes('Palestrantes e convidados'));
  assert.ok(labels.includes('Espaços e programação científica'));
  assert.ok(labels.includes('Trabalhos e submissões'));
  assert.ok(labels.includes('Avaliação científica'));
  assert.equal(labels.some((label) => /show|festival|expositor/i.test(label)), false);
});

test('capability científica ativa anterior à Central é reconhecida como recomendação', () => {
  assert.equal(
    inferScientificCentralChoice({ status: 'ACTIVE', config: {} }),
    'RECOMMENDED',
  );
});

test('decisão explícita da Central prevalece sobre estado legado', () => {
  assert.equal(readScientificCentralChoice({ centralChoice: 'LATER' }), 'LATER');
  const block = publicScientificCentralBlock(
    SCIENTIFIC_CENTRAL_BLOCKS[0],
    { status: 'DISABLED', config: { centralChoice: 'LATER' } },
  );
  assert.equal(block.choice, 'LATER');
  assert.equal(block.active, false);
  assert.equal(block.decisionStatus, 'LATER');
});

test('bloco sem decisão permanece pendente e não promete módulo funcional', () => {
  const block = publicScientificCentralBlock(SCIENTIFIC_CENTRAL_BLOCKS[0], undefined);
  assert.equal(block.choice, null);
  assert.equal(block.decisionStatus, 'PENDING');
  assert.equal(block.moduleStatus, 'PREPARATION_ONLY');
});
