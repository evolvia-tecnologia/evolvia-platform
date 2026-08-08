import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SCIENTIFIC_CENTRAL_BLOCKS,
  inferScientificCentralChoice,
  publicScientificCentralBlock,
  readScientificCentralChoice,
  scientificCentralModuleStatus,
} from '../dist/scientific-central-policy.js';

test('Central científica expõe os oito blocos aprovados em português', () => {
  assert.equal(SCIENTIFIC_CENTRAL_BLOCKS.length, 8);
  const labels = SCIENTIFIC_CENTRAL_BLOCKS.map((item) => item.label);
  assert.ok(labels.includes('Grade científica'));
  assert.equal(labels.includes('Estrutura científica'), false);
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

test('Gates A3 e A4 ficam disponíveis e os seguintes continuam em preparação', () => {
  assert.equal(scientificCentralModuleStatus('structure'), 'AVAILABLE');
  assert.equal(scientificCentralModuleStatus('speakers'), 'AVAILABLE');
  assert.equal(scientificCentralModuleStatus('program'), 'PREPARATION_ONLY');

  const structure = publicScientificCentralBlock(SCIENTIFIC_CENTRAL_BLOCKS[0], undefined);
  const speakers = publicScientificCentralBlock(
    SCIENTIFIC_CENTRAL_BLOCKS.find((item) => item.id === 'speakers'),
    undefined,
  );
  const submissions = publicScientificCentralBlock(SCIENTIFIC_CENTRAL_BLOCKS[1], undefined);
  assert.equal(structure.moduleStatus, 'AVAILABLE');
  assert.equal(speakers.moduleStatus, 'AVAILABLE');
  assert.equal(submissions.moduleStatus, 'PREPARATION_ONLY');
});
