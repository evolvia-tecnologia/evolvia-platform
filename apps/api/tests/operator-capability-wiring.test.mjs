import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROTAS_DO_BALCAO } from '../src/operator-capability-enforcement.ts';

/**
 * Este é o único teste do corte que lê CÓDIGO-FONTE como texto, e isso é
 * deliberado: `event-desk.controller.ts` tem decorators, e o Node não os
 * parseia, logo o arquivo não pode ser importado aqui. Sem este teste, nada
 * detectaria um handler do balcão sem `@RotaDoBalcaoMarcada(...)`.
 *
 * O defeito que ele pega falha FECHADO — guard sem marca nega —, então não é
 * brecha de segurança, é indisponibilidade: a rota passa a devolver 403 para
 * todo mundo, inclusive o organizador. É um defeito que se quer ver no CI e não
 * no balcão, com fila de gente esperando.
 */

const CONTROLLER = new URL('../src/event-desk.controller.ts', import.meta.url);
const GUARD = new URL('../src/operator-capability.guard.ts', import.meta.url);
const fonte = readFileSync(CONTROLLER, 'utf8');
const fonteGuard = readFileSync(GUARD, 'utf8');

const marcadas = [...fonte.matchAll(/@RotaDoBalcaoMarcada\('([^']+)'\)/gu)].map((m) => m[1]);
const handlers = [...fonte.matchAll(/^ {2}(?:async )?([a-zA-Z][A-Za-z0-9_]*)\(/gmu)]
  .map((m) => m[1])
  .filter((n) => n !== 'constructor');

test('o controller do balcão está sob o guard de capacidades, depois do AuthGuard', () => {
  const m = fonte.match(/@UseGuards\(([^)]*)\)/u);
  assert.ok(m, 'não achei @UseGuards no controller');
  const guards = m[1].split(',').map((g) => g.trim());
  assert.deepEqual(guards, ['AuthGuard', 'OperatorCapabilityGuard'], 'ordem importa: o Auth precisa rodar antes');
});

test('todo handler do balcão declara a rota que atende', () => {
  assert.equal(
    marcadas.length,
    handlers.length,
    `${handlers.length} handlers e ${marcadas.length} decoradores: algum método ficou sem @RotaDoBalcaoMarcada`,
  );
});

test('nenhuma rota é declarada duas vezes', () => {
  const repetidas = marcadas.filter((r, i) => marcadas.indexOf(r) !== i);
  assert.deepEqual(repetidas, []);
});

test('toda rota declarada no controller existe no mapa de rotas', () => {
  for (const rota of marcadas) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(ROTAS_DO_BALCAO, rota),
      `o controller declara "${rota}", que não existe em ROTAS_DO_BALCAO`,
    );
  }
});

test('toda rota do mapa é atendida por algum handler do controller', () => {
  for (const rota of Object.keys(ROTAS_DO_BALCAO)) {
    assert.ok(marcadas.includes(rota), `ROTAS_DO_BALCAO tem "${rota}", que nenhum handler declara`);
  }
});

test('o mapa e o controller têm exatamente o mesmo conjunto de rotas', () => {
  assert.deepEqual([...marcadas].sort(), Object.keys(ROTAS_DO_BALCAO).sort());
});

test('o guard nega quando a rota não está marcada, em vez de liberar', () => {
  // o ramo precisa existir e precisa lançar, nao devolver true
  const trecho = fonteGuard.match(/if \(!ehRotaDoBalcao\(rota\)\) \{[\s\S]{0,240}?\n {4}\}/u);
  assert.ok(trecho, 'não achei o ramo de rota não marcada no guard');
  assert.match(trecho[0], /throw new ForbiddenException/u);
  assert.doesNotMatch(trecho[0], /return true/u);
});

test('o guard responde 404, e não 403, quando revelar o evento já seria vazamento', () => {
  assert.match(
    fonteGuard,
    /motivo === 'papel_sem_acesso_ao_balcao' \|\| decisao\.motivo === 'capacidade_do_evento_inativa'/u,
    'os dois motivos que não devem vazar existência precisam cair em NotFound',
  );
  // e a mensagem precisa ser a mesma que o service ja usa, senao vaza pela diferenca
  assert.equal((fonteGuard.match(/NotFoundException\('Evento não encontrado\.'\)/gu) || []).length, 4);
});

test('o guard só concede por um caminho explícito', () => {
  const retornosVerdadeiros = (fonteGuard.match(/return true;/gu) || []).length;
  assert.equal(retornosVerdadeiros, 1, 'mais de um return true no guard é caminho de concessão a mais');
  assert.match(fonteGuard, /if \(decisao\.permitido\) return true;/u);
});

// ---------------------------------------------------------------------------
// Fiacao do controller de GESTAO, que e outra coisa que o balcao
// ---------------------------------------------------------------------------

const GESTAO = new URL('../src/operator-capability.controller.ts', import.meta.url);
const SERVICE = new URL('../src/operator-capability.service.ts', import.meta.url);
const fonteGestao = readFileSync(GESTAO, 'utf8');
const fonteService = readFileSync(SERVICE, 'utf8');

test('o controller de gestão NÃO usa o guard do balcão — seria circular', () => {
  // com o guard do balcao aqui, ninguem conseguiria conceder a primeira permissao.
  // o comentario do arquivo PODE cita-lo para explicar por que nao o usa; o que
  // nao pode e ele aparecer em import ou em @UseGuards.
  const importes = [...fonteGestao.matchAll(/^import .*$/gmu)].map((m) => m[0]).join('\n');
  assert.doesNotMatch(importes, /OperatorCapabilityGuard/u, 'gestão importou o guard do balcão');
  const guards = fonteGestao.match(/@UseGuards\(([^)]*)\)/u);
  assert.ok(guards, 'o controller de gestão precisa de algum guard');
  assert.deepEqual(
    guards[1].split(',').map((g) => g.trim()),
    ['AuthGuard'],
    'gestão fica sob AuthGuard; quem exige organizador é o service',
  );
});

test('o controller de gestão fica fora do caminho do balcão', () => {
  const prefixo = fonteGestao.match(/@Controller\('([^']*)'\)/u);
  assert.ok(prefixo);
  assert.equal(prefixo[1], 'events/:eventId/operators');
  assert.doesNotMatch(prefixo[1], /desk/u, 'gestão de permissão não é operação de balcão');
});

test('gestão e autoatendimento delegam ao service com conjunto explícito de handlers', () => {
  // o service e quem exige organizador; um handler que chamasse o repositorio
  // direto pularia essa exigencia
  assert.doesNotMatch(fonteGestao, /Repository/u);
  const handlers = [...fonteGestao.matchAll(/^ {2}(?:async )?([a-zA-Z][A-Za-z0-9_]*)\(/gmu)]
    .map((m) => m[1])
    .filter((n) => n !== 'constructor');
  assert.deepEqual([...handlers].sort(), ['conceder', 'historico', 'minhasAcoes', 'painel', 'revogar']);
  for (const h of handlers) {
    assert.match(fonteGestao, new RegExp(`this\\.capacidades\\.${h}\\(`, 'u'), `${h} não delega ao service`);
  }
});

test('as rotas de gestão exigem organizador; autoatendimento tem contrato próprio', () => {
  // leitura: painel e historico passam por exigirOrganizador
  assert.equal((fonteService.match(/this\.exigirOrganizador\(/gu) || []).length, 2);
  // escrita: conceder e revogar passam pela politica pura, que exige organizador
  assert.match(fonteService, /decidirGestaoDeConcessao\(\{/u);
  assert.equal((fonteService.match(/decidirGestaoDeConcessao\(/gu) || []).length, 1);
  // e as duas escritas convergem no mesmo metodo, para nao divergirem
  assert.match(fonteService, /return this\.gerir\('conceder',/u);
  assert.match(fonteService, /return this\.gerir\('revogar',/u);
});

test('o service não vaza existência do evento a quem não é membro', () => {
  assert.match(fonteService, /NotFoundException\('Evento não encontrado\.'\)/u);
  assert.equal((fonteService.match(/NotFoundException\(/gu) || []).length, 1);
});
