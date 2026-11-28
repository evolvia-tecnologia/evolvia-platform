/**
 * G6.8 — o conversor de conteúdo tem de continuar SEM dependência.
 *
 * POR QUE ISTO É TESTE, e não comentário: `event-communication-content.ts` só
 * pode ser exercitado neste repositório porque não importa nada — nem Nest,
 * nem Prisma, nem irmão. É isso que o torna executável por
 * `node --experimental-strip-types` sem `node_modules`, e é onde a conversão e
 * o escape ficam provados de fato.
 *
 * No dia em que alguém acrescentar um `import` ali — por conveniência, para
 * reaproveitar uma constante do service, por exemplo —, o módulo deixa de rodar
 * nesse modo e os treze casos de `event-communication-content.test.mjs` param
 * de ser executáveis sem banco. A perda seria silenciosa: o arquivo continuaria
 * compilando e o CI continuaria verde pelo resto da suíte.
 *
 * Lê o arquivo como TEXTO, de propósito: importar o módulo não revelaria um
 * import que o bundler resolvesse.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const fonte = readFileSync(new URL('../src/event-communication-content.ts', import.meta.url), 'utf8');

test('o conversor nao importa nada, e por isso roda sem node_modules', () => {
  const imports = [...fonte.matchAll(/^\s*import\b[^\n]*/gmu)].map((m) => m[0].trim());
  assert.deepEqual(imports, [], `o conversor passou a importar: ${imports.join(' | ')}`);
  assert.doesNotMatch(fonte, /\brequire\s*\(/u, 'require() tornaria o modulo nao-puro');
  assert.doesNotMatch(fonte, /\bfrom\s+['"]/u, 'reexport tambem cria dependencia');
});

test('os conjuntos fechados seguem espelhando publication-text-style.ts', () => {
  // Se a politica de entrada ganhar uma fonte, tamanho ou cor e este espelho
  // nao acompanhar, corpo VALIDO passa a ser recusado no envio -- falha que
  // aparece como "nao confiavel" sem ninguem entender por que.
  for (const esperado of ['sans', 'serif']) assert.match(fonte, new RegExp(`'${esperado}'`, 'u'));
  for (const tamanho of [12, 14, 16, 18, 20, 24]) assert.match(fonte, new RegExp(`\\b${tamanho}\\b`, 'u'));
  for (const cor of ['navy', 'navy-soft', 'blue', 'blue-soft', 'text', 'muted', 'success', 'warning', 'danger']) {
    assert.match(fonte, new RegExp(`'${cor}'`, 'u'), `cor ausente do espelho: ${cor}`);
  }
});

test('nenhum valor da entrada e interpolado em atributo de estilo', () => {
  // A assercao de seguranca em forma estatica: o `style` so pode interpolar
  // `trecho.estilo.*`, que saiu dos conjuntos fechados. Interpolar a captura
  // bruta do marcador (`m[1]`, `m[3]`, `marcador`) dentro do style seria a
  // injecao que os mutantes cobrem -- aqui ela tambem nao passa por leitura.
  const styleAttr = /style="[^"]*"/gu;
  for (const trecho of fonte.match(styleAttr) ?? []) {
    assert.doesNotMatch(trecho, /\$\{\s*(?:m\[|marcador|corpo|texto)\b/u,
      `valor cru da entrada interpolado no style: ${trecho}`);
  }
});
