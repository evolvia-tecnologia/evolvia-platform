import assert from 'node:assert/strict';
import test from 'node:test';
import { ScientificTaxonomyLevel } from '@prisma/client';
import {
  normalizeScientificText,
  scientificCodeBase,
  taxonomyParentError,
} from '../dist/scientific-structure-policy.js';

test('normaliza textos científicos sem espaços duplicados', () => {
  assert.equal(normalizeScientificText('  Comissão   Científica  ', 120), 'Comissão Científica');
});

test('gera base técnica sem expor acentos ou caracteres especiais', () => {
  assert.equal(scientificCodeBase('Área de Saúde & Inovação'), 'AREA_DE_SAUDE_INOVACAO');
});

test('área não aceita pai', () => {
  assert.equal(taxonomyParentError(ScientificTaxonomyLevel.AREA, null), null);
  assert.ok(taxonomyParentError(ScientificTaxonomyLevel.AREA, ScientificTaxonomyLevel.AREA));
});

test('subárea exige área como pai', () => {
  assert.equal(
    taxonomyParentError(ScientificTaxonomyLevel.SUBAREA, ScientificTaxonomyLevel.AREA),
    null,
  );
  assert.ok(taxonomyParentError(ScientificTaxonomyLevel.SUBAREA, null));
});

test('tema exige subárea como pai', () => {
  assert.equal(
    taxonomyParentError(ScientificTaxonomyLevel.TOPIC, ScientificTaxonomyLevel.SUBAREA),
    null,
  );
  assert.ok(taxonomyParentError(ScientificTaxonomyLevel.TOPIC, ScientificTaxonomyLevel.AREA));
});
