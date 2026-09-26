import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAccreditationSearch as parse } from '../dist/accreditation-search-policy.js';

test('busca aceita apenas tipos e formatos esperados', () => {
  assert.deepEqual(parse({ kind: 'DOCUMENT', value: '529.982.247-25' }),
    { kind: 'DOCUMENT', value: '52998224725', page: 1 });
  assert.deepEqual(parse({ kind: 'EMAIL', value: ' Pessoa@Exemplo.COM ' }),
    { kind: 'EMAIL', value: 'pessoa@exemplo.com', page: 1 });
  assert.deepEqual(parse({ kind: 'NAME', value: '  Maria   da Silva ' }),
    { kind: 'NAME', value: 'Maria da Silva', page: 1 });
  assert.deepEqual(parse({ kind: 'PROTOCOL', value: 'evo-0123456789abcdef', page: 2 }),
    { kind: 'PROTOCOL', value: 'EVO-0123456789ABCDEF', page: 2 });
});

test('nega curinga, código inesperado, CPF falso, paginação extensa e payload extra', () => {
  for (const input of [
    { kind: 'NAME', value: '%_' },
    { kind: 'NAME', value: "Ana' OR 1=1 --" },
    { kind: 'DOCUMENT', value: '111.111.111-11' },
    { kind: 'DOCUMENT', value: "' OR 1=1 --" },
    { kind: 'EMAIL', value: 'x@exemplo.com; DROP TABLE' },
    { kind: 'PROTOCOL', value: 'EVO-abc' },
    { kind: 'CATEGORY', value: 'x' },
    { kind: 'NAME', value: 'Maria', page: 21 },
    { kind: 'NAME', value: 'Maria', tenantId: 'outro' },
  ]) {
    assert.throws(() => parse(input), { name: 'Error' });
  }
});
