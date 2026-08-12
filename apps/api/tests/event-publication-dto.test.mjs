import assert from 'node:assert/strict';
import test from 'node:test';
import { validate } from 'class-validator';
import {
  CreateEventPublicationSectionDto,
  ReorderEventPublicationSectionsDto,
  RemoveEventPublicationSectionDto,
  UpdateEventPublicationSectionDto,
} from '../dist/event-publication/event-publication.dto.js';

function hydrate(Type, payload) {
  return Object.assign(new Type(), payload);
}

async function errors(Type, payload) {
  return validate(hydrate(Type, payload));
}

test('reorder aceita snapshot coerente de ids e revisions', async () => {
  const result = await errors(ReorderEventPublicationSectionsDto, {
    sectionIds: ['sec_1', 'sec_2'],
    sectionRevisions: [1, 4],
  });

  assert.equal(result.length, 0);
});

test('reorder rejeita revision menor que 1 e valores não inteiros', async () => {
  const zero = await errors(ReorderEventPublicationSectionsDto, {
    sectionIds: ['sec_1'],
    sectionRevisions: [0],
  });
  assert.ok(zero.some((error) => error.property === 'sectionRevisions'));

  const decimal = await errors(ReorderEventPublicationSectionsDto, {
    sectionIds: ['sec_1'],
    sectionRevisions: [1.5],
  });
  assert.ok(decimal.some((error) => error.property === 'sectionRevisions'));
});

test('reorder limita o lote a 50 seções e exige arrays tipados', async () => {
  const tooMany = await errors(ReorderEventPublicationSectionsDto, {
    sectionIds: Array.from({ length: 51 }, (_, index) => `sec_${index}`),
    sectionRevisions: Array.from({ length: 51 }, () => 1),
  });
  assert.ok(tooMany.some((error) => error.property === 'sectionIds'));
  assert.ok(tooMany.some((error) => error.property === 'sectionRevisions'));

  const malformed = await errors(ReorderEventPublicationSectionsDto, {
    sectionIds: ['sec_1', 123],
    sectionRevisions: [1, '2'],
  });
  assert.ok(malformed.some((error) => error.property === 'sectionIds'));
  assert.ok(malformed.some((error) => error.property === 'sectionRevisions'));
});

test('create section rejeita kind desconhecido, sortOrder negativo e source type inválido', async () => {
  const result = await errors(CreateEventPublicationSectionDto, {
    kind: 'HTML',
    enabled: true,
    sortOrder: -1,
    content: {},
    canonicalSourceType: 'OUTRO',
    canonicalSourceId: 'abc',
  });

  assert.ok(result.some((error) => error.property === 'kind'));
  assert.ok(result.some((error) => error.property === 'sortOrder'));
  assert.ok(result.some((error) => error.property === 'canonicalSourceType'));
});

test('update e remove exigem revision positiva', async () => {
  const update = await errors(UpdateEventPublicationSectionDto, { revision: 0 });
  const remove = await errors(RemoveEventPublicationSectionDto, { revision: 0 });

  assert.ok(update.some((error) => error.property === 'revision'));
  assert.ok(remove.some((error) => error.property === 'revision'));
});
