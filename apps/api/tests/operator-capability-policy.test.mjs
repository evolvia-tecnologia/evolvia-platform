import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACOES_DE_OPERADOR,
  ACAO_SEMPRE_LIBERADA_PARA_STAFF,
  CAPACIDADES_DE_EVENTO,
  CODIGO_ESCOPO_OPERADOR,
  EntradaInvalida,
  METODOS_SO_DE_ORGANIZADOR,
  acoesPermitidas,
  decidirAcaoDeOperador,
  ehAcaoDeOperador,
  montarAuditoria,
  normalizarConcessao,
} from '../src/operator-capability-policy.ts';

const ORG = 'org-1';
const EVT = 'evt-1';
const USR = 'usr-1';

const TODAS = ['credential', 'access_control', 'material_delivery', 'registration'];
const ESCOPADO = [...TODAS, CODIGO_ESCOPO_OPERADOR];

function pedido(over = {}) {
  return {
    papel: 'OPERATOR',
    acao: 'checkin',
    organizationId: ORG,
    eventId: EVT,
    userId: USR,
    capacidadesDoEvento: ESCOPADO,
    concessoes: [],
    ...over,
  };
}

const conceder = (acao, over = {}) => ({
  organizationId: ORG,
  eventId: EVT,
  userId: USR,
  acao,
  revogadaEm: null,
  ...over,
});

// ---------------------------------------------------------------------------
// 1. deny-by-default
// ---------------------------------------------------------------------------

test('ação desconhecida é negada, não ignorada', () => {
  const d = decidirAcaoDeOperador(pedido({ acao: 'apagar_tudo' }));
  assert.equal(d.permitido, false);
  assert.equal(d.motivo, 'acao_desconhecida');
});

test('evento escopado sem concessão nega, mesmo com a capacidade do evento ativa', () => {
  const d = decidirAcaoDeOperador(pedido({ concessoes: [] }));
  assert.equal(d.permitido, false);
  assert.equal(d.motivo, 'sem_concessao_para_a_acao');
  assert.equal(d.escopado, true);
});

test('VIEWER nunca alcança o balcão, nem com concessão gravada', () => {
  const d = decidirAcaoDeOperador(pedido({ papel: 'VIEWER', concessoes: [conceder('checkin')] }));
  assert.equal(d.permitido, false);
  assert.equal(d.motivo, 'papel_sem_acesso_ao_balcao');
});

test('ação exclusiva de organizador é negada com motivo próprio', () => {
  for (const metodo of METODOS_SO_DE_ORGANIZADOR) {
    const d = decidirAcaoDeOperador(pedido({ acao: metodo, concessoes: [conceder(metodo)] }));
    assert.equal(d.permitido, false, metodo);
    assert.equal(d.motivo, 'acao_exclusiva_de_organizador', metodo);
  }
});

// ---------------------------------------------------------------------------
// 2. o caminho que PERMITE — senão o teste acima passaria com um `return false`
// ---------------------------------------------------------------------------

test('evento escopado com concessão permite', () => {
  const d = decidirAcaoDeOperador(pedido({ concessoes: [conceder('checkin')] }));
  assert.deepEqual(d, { permitido: true, motivo: null, escopado: true });
});

test('concessão é por ação: checkin não arrasta checkin_reverter', () => {
  const concessoes = [conceder('checkin')];
  assert.equal(decidirAcaoDeOperador(pedido({ acao: 'checkin', concessoes })).permitido, true);
  const rev = decidirAcaoDeOperador(pedido({ acao: 'checkin_reverter', concessoes }));
  assert.equal(rev.permitido, false);
  assert.equal(rev.motivo, 'sem_concessao_para_a_acao');
});

// ---------------------------------------------------------------------------
// 3. os três filtros compõem com E (se algum dia virar OU, estes reprovam)
// ---------------------------------------------------------------------------

test('concessão não supre capacidade do evento inativa', () => {
  const d = decidirAcaoDeOperador(
    pedido({
      acao: 'credencial_imprimir',
      capacidadesDoEvento: ['access_control', CODIGO_ESCOPO_OPERADOR],
      concessoes: [conceder('credencial_imprimir')],
    }),
  );
  assert.equal(d.permitido, false);
  assert.equal(d.motivo, 'capacidade_do_evento_inativa');
});

test('capacidade do evento ativa não supre ausência de concessão', () => {
  const d = decidirAcaoDeOperador(pedido({ acao: 'credencial_imprimir', concessoes: [] }));
  assert.equal(d.permitido, false);
  assert.equal(d.motivo, 'sem_concessao_para_a_acao');
});

// ---------------------------------------------------------------------------
// 4. isolamento multi-tenant — a concessão é uma chave de quatro partes
// ---------------------------------------------------------------------------

test('concessão de outro evento não vale neste', () => {
  const d = decidirAcaoDeOperador(pedido({ concessoes: [conceder('checkin', { eventId: 'evt-2' })] }));
  assert.equal(d.permitido, false);
  assert.equal(d.motivo, 'sem_concessao_para_a_acao');
});

test('concessão de outra organização não vale nesta', () => {
  const d = decidirAcaoDeOperador(pedido({ concessoes: [conceder('checkin', { organizationId: 'org-2' })] }));
  assert.equal(d.permitido, false);
});

test('concessão de outra pessoa não vale para esta', () => {
  const d = decidirAcaoDeOperador(pedido({ concessoes: [conceder('checkin', { userId: 'usr-2' })] }));
  assert.equal(d.permitido, false);
});

test('concessão revogada não tem efeito', () => {
  for (const revogadaEm of [new Date('2026-01-01'), '2026-01-01T00:00:00Z']) {
    const d = decidirAcaoDeOperador(pedido({ concessoes: [conceder('checkin', { revogadaEm })] }));
    assert.equal(d.permitido, false, String(revogadaEm));
    assert.equal(d.motivo, 'sem_concessao_para_a_acao');
  }
});

// ---------------------------------------------------------------------------
// 5. PROVA DE ADITIVIDADE: evento sem `operator_scoped_access` mantém hoje
//    Se esta reprovar, a migração quebra produção.
// ---------------------------------------------------------------------------

test('evento não escopado: operador mantém exatamente o comportamento atual', () => {
  for (const acao of Object.keys(ACOES_DE_OPERADOR)) {
    const cap = ACOES_DE_OPERADOR[acao].capacidade;
    const d = decidirAcaoDeOperador(pedido({ acao, capacidadesDoEvento: TODAS, concessoes: [] }));
    assert.equal(d.escopado, false, acao);
    assert.equal(d.permitido, true, `${acao} deveria seguir permitida (capacidade ${cap ?? 'nenhuma'})`);
  }
});

test('evento não escopado ainda respeita a capacidade do evento', () => {
  const d = decidirAcaoDeOperador(pedido({ acao: 'credencial_imprimir', capacidadesDoEvento: ['access_control'] }));
  assert.equal(d.permitido, false);
  assert.equal(d.motivo, 'capacidade_do_evento_inativa');
});

test('o filtro só nega: nenhuma combinação escopada permite o que a não escopada negaria', () => {
  const papeis = ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER'];
  const conjuntos = [[], ['credential'], ['access_control'], TODAS];
  let paresVerificados = 0;
  for (const papel of papeis) {
    for (const base of conjuntos) {
      for (const acao of Object.keys(ACOES_DE_OPERADOR)) {
        const semEscopo = decidirAcaoDeOperador(pedido({ papel, acao, capacidadesDoEvento: base, concessoes: [] }));
        // com escopo ligado e TODAS as concessões possíveis — o cenário mais permissivo
        const comEscopo = decidirAcaoDeOperador(
          pedido({
            papel,
            acao,
            capacidadesDoEvento: [...base, CODIGO_ESCOPO_OPERADOR],
            concessoes: Object.keys(ACOES_DE_OPERADOR).map((a) => conceder(a)),
          }),
        );
        if (comEscopo.permitido) {
          assert.equal(semEscopo.permitido, true, `${papel}/${acao}: escopo CONCEDEU algo novo`);
        }
        paresVerificados += 1;
      }
    }
  }
  assert.equal(paresVerificados, 5 * 4 * 16);
});

// ---------------------------------------------------------------------------
// 6. organizador não é estreitado
// ---------------------------------------------------------------------------

test('organizador passa sem concessão em evento escopado', () => {
  for (const papel of ['OWNER', 'ADMIN', 'MANAGER']) {
    const d = decidirAcaoDeOperador(pedido({ papel, concessoes: [] }));
    assert.equal(d.permitido, true, papel);
    assert.equal(d.escopado, true, papel);
  }
});

// ---------------------------------------------------------------------------
// 7. catálogo coerente com o código medido em develop @ 01932c88
// ---------------------------------------------------------------------------

test('catálogo e lista de organizador não se sobrepõem', () => {
  const metodos = Object.values(ACOES_DE_OPERADOR).map((a) => a.metodo);
  for (const so of METODOS_SO_DE_ORGANIZADOR) {
    assert.equal(metodos.includes(so), false, `${so} está nos dois lados`);
  }
});

test('catálogo + organizador cobrem os 24 métodos públicos do balcão', () => {
  const metodos = new Set([
    ...Object.values(ACOES_DE_OPERADOR).map((a) => a.metodo),
    ...METODOS_SO_DE_ORGANIZADOR,
    ACAO_SEMPRE_LIBERADA_PARA_STAFF,
  ]);
  assert.equal(metodos.size, 24);
});

test('toda capacidade citada no catálogo existe em CAPACIDADES_DE_EVENTO', () => {
  for (const [nome, a] of Object.entries(ACOES_DE_OPERADOR)) {
    if (a.capacidade === null) continue;
    assert.ok(CAPACIDADES_DE_EVENTO.includes(a.capacidade), `${nome}: ${a.capacidade}`);
  }
});

test('toda reversão aponta para uma ação direta existente que não é reversão', () => {
  let reversoes = 0;
  for (const [nome, a] of Object.entries(ACOES_DE_OPERADOR)) {
    if (a.reverte === null) continue;
    reversoes += 1;
    assert.ok(ehAcaoDeOperador(a.reverte), `${nome} aponta para "${a.reverte}", que não existe`);
    const alvo = ACOES_DE_OPERADOR[a.reverte];
    assert.equal(alvo.reverte, null, `${nome} reverte outra reversão`);
    assert.equal(alvo.capacidade, a.capacidade, `${nome} e ${a.reverte} exigem capacidades diferentes`);
  }
  assert.equal(reversoes, 3);
});

test('toda reversão é sensível, e todo sensível exige concessão própria', () => {
  const sensiveis = Object.entries(ACOES_DE_OPERADOR).filter(([, a]) => a.sensivel).map(([n]) => n);
  for (const [nome, a] of Object.entries(ACOES_DE_OPERADOR)) {
    if (a.reverte !== null) assert.equal(a.sensivel, true, `${nome} reverte mas não é sensível`);
  }
  assert.deepEqual(sensiveis.sort(), [
    'checkin_reverter',
    'inscricao_corrigir',
    'material_reverter',
    'presenca_dia_reverter',
  ]);
  // nenhuma sensível vem de carona com a ação que ela desfaz
  for (const nome of sensiveis) {
    const a = ACOES_DE_OPERADOR[nome];
    if (a.reverte === null) continue;
    const d = decidirAcaoDeOperador(pedido({ acao: nome, concessoes: [conceder(a.reverte)] }));
    assert.equal(d.permitido, false, nome);
    assert.equal(d.motivo, 'sem_concessao_para_a_acao', nome);
  }
});

// ---------------------------------------------------------------------------
// 8. interface limitada do operador
// ---------------------------------------------------------------------------

test('acoesPermitidas devolve só o concedido e cruzado com o evento', () => {
  const permitidas = acoesPermitidas({
    papel: 'OPERATOR',
    organizationId: ORG,
    eventId: EVT,
    userId: USR,
    capacidadesDoEvento: ['access_control', CODIGO_ESCOPO_OPERADOR],
    concessoes: [conceder('checkin'), conceder('credencial_imprimir'), conceder('relatorio')],
  });
  // credencial_imprimir cai: o evento não tem `credential` ativa
  assert.deepEqual(permitidas.sort(), ['checkin', 'relatorio']);
});

test('acoesPermitidas de operador sem concessão em evento escopado é lista vazia', () => {
  const permitidas = acoesPermitidas({
    papel: 'OPERATOR',
    organizationId: ORG,
    eventId: EVT,
    userId: USR,
    capacidadesDoEvento: ESCOPADO,
    concessoes: [],
  });
  assert.deepEqual(permitidas, []);
});

// ---------------------------------------------------------------------------
// 9. normalização da borda
// ---------------------------------------------------------------------------

test('normalizarConcessao rejeita ação inexistente em vez de ignorar', () => {
  assert.throws(
    () => normalizarConcessao({ organizationId: ORG, eventId: EVT, userId: USR, acoes: ['checkin', 'voar'] }),
    (e) => e instanceof EntradaInvalida && /"voar" não existe/u.test(e.message),
  );
});

test('normalizarConcessao recusa ação exclusiva de organizador com mensagem própria', () => {
  assert.throws(
    () => normalizarConcessao({ organizationId: ORG, eventId: EVT, userId: USR, acoes: ['issueTotemLink'] }),
    (e) => e instanceof EntradaInvalida && /exclusiva de organizador/u.test(e.message),
  );
});

test('normalizarConcessao exige as três chaves e ao menos uma ação', () => {
  for (const faltando of ['organizationId', 'eventId', 'userId']) {
    const base = { organizationId: ORG, eventId: EVT, userId: USR, acoes: ['checkin'] };
    delete base[faltando];
    assert.throws(() => normalizarConcessao(base), EntradaInvalida, faltando);
  }
  assert.throws(() => normalizarConcessao({ organizationId: ORG, eventId: EVT, userId: USR, acoes: [] }), EntradaInvalida);
  assert.throws(() => normalizarConcessao(null), EntradaInvalida);
});

test('normalizarConcessao apara espaços e remove duplicatas', () => {
  const r = normalizarConcessao({
    organizationId: `  ${ORG} `,
    eventId: EVT,
    userId: USR,
    acoes: ['checkin', 'checkin', 'relatorio'],
  });
  assert.equal(r.organizationId, ORG);
  assert.deepEqual(r.acoes, ['checkin', 'relatorio']);
});

// ---------------------------------------------------------------------------
// 10. auditoria
// ---------------------------------------------------------------------------

test('auditoria registra ator, alvo e ação, sem dado pessoal', () => {
  const agora = new Date('2026-11-04T12:00:00Z');
  const r = montarAuditoria(
    'revogada',
    { organizationId: ORG, eventId: EVT, alvoUserId: USR, atorUserId: 'usr-9', acao: 'checkin_reverter' },
    agora,
  );
  assert.deepEqual(r, {
    ocorridoEm: agora,
    tipo: 'revogada',
    organizationId: ORG,
    eventId: EVT,
    alvoUserId: USR,
    atorUserId: 'usr-9',
    acao: 'checkin_reverter',
  });
  assert.equal(JSON.stringify(r).includes('@'), false);
});
