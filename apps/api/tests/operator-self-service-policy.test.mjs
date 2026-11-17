import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACOES_DE_OPERADOR,
  CODIGO_ESCOPO_OPERADOR,
  PERFIS_DE_OPERADOR,
  acoesPermitidas,
} from '../src/operator-capability-policy.ts';

/**
 * CL02 — a lista que o operador recebe é `acoesPermitidas()` filtrando o
 * catálogo. Este arquivo prova a FUNÇÃO, pura e sem build; a rota HTTP que a
 * entrega é provada em `tests-postgres/operator-self-service-http.postgres.test.mjs`.
 *
 * Os dois níveis existem porque erram diferente: aqui se pega regra errada,
 * lá se pega fiação errada. Nenhum dos dois substitui o outro.
 */

const TODAS = Object.keys(ACOES_DE_OPERADOR);
const TODAS_AS_CAPACIDADES = ['credential', 'access_control', 'material_delivery', 'registration'];

const pedido = (extra = {}) => ({
  papel: 'OPERATOR',
  organizationId: 'org',
  eventId: 'evento',
  userId: 'ator',
  capacidadesDoEvento: [...TODAS_AS_CAPACIDADES, CODIGO_ESCOPO_OPERADOR],
  concessoes: [],
  ...extra,
});

const concessoes = (acoes, extra = {}) =>
  acoes.map((acao) => ({ organizationId: 'org', eventId: 'evento', userId: 'ator', acao, revogadaEm: null, ...extra }));

test('operador sem concessão em evento escopado não pode nada', () => {
  assert.deepEqual(acoesPermitidas(pedido()), [], 'deny-by-default');
});

test('a lista é exatamente o concedido, sem a ação sensível vizinha', () => {
  const lista = acoesPermitidas(pedido({ concessoes: concessoes(['checkin', 'credencial_imprimir']) }));
  assert.deepEqual([...lista].sort(), ['checkin', 'credencial_imprimir']);
  assert.ok(!lista.includes('checkin_reverter'), 'reverter é concessão separada');
  assert.ok(!lista.includes('credencial_reimprimir'), 'reimprimir é concessão separada');
});

test('capacidade desligada no evento tira a ação mesmo havendo concessão', () => {
  const lista = acoesPermitidas(pedido({
    capacidadesDoEvento: ['access_control', CODIGO_ESCOPO_OPERADOR],
    concessoes: concessoes(['checkin', 'credencial_imprimir']),
  }));
  assert.deepEqual(lista, ['checkin'], 'sem `credential`, imprimir não pode ser prometido');
});

test('papel sem acesso ao balcão não pode nada, nem com o catálogo inteiro concedido', () => {
  for (const papel of ['VIEWER', 'MEMBER']) {
    assert.deepEqual(acoesPermitidas(pedido({ papel, concessoes: concessoes(TODAS) })), [], papel);
  }
});

test('organizador não depende de concessão, mas depende da capacidade do evento', () => {
  for (const papel of ['OWNER', 'ADMIN', 'MANAGER']) {
    assert.deepEqual([...acoesPermitidas(pedido({ papel }))].sort(), [...TODAS].sort(), `${papel} com tudo ativo`);
    const semCredencial = acoesPermitidas(pedido({
      papel,
      capacidadesDoEvento: ['access_control', 'material_delivery', 'registration', CODIGO_ESCOPO_OPERADOR],
    }));
    assert.ok(!semCredencial.includes('credencial_imprimir'), `${papel} não promete ação de capacidade desligada`);
  }
});

test('evento não escopado preserva o comportamento de hoje', () => {
  const lista = acoesPermitidas(pedido({ capacidadesDoEvento: TODAS_AS_CAPACIDADES }));
  assert.deepEqual([...lista].sort(), [...TODAS].sort(), 'sem a capacidade de escopo, nada é estreitado');
});

test('concessão revogada, de outro evento, de outra organização ou de outra pessoa não conta', () => {
  const estranhas = [
    concessoes(['checkin'], { revogadaEm: new Date() }),
    concessoes(['checkin'], { eventId: 'outro' }),
    concessoes(['checkin'], { organizationId: 'outra' }),
    concessoes(['checkin'], { userId: 'outra-pessoa' }),
  ];
  for (const lote of estranhas) {
    assert.deepEqual(acoesPermitidas(pedido({ concessoes: lote })), [], JSON.stringify(lote));
  }
});

// O invariante que importa para a interface: cada perfil predefinido entrega
// exatamente o que promete, nem mais. Se um perfil passar a conceder a ação
// sensível vizinha sem ninguém notar, isto reprova.
test('cada perfil predefinido entrega exatamente as ações que declara', () => {
  for (const [nome, acoes] of Object.entries(PERFIS_DE_OPERADOR)) {
    const lista = acoesPermitidas(pedido({ concessoes: concessoes([...acoes]) }));
    assert.deepEqual([...lista].sort(), [...acoes].sort(), `perfil ${nome}`);
  }
});

test('todo perfil predefinido usa ação que existe no catálogo', () => {
  for (const [nome, acoes] of Object.entries(PERFIS_DE_OPERADOR)) {
    for (const acao of acoes) {
      assert.ok(TODAS.includes(acao), `perfil ${nome} declara "${acao}", que não existe no catálogo`);
    }
  }
});
