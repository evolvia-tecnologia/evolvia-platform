/**
 * CL01 — autorização das rotas de `RegistrationOperationsController`.
 *
 * O que estes casos existem para impedir que volte:
 *
 * O controller tinha apenas `AuthGuard`, e o service autorizava por papel com
 * uma lista que incluía OPERATOR. Conferido lendo o código em develop: o único
 * filtro era `requireRole(userId, organizationId, STAFF_ROLES)`. Efeito: um
 * operador com concessão SOMENTE DE LEITURA alterava categoria de inscrição de
 * fato, e baixava o arquivo do comprovante de categoria — documento pessoal de
 * terceiro. Nenhuma das seis rotas estava no mapa de imposição.
 *
 * As seis entraram como `organizador`, e a escolha do TIPO é o ponto. Uma
 * exigência `{ tipo: 'acao' }` seria liberada pelo atalho
 * `if (!escopado) return { permitido: true }` de `decidirAcaoDeOperador`, que
 * existe de propósito para preservar o comportamento do balcão na migração.
 * Em evento sem `operator_scoped_access` — a maioria — o buraco continuaria
 * aberto. O tipo `organizador` não consulta `escopado`, então nega sempre.
 *
 * O caso `nega em evento NÃO escopado` é o que prende essa decisão: ele passa
 * com `organizador` e falha com `acao`. Sem ele, trocar o tipo passaria.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  conferirCoerencia,
  decidirRota,
  METODOS_SO_DE_ORGANIZADOR_DE_OPERACOES,
  ROTAS_DE_OPERACOES,
  ROTAS_DO_BALCAO,
  ROTAS_IMPOSTAS,
  rotasPermitidas,
} from '../src/operator-capability-enforcement.ts';
import { METODOS_SO_DE_ORGANIZADOR } from '../src/operator-capability-policy.ts';

const ROTAS_DE_OPERACOES_ESPERADAS = [
  'GET /registration-operations',
  'POST /registration-operations/search',
  'GET /registration-operations/:protocol/category-options',
  'POST /registration-operations/:protocol/category',
  'POST /registration-operations/:protocol/category-proof',
  'GET /registration-operations/:protocol/category-proof/file',
];

const TODAS_AS_CAPACIDADES = ['credential', 'access_control', 'material_delivery', 'registration'];

const contexto = (papel, { escopado = false, concessoes = [] } = {}) => ({
  papel,
  organizationId: 'org-1',
  eventId: 'evt-1',
  userId: 'u-1',
  capacidadesDoEvento: escopado ? [...TODAS_AS_CAPACIDADES, 'operator_scoped_access'] : [...TODAS_AS_CAPACIDADES],
  concessoes,
});

const concessao = (acao) => ({
  organizationId: 'org-1', eventId: 'evt-1', userId: 'u-1', acao, revogadaEm: null,
});

test('as seis rotas de operações estão mapeadas e exigem organizador', () => {
  // Rota fora do mapa também seria negada, mas por acidente: `rota_nao_mapeada`
  // é indisponibilidade, não política. Estar mapeada é o que torna a negativa
  // uma decisão.
  assert.deepEqual([...ROTAS_DE_OPERACOES_ESPERADAS].sort(), Object.keys(ROTAS_DE_OPERACOES).sort());
  for (const rota of ROTAS_DE_OPERACOES_ESPERADAS) {
    assert.ok(Object.prototype.hasOwnProperty.call(ROTAS_IMPOSTAS, rota), `${rota} fora da união`);
    assert.equal(ROTAS_IMPOSTAS[rota].tipo, 'organizador', `${rota} deixou de exigir organizador`);
  }
});

test('o mapa do balcão continua com as 24 rotas dele, e nenhuma de operações entrou lá', () => {
  // `operator-capability-wiring.test.mjs` afirma que as chaves de
  // ROTAS_DO_BALCAO são EXATAMENTE as rotas marcadas em
  // `event-desk.controller.ts`. Enfiar rota de outro controller ali quebraria
  // aquele teste de segurança. Este caso prende a separação.
  assert.equal(Object.keys(ROTAS_DO_BALCAO).length, 24);
  for (const rota of ROTAS_DE_OPERACOES_ESPERADAS) {
    assert.equal(Object.prototype.hasOwnProperty.call(ROTAS_DO_BALCAO, rota), false,
      `${rota} entrou no mapa do balcão`);
  }
  assert.equal(Object.keys(ROTAS_IMPOSTAS).length, 30, 'a união deixou de ter 24 + 6');
});

test('OPERATOR é negado nas seis, em evento NÃO escopado — é aqui que o tipo importa', () => {
  // Com `{ tipo: 'acao' }` esta asserção falha: o atalho do evento não escopado
  // liberaria. É o caso que prende a decisão de desenho.
  for (const rota of ROTAS_DE_OPERACOES_ESPERADAS) {
    const d = decidirRota(rota, contexto('OPERATOR', { escopado: false }));
    assert.equal(d.permitido, false, `OPERATOR passou em ${rota}`);
    assert.equal(d.motivo, 'rota_exige_organizador', `motivo inesperado em ${rota}`);
    assert.equal(d.escopado, false);
  }
});

test('OPERATOR é negado nas seis também em evento escopado', () => {
  for (const rota of ROTAS_DE_OPERACOES_ESPERADAS) {
    const d = decidirRota(rota, contexto('OPERATOR', { escopado: true }));
    assert.equal(d.permitido, false, `OPERATOR passou em ${rota}`);
    assert.equal(d.motivo, 'rota_exige_organizador');
  }
});

test('nenhuma concessão abre as seis — nem a de leitura, nem a de corrigir inscrição', () => {
  // O achado original em uma frase: operador de LEITURA alterava categoria.
  for (const acao of ['inscricao_ler', 'inscricao_corrigir', 'inscricao_criar', 'buscar', 'relatorio']) {
    for (const rota of ROTAS_DE_OPERACOES_ESPERADAS) {
      for (const escopado of [false, true]) {
        const d = decidirRota(rota, contexto('OPERATOR', { escopado, concessoes: [concessao(acao)] }));
        assert.equal(d.permitido, false, `concessão "${acao}" abriu ${rota} (escopado=${escopado})`);
      }
    }
  }
});

test('VIEWER é negado, e não por falta de concessão', () => {
  for (const rota of ROTAS_DE_OPERACOES_ESPERADAS) {
    const d = decidirRota(rota, contexto('VIEWER', { escopado: true }));
    assert.equal(d.permitido, false, rota);
    assert.equal(d.motivo, 'rota_exige_organizador');
  }
});

test('OWNER, ADMIN e MANAGER conservam acesso às seis', () => {
  // Estreitar organizador aqui seria regressão: é ele quem opera esta tela.
  for (const papel of ['OWNER', 'ADMIN', 'MANAGER']) {
    for (const rota of ROTAS_DE_OPERACOES_ESPERADAS) {
      for (const escopado of [false, true]) {
        const d = decidirRota(rota, contexto(papel, { escopado }));
        assert.equal(d.permitido, true, `${papel} perdeu ${rota} (escopado=${escopado})`);
        assert.equal(d.motivo, null);
      }
    }
  }
});

test('os cinco métodos são exclusivos de organizador, na lista DE OPERACOES', () => {
  // Ficam em `METODOS_SO_DE_ORGANIZADOR_DE_OPERACOES`, e NÃO em
  // `METODOS_SO_DE_ORGANIZADOR`: aquela é dos métodos públicos de
  // `EventDeskService`, e `operator-capability-policy.test.mjs` afirma que
  // catálogo + organizador + `context` cobrem os 24 do balcão. Misturar as duas
  // quebrava aquele invariante e o tornava irrecuperável — método de balcão
  // novo e não classificado passaria a caber na soma sem ninguém notar.
  for (const metodo of ['list', 'categoryOptions', 'changeCategory', 'review', 'readForOrganizer']) {
    assert.ok(METODOS_SO_DE_ORGANIZADOR_DE_OPERACOES.includes(metodo), `${metodo} fora da lista de operações`);
    assert.equal(METODOS_SO_DE_ORGANIZADOR.includes(metodo), false,
      `${metodo} voltou a poluir a lista do balcão`);
  }
});

test('nenhum método de operações fica sem rota, e nenhuma rota sem método', () => {
  // Esta é a recíproca que saiu de `conferirCoerencia`: lá o laço percorre
  // `METODOS_SO_DE_ORGANIZADOR` (o balcão), e passou a não cobrir estes cinco.
  // Sem este caso, acrescentar método à lista e esquecer a rota não acusaria.
  const metodosComRota = new Set(Object.values(ROTAS_DE_OPERACOES).map((e) => e.metodo));
  for (const metodo of METODOS_SO_DE_ORGANIZADOR_DE_OPERACOES) {
    assert.ok(metodosComRota.has(metodo), `método "${metodo}" sem rota em ROTAS_DE_OPERACOES`);
  }
  for (const metodo of metodosComRota) {
    assert.ok(METODOS_SO_DE_ORGANIZADOR_DE_OPERACOES.includes(metodo),
      `rota exige "${metodo}", que não está em METODOS_SO_DE_ORGANIZADOR_DE_OPERACOES`);
  }
});

test('o mapa e o catálogo seguem coerentes', () => {
  assert.deepEqual(conferirCoerencia(), []);
});

test('o balcão não regrediu: o operador conserva o que lhe foi concedido', () => {
  const permitidas = rotasPermitidas(contexto('OPERATOR', {
    escopado: true,
    concessoes: [concessao('checkin'), concessao('inscricao_ler')],
  }));
  assert.ok(permitidas.includes('POST /check-in'), 'check-in concedido deixou de ser permitido');
  assert.ok(permitidas.includes('GET /registrations/:reservationId'), 'leitura de inscrição do balcão regrediu');
  assert.ok(permitidas.includes('GET /'), 'o painel do balcão deixou de abrir');
  for (const rota of ROTAS_DE_OPERACOES_ESPERADAS) {
    assert.equal(permitidas.includes(rota), false, `${rota} vazou para as rotas do operador`);
  }
});

test('rota de operações ainda não escrita nasce negada, inclusive para OWNER', () => {
  const d = decidirRota('POST /registration-operations/:protocol/refund', contexto('OWNER'));
  assert.equal(d.permitido, false);
  assert.equal(d.motivo, 'rota_nao_mapeada');
});
