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
