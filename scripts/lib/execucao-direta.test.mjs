// Prende a deteccao de execucao direta compartilhada pelos CLIs da Area Master.
//
// Cada caso aqui existe porque a implementacao ingenua que vivia em
// `recuperar-acesso-master.mjs` errava nele:
//
//     import.meta.url.endsWith(process.argv[1].split('/').pop())
//
// Ela dava FALSO quando devia dar verdadeiro (caminho do Windows, onde
// `split('/')` nao separa `\`) e VERDADEIRO quando devia dar falso (qualquer
// modulo homonimo em outra pasta).
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { relative, sep } from 'node:path';
import { chamadoDiretamente } from './execucao-direta.mjs';
import { chamadoDiretamente as doCliDeProvisionamento } from '../provisionar-proprietario-master.mjs';

const esteArquivo = fileURLToPath(import.meta.url);

test('o caminho absoluto deste modulo e execucao direta', () => {
  assert.equal(chamadoDiretamente(import.meta.url, esteArquivo), true);
});

test('caminho relativo ao diretorio atual resolve para o mesmo arquivo', () => {
  const relativo = relative(process.cwd(), esteArquivo);
  assert.notEqual(relativo, esteArquivo, 'o relativo tem de ser diferente do absoluto');
  assert.equal(chamadoDiretamente(import.meta.url, relativo), true);
});

test('homonimo em outra pasta NAO e execucao direta', () => {
  // A versao ingenua comparava so o nome do arquivo e dava true aqui. Este e o
  // falso positivo que ela tinha.
  const homonimo = `${sep}outra${sep}pasta${sep}execucao-direta.test.mjs`;
  assert.notEqual(homonimo, esteArquivo);
  assert.equal(chamadoDiretamente(import.meta.url, homonimo), false);
});

test('separador do Windows no argv nao e tratado como nome de arquivo', () => {
  // Em POSIX nao da para reproduzir o caminho do Windows de verdade, mas da
  // para prender a consequencia que importa: um argv com `\` nao casa com este
  // modulo por acidente, e a funcao decide por caminho resolvido, nao por
  // sufixo de texto.
  assert.equal(chamadoDiretamente(import.meta.url, 'C:\\Evolvia\\scripts\\execucao-direta.test.mjs'), false);
});

test('outro arquivo da mesma pasta nao e execucao direta', () => {
  assert.equal(chamadoDiretamente(import.meta.url, `${esteArquivo}.outro`), false);
});

test('url que nao e file: nao identifica caminho', () => {
  assert.equal(chamadoDiretamente('nao-e-url', esteArquivo), false);
  assert.equal(chamadoDiretamente('https://exemplo.org/x.mjs', esteArquivo), false);
});

test('argv ausente ou nao textual nunca e execucao direta', () => {
  for (const ruim of [undefined, null, '', 0, {}, []]) {
    assert.equal(chamadoDiretamente(import.meta.url, ruim), false, `aceitou ${String(ruim)}`);
  }
  for (const ruim of [undefined, null, '', 42]) {
    assert.equal(chamadoDiretamente(ruim, esteArquivo), false, `aceitou url ${String(ruim)}`);
  }
});

test('os CLIs usam ESTA funcao, e nao copias proprias', () => {
  // Se alguem reintroduzir uma copia local em qualquer dos CLIs, a identidade
  // deixa de casar e este teste cai. E a guarda contra o estado anterior, em
  // que havia duas implementacoes divergentes da mesma decisao.
  assert.equal(doCliDeProvisionamento, chamadoDiretamente);
});
