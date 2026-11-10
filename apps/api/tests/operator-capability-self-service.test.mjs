import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Este teste lê CÓDIGO-FONTE como texto, e isso é deliberado: controller e
 * service têm decorators, e o Node não os parseia, logo os arquivos não podem
 * ser importados aqui.
 *
 * O que ele protege: `events/:eventId/operators` é um controller de governança,
 * e a regra da classe é "exige organizador". A rota de autoatendimento
 * `me/capabilities` é a ÚNICA exceção, de propósito — negar a alguém a lista do
 * que ele mesmo pode fazer não protege nada, só obriga a interface a adivinhar.
 *
 * Mas exceção confiada a comentário é exceção que se multiplica. Então a lista
 * de exceções vive aqui, e qualquer método novo do service que não passe por um
 * portão de autorização reprova. O invariante fica verificado por máquina.
 *
 * Nota sobre o limite deste tipo de teste: ele não distingue código de
 * comentário. Por isso as asserções abaixo olham CHAMADA (`nome(`), e a
 * proibição, quando existe, vale para o arquivo inteiro.
 */

const SERVICE = new URL('../src/operator-capability.service.ts', import.meta.url);
const CONTROLLER = new URL('../src/operator-capability.controller.ts', import.meta.url);
const servico = readFileSync(SERVICE, 'utf8');
const controller = readFileSync(CONTROLLER, 'utf8');

/** Métodos que PODEM dispensar organizador, e o motivo de cada um. */
const AUTOATENDIMENTO = new Set(['minhasAcoes']);

/**
 * Portões aceitos: exigir organizador, levar o papel do ator à política, ou
 * delegar a quem faz uma dessas coisas.
 *
 * `this.gerir(` entra na lista porque `conceder` e `revogar` são uma linha cada
 * e o portão está em `gerir`. E `gerir` NÃO fica dispensado por isso: ele
 * próprio é conferido abaixo, e precisa ter um portão de verdade. A cadeia é
 * verificada inteira, em vez de a delegação virar desculpa.
 */
const PORTOES = ['exigirOrganizador(', 'decidirGestaoDeConcessao(', 'this.gerir('];

/**
 * Dispensados, com o motivo: estes dois SÃO a máquina do portão.
 * `contexto` resolve o 404 de quem não é membro e nada mais; `exigirOrganizador`
 * é o próprio portão. Conferir portão dentro do portão seria circular.
 */
const AUXILIARES = new Set(['contexto', 'exigirOrganizador', 'constructor']);

function metodos(fonte) {
  const linhas = fonte.split('\n');
  const inicios = [];
  for (const [i, linha] of linhas.entries()) {
    const m = linha.match(/^ {2}(?:private )?(?:async )?([a-zA-Z][A-Za-z0-9_]*)\(/u);
    if (m) inicios.push({ nome: m[1], linha: i });
  }
  return inicios.map((inicio, i) => ({
    nome: inicio.nome,
    corpo: linhas.slice(inicio.linha, inicios[i + 1]?.linha ?? linhas.length).join('\n'),
  }));
}

const doServico = metodos(servico);

test('o reconhecimento de métodos funciona: achou os que se sabe que existem', () => {
  const nomes = doServico.map((m) => m.nome);
  for (const esperado of ['painel', 'historico', 'conceder', 'revogar', 'minhasAcoes', 'contexto', 'exigirOrganizador']) {
    assert.ok(nomes.includes(esperado), `não achei o método ${esperado}: o teste abaixo não significaria nada`);
  }
});

test('todo método público do service passa por um portão de autorização, menos o autoatendimento declarado', () => {
  for (const { nome, corpo } of doServico) {
    if (AUXILIARES.has(nome)) continue;
    if (AUTOATENDIMENTO.has(nome)) continue;
    assert.ok(
      PORTOES.some((portao) => corpo.includes(portao)),
      `${nome} não chama nenhum portão de autorização (${PORTOES.join(' ou ')}). `
      + 'Se for autoatendimento de propósito, acrescente o nome ao conjunto AUTOATENDIMENTO deste teste, '
      + 'com o motivo escrito — não remova a asserção.',
    );
  }
});

test('o autoatendimento continua sendo autoatendimento: não exige organizador', () => {
  const alvo = doServico.find((m) => m.nome === 'minhasAcoes');
  assert.ok(alvo);
  assert.ok(
    !alvo.corpo.includes('exigirOrganizador('),
    'minhasAcoes passou a exigir organizador: o operador deixaria de saber o que pode fazer',
  );
});

test('o autoatendimento ainda recusa quem não é membro ativo da organização', () => {
  const alvo = doServico.find((m) => m.nome === 'minhasAcoes');
  assert.ok(
    alvo.corpo.includes('this.contexto('),
    'sem this.contexto() a rota responderia a qualquer pessoa e viraria sonda de existência de evento',
  );
});

test('o autoatendimento decide pela política, não por regra própria', () => {
  const alvo = doServico.find((m) => m.nome === 'minhasAcoes');
  assert.ok(
    alvo.corpo.includes('acoesPermitidas('),
    'a lista tem de vir da mesma política que o balcão aplica; regra paralela divergiria',
  );
  assert.ok(
    alvo.corpo.includes('contexto.papel'),
    'o papel do ator tem de entrar na decisão',
  );
});

test('a lista entregue é filtrada: nunca o catálogo inteiro', () => {
  const alvo = doServico.find((m) => m.nome === 'minhasAcoes');
  assert.match(
    alvo.corpo,
    /catalogoParaInterface\(\)\.filter\(/u,
    'catálogo sem filtro mostraria ao operador ações que o servidor vai recusar',
  );
});

test('a rota de autoatendimento existe, é GET e delega ao service', () => {
  assert.match(controller, /@Get\('me\/capabilities'\)/u, 'rota de autoatendimento ausente');
  assert.match(controller, /minhasAcoes\(@Req\(\)[^)]*\)[^{]*\{\s*return this\.capacidades\.minhasAcoes\(/su);
  // Autoatendimento é leitura. Se algum dia virar POST, a exceção de
  // autorização deixaria de ser inofensiva.
  assert.doesNotMatch(controller, /@Post\('me\//u, 'autoatendimento não escreve nada');
});

test('o controller inteiro está sob o AuthGuard: autoatendimento não é rota anônima', () => {
  const m = controller.match(/@UseGuards\(([^)]*)\)/u);
  assert.ok(m, 'não achei @UseGuards no controller');
  assert.deepEqual(m[1].split(',').map((g) => g.trim()), ['AuthGuard']);
});

test('o autoatendimento resolve a identidade pelo TOKEN, nunca pela URL', () => {
  // Esta asserção já nasceu errada uma vez: a primeira versão procurava
  // `@Param('userId')` dentro da lista de parâmetros com `[^)]*`, que para no
  // primeiro `)` — e `@Req()` tem um. A regex nunca atravessava a lista, então
  // o teste não podia falhar. Uma mutação que trocava a identidade pela da URL
  // passou verde. Daí a forma abaixo: recorta o bloco do handler por índice,
  // sem regex de parênteses, e exige a delegação exata.
  const inicio = controller.indexOf("@Get('me/capabilities')");
  assert.notEqual(inicio, -1, 'rota de autoatendimento ausente');
  const resto = controller.slice(inicio + 1);
  const proximo = resto.search(/@(?:Get|Post|Put|Patch|Delete)\(/u);
  const bloco = proximo === -1 ? resto : resto.slice(0, proximo);

  assert.ok(
    bloco.includes('return this.capacidades.minhasAcoes(request.user!.id, eventId);'),
    'o ator tem de ser o do token: `request.user!.id`, e nada mais',
  );
  assert.ok(
    !bloco.includes("@Param('userId')"),
    'aceitar userId da URL deixaria um operador consultar a lista de outro',
  );
});

test('o recorte do bloco funciona: ele realmente contém só este handler', () => {
  // Sem esta conferência, um recorte vazio faria o teste acima passar por
  // vacuidade — o mesmo tipo de verde falso que ele existe para evitar.
  const inicio = controller.indexOf("@Get('me/capabilities')");
  const resto = controller.slice(inicio + 1);
  const proximo = resto.search(/@(?:Get|Post|Put|Patch|Delete)\(/u);
  const bloco = proximo === -1 ? resto : resto.slice(0, proximo);
  assert.ok(bloco.includes('minhasAcoes'), 'o bloco recortado tem de conter o handler');
  assert.ok(!bloco.includes('grants'), 'o bloco não pode invadir as rotas de concessão');
  assert.ok(bloco.length > 80 && bloco.length < 600, `recorte suspeito: ${bloco.length} bytes`);
});
