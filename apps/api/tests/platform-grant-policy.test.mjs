import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACOES_CONCEDIVEIS,
  ACOES_DO_PROPRIETARIO,
  JANELA_SEGUNDO_FATOR_MS,
  JANELA_VERIFICACAO_REFORCADA_MS,
  concessaoVigente,
  decidir,
  escopoAlcanca,
  poderesEfetivos,
} from '../src/platform-grant-policy.ts';

/**
 * Aceites da Área Master (#665), cada um escrito como caso.
 *
 * O módulo não tem dependência nenhuma, então estas regras rodam com
 * `--experimental-strip-types` sem build e sem banco. É de propósito: a decisão
 * de autorização é a peça que menos pode depender de ambiente para ser
 * exercitada.
 */

const AGORA = new Date('2026-11-10T20:00:00.000Z').getTime();
const minutos = (n) => n * 60 * 1000;

const EVENTO_A = { tipo: 'EVENTO', eventId: 'evt-a', organizationId: 'org-1' };
const EVENTO_B = { tipo: 'EVENTO', eventId: 'evt-b', organizationId: 'org-1' };
const EVENTO_C = { tipo: 'EVENTO', eventId: 'evt-c', organizationId: 'org-2' };
const PLATAFORMA = { tipo: 'PLATAFORMA' };

/** Sessão com segundo fator fresco e sem verificação reforçada. */
const colaborador = (extra = {}) => ({
  proprietario: false,
  segundoFatorVerificadoEm: new Date(AGORA - minutos(10)),
  ...extra,
});
const proprietario = (extra = {}) => ({
  proprietario: true,
  segundoFatorVerificadoEm: new Date(AGORA - minutos(10)),
  ...extra,
});
const reforcada = { verificacaoReforcadaEm: new Date(AGORA - minutos(1)) };

const concessao = (acao, escopo, extra = {}) => ({ acao, escopo, ...extra });
const noEvento = (eventId) => ({ tipo: 'EVENTO', eventId });
const naOrganizacao = (organizationId) => ({ tipo: 'ORGANIZACAO', organizationId });
const GLOBAL = { tipo: 'GLOBAL' };

const MOTIVO = 'infracao de conduta apurada no caso 123';
const pedir = (acao, alvo, motivo) => ({ acao, alvo, motivo });
// Sem valor padrão de propósito: um default aqui reinjetaria o motivo válido
// quando o teste passa `undefined` para provar que ele é obrigatório — e o caso
// passaria verde pelo motivo errado. Aconteceu nesta sessão.
const decisao = (sessao, concessoes, acao, alvo, motivo) => decidir(sessao, concessoes, pedir(acao, alvo, motivo), AGORA);
const decisaoComMotivo = (sessao, concessoes, acao, alvo) => decisao(sessao, concessoes, acao, alvo, MOTIVO);

// ------------------------------------------------- negar por padrão
test('sem concessão nenhuma, nada é permitido — nem consultar', () => {
  for (const acao of ACOES_CONCEDIVEIS) {
    const d = decisaoComMotivo(colaborador(reforcada), [], acao, EVENTO_A);
    assert.equal(d.permitido, false, acao);
    assert.equal(d.recusa, 'SEM_CONCESSAO', acao);
  }
});

test('ser OWNER de organização não abre a Área Master', () => {
  // A política não tem sequer um campo para papel de organização: não há por
  // onde um OWNER de org virar Master. Este teste fixa essa ausência.
  const d = decisaoComMotivo(colaborador(reforcada), [], 'consultar', EVENTO_A);
  assert.equal(d.permitido, false);
  assert.equal(d.recusa, 'SEM_CONCESSAO');
  assert.equal(Object.keys(colaborador()).includes('role'), false, 'papel de organização não entra na decisão');
});

test('ação fora do catálogo é recusada, e não tratada como concessão ampla', () => {
  const tudo = ACOES_CONCEDIVEIS.map((acao) => concessao(acao, GLOBAL));
  const d = decisaoComMotivo(colaborador(reforcada), tudo, 'apagar_tudo', EVENTO_A);
  assert.equal(d.permitido, false);
  assert.equal(d.recusa, 'ACAO_DESCONHECIDA');
});

// ------------------------------------------------- segundo fator
test('sem segundo fator ninguém entra, nem o proprietário', () => {
  for (const sessao of [
    { proprietario: true },
    { proprietario: true, segundoFatorVerificadoEm: null },
    { proprietario: true, segundoFatorVerificadoEm: new Date(AGORA - JANELA_SEGUNDO_FATOR_MS - 1) },
    { proprietario: true, segundoFatorVerificadoEm: 'não é data' },
    { proprietario: true, segundoFatorVerificadoEm: new Date(AGORA + minutos(5)) },
  ]) {
    const d = decidir(sessao, [], pedir('consultar', EVENTO_A), AGORA);
    assert.equal(d.permitido, false, JSON.stringify(sessao.segundoFatorVerificadoEm));
    assert.equal(d.recusa, 'SEM_SEGUNDO_FATOR');
  }
});

test('a recusa por segundo fator vem ANTES de revelar se a ação existe', () => {
  const d = decidir({ proprietario: false }, [], pedir('acao_que_nao_existe', EVENTO_A), AGORA);
  assert.equal(d.recusa, 'SEM_SEGUNDO_FATOR', 'não entregar o catálogo a quem nem passou pelo segundo fator');
});

test('o segundo fator na borda da janela ainda vale; um milissegundo além, não', () => {
  const naBorda = { proprietario: true, segundoFatorVerificadoEm: new Date(AGORA - JANELA_SEGUNDO_FATOR_MS), ...reforcada };
  assert.equal(decidir(naBorda, [], pedir('consultar', EVENTO_A), AGORA).permitido, true);
  const alem = { ...naBorda, segundoFatorVerificadoEm: new Date(AGORA - JANELA_SEGUNDO_FATOR_MS - 1) };
  assert.equal(decidir(alem, [], pedir('consultar', EVENTO_A), AGORA).recusa, 'SEM_SEGUNDO_FATOR');
});

// ------------------------------------------------- escopo é regra
test('auditor de A+B não alcança C', () => {
  const grants = [concessao('consultar', noEvento('evt-a')), concessao('consultar', noEvento('evt-b'))];
  assert.equal(decisao(colaborador(), grants, 'consultar', EVENTO_A).permitido, true);
  assert.equal(decisao(colaborador(), grants, 'consultar', EVENTO_B).permitido, true);
  const c = decisao(colaborador(), grants, 'consultar', EVENTO_C);
  assert.equal(c.permitido, false);
  assert.equal(c.recusa, 'FORA_DO_ESCOPO', 'a terceira feira fica invisível');
});

test('escopo global alcança evento criado DEPOIS da concessão', () => {
  const grants = [concessao('consultar', GLOBAL)];
  const eventoNovo = { tipo: 'EVENTO', eventId: 'evt-d-criado-depois', organizationId: 'org-9' };
  assert.equal(decisao(colaborador(), grants, 'consultar', eventoNovo).permitido, true);
  // A prova de que nada foi materializado: um id sorteado também é alcançado.
  for (let i = 0; i < 20; i += 1) {
    const sorteado = { tipo: 'EVENTO', eventId: `evt-${Math.random().toString(36).slice(2)}`, organizationId: 'org-x' };
    assert.equal(decisao(colaborador(), grants, 'consultar', sorteado).permitido, true);
  }
});

test('escopo de organização alcança os eventos dela, e só', () => {
  const grants = [concessao('consultar', naOrganizacao('org-1'))];
  assert.equal(decisao(colaborador(), grants, 'consultar', EVENTO_A).permitido, true);
  assert.equal(decisao(colaborador(), grants, 'consultar', EVENTO_B).permitido, true);
  assert.equal(decisao(colaborador(), grants, 'consultar', EVENTO_C).recusa, 'FORA_DO_ESCOPO');
  assert.equal(decisao(colaborador(), grants, 'consultar', { tipo: 'ORGANIZACAO', organizationId: 'org-1' }).permitido, true);
  assert.equal(decisao(colaborador(), grants, 'consultar', { tipo: 'ORGANIZACAO', organizationId: 'org-2' }).recusa, 'FORA_DO_ESCOPO');
});

test('cuidar de um evento não dá a visão geral da plataforma', () => {
  for (const escopo of [noEvento('evt-a'), naOrganizacao('org-1')]) {
    const d = decisao(colaborador(), [concessao('consultar', escopo)], 'consultar', PLATAFORMA);
    assert.equal(d.permitido, false, JSON.stringify(escopo));
    assert.equal(d.recusa, 'FORA_DO_ESCOPO');
  }
  assert.equal(decisao(colaborador(), [concessao('consultar', GLOBAL)], 'consultar', PLATAFORMA).permitido, true);
});

// ------------------------------------------------- ação × escopo
test('abrangência global por si só NÃO concede moderação', () => {
  const global = [concessao('consultar', GLOBAL), concessao('auditar', GLOBAL), concessao('relatorios', GLOBAL)];
  for (const acao of ['suspender', 'desbloquear', 'excluir', 'restaurar']) {
    const d = decisaoComMotivo(colaborador(reforcada), global, acao, EVENTO_A);
    assert.equal(d.permitido, false, acao);
    assert.equal(d.recusa, 'SEM_CONCESSAO', acao);
  }
  assert.equal(decisao(colaborador(), global, 'consultar', EVENTO_C).permitido, true, 'a consulta global segue valendo');
});

test('concessão de leitura jamais confere moderação, em escopo nenhum', () => {
  for (const escopo of [GLOBAL, naOrganizacao('org-1'), noEvento('evt-a')]) {
    const d = decisaoComMotivo(colaborador(reforcada), [concessao('consultar', escopo)], 'suspender', EVENTO_A);
    assert.equal(d.permitido, false, JSON.stringify(escopo));
  }
});

test('moderador delegado bloqueia apenas no alcance concedido', () => {
  const grants = [concessao('suspender', noEvento('evt-a'))];
  assert.equal(decisaoComMotivo(colaborador(reforcada), grants, 'suspender', EVENTO_A).permitido, true);
  assert.equal(decisaoComMotivo(colaborador(reforcada), grants, 'suspender', EVENTO_B).recusa, 'FORA_DO_ESCOPO');
  assert.equal(decisaoComMotivo(colaborador(reforcada), grants, 'excluir', EVENTO_A).recusa, 'SEM_CONCESSAO',
    'suspender não é excluir');
});

// ------------------------------------------------- autoelevação e delegação
test('nenhum membro administra equipe, concede, amplia ou revoga — com quaisquer poderes', () => {
  const tudo = ACOES_CONCEDIVEIS.map((acao) => concessao(acao, GLOBAL));
  for (const acao of ACOES_DO_PROPRIETARIO) {
    const d = decisaoComMotivo(colaborador(reforcada), tudo, acao, PLATAFORMA);
    assert.equal(d.permitido, false, acao);
    assert.equal(d.recusa, 'SOMENTE_PROPRIETARIO', acao);
  }
});

test('forjar uma concessão das ações do proprietário não funciona', () => {
  // Linha escrita à mão no banco, ou catálogo antigo: a ação não está entre as
  // concedíveis, então não existe concessão capaz de casar com ela.
  const forjada = ACOES_DO_PROPRIETARIO.map((acao) => concessao(acao, GLOBAL));
  for (const acao of ACOES_DO_PROPRIETARIO) {
    assert.equal(decisaoComMotivo(colaborador(reforcada), forjada, acao, PLATAFORMA).recusa, 'SOMENTE_PROPRIETARIO', acao);
  }
});

test('o proprietário administra, e não depende de concessão para nada', () => {
  for (const acao of [...ACOES_DO_PROPRIETARIO, ...ACOES_CONCEDIVEIS]) {
    assert.equal(decisaoComMotivo(proprietario(reforcada), [], acao, EVENTO_A).permitido, true, acao);
  }
});

// ------------------------------------------------- revogação e expiração
test('revogada é ausente: o próximo pedido é recusado mesmo com sessão aberta', () => {
  const vigente = [concessao('consultar', noEvento('evt-a'))];
  assert.equal(decisao(colaborador(), vigente, 'consultar', EVENTO_A).permitido, true);

  const revogada = [concessao('consultar', noEvento('evt-a'), { revogadaEm: new Date(AGORA - 1) })];
  const d = decisao(colaborador(), revogada, 'consultar', EVENTO_A);
  assert.equal(d.permitido, false, 'a sessão continua aberta, mas a concessão não existe mais');
  assert.equal(d.recusa, 'SEM_CONCESSAO');
});

test('revogar um colaborador não mexe na concessão do outro', () => {
  // Cada pessoa tem sua própria lista; aqui a prova é que a decisão olha só as
  // linhas que recebeu, e que uma revogada no meio não contamina as demais.
  const dela = [concessao('auditar', noEvento('evt-a'), { revogadaEm: new Date(AGORA - 1) })];
  const dele = [concessao('auditar', noEvento('evt-a'))];
  assert.equal(decisao(colaborador(), dela, 'auditar', EVENTO_A).permitido, false);
  assert.equal(decisao(colaborador(), dele, 'auditar', EVENTO_A).permitido, true);

  const misto = [
    concessao('auditar', noEvento('evt-a'), { revogadaEm: new Date(AGORA - 1) }),
    concessao('auditar', noEvento('evt-b')),
  ];
  assert.equal(decisao(colaborador(), misto, 'auditar', EVENTO_A).recusa, 'FORA_DO_ESCOPO');
  assert.equal(decisao(colaborador(), misto, 'auditar', EVENTO_B).permitido, true);
});

test('expirada é ausente, e a expiração é por instante', () => {
  const expirada = [concessao('consultar', GLOBAL, { expiraEm: new Date(AGORA) })];
  assert.equal(decisao(colaborador(), expirada, 'consultar', EVENTO_A).recusa, 'SEM_CONCESSAO',
    'expirar no instante exato já não vale');
  const valendo = [concessao('consultar', GLOBAL, { expiraEm: new Date(AGORA + 1) })];
  assert.equal(decisao(colaborador(), valendo, 'consultar', EVENTO_A).permitido, true);
  const semPrazo = [concessao('consultar', GLOBAL, { expiraEm: null })];
  assert.equal(decisao(colaborador(), semPrazo, 'consultar', EVENTO_A).permitido, true);
});

test('concessaoVigente separa as três situações', () => {
  assert.equal(concessaoVigente(concessao('consultar', GLOBAL), AGORA), true);
  assert.equal(concessaoVigente(concessao('consultar', GLOBAL, { revogadaEm: new Date(AGORA - 1) }), AGORA), false);
  assert.equal(concessaoVigente(concessao('consultar', GLOBAL, { expiraEm: new Date(AGORA - 1) }), AGORA), false);
});

// ------------------------------------------------- moderação: motivo e reforço
test('moderar sem motivo suficiente é recusado antes de qualquer escopo', () => {
  const grants = [concessao('suspender', GLOBAL)];
  for (const motivo of [undefined, null, '', '   ', 'curto']) {
    const d = decisao(colaborador(reforcada), grants, 'suspender', EVENTO_A, motivo);
    assert.equal(d.permitido, false, JSON.stringify(motivo));
    assert.equal(d.recusa, 'MOTIVO_OBRIGATORIO', JSON.stringify(motivo));
  }
  assert.equal(decisao(colaborador(reforcada), grants, 'suspender', EVENTO_A, MOTIVO).permitido, true);
});

test('consultar e auditar não exigem motivo', () => {
  for (const acao of ['consultar', 'auditar', 'relatorios', 'suporte']) {
    assert.equal(decisao(colaborador(), [concessao(acao, GLOBAL)], acao, EVENTO_A, undefined).permitido, true, acao);
  }
});

test('moderação e administração exigem verificação reforçada recente', () => {
  const grants = [concessao('suspender', GLOBAL), concessao('excluir', GLOBAL)];
  for (const acao of ['suspender', 'excluir']) {
    assert.equal(decisaoComMotivo(colaborador(), grants, acao, EVENTO_A).recusa, 'EXIGE_VERIFICACAO_RECENTE', acao);
  }
  const velha = { verificacaoReforcadaEm: new Date(AGORA - JANELA_VERIFICACAO_REFORCADA_MS - 1) };
  assert.equal(decisaoComMotivo(colaborador(velha), grants, 'suspender', EVENTO_A).recusa, 'EXIGE_VERIFICACAO_RECENTE');
  const naBorda = { verificacaoReforcadaEm: new Date(AGORA - JANELA_VERIFICACAO_REFORCADA_MS) };
  assert.equal(decisaoComMotivo(colaborador(naBorda), grants, 'suspender', EVENTO_A).permitido, true);

  for (const acao of ACOES_DO_PROPRIETARIO) {
    assert.equal(decisaoComMotivo(proprietario(), [], acao, PLATAFORMA).recusa, 'EXIGE_VERIFICACAO_RECENTE', acao);
  }
});

test('consultar não exige verificação reforçada', () => {
  assert.equal(decisao(colaborador(), [concessao('consultar', GLOBAL)], 'consultar', EVENTO_A).permitido, true);
});

// ------------------------------------------------- escopoAlcanca isolado
test('escopoAlcanca cobre a matriz de escopo por alvo', () => {
  assert.equal(escopoAlcanca(GLOBAL, PLATAFORMA), true);
  assert.equal(escopoAlcanca(GLOBAL, EVENTO_C), true);
  assert.equal(escopoAlcanca(naOrganizacao('org-1'), PLATAFORMA), false);
  assert.equal(escopoAlcanca(naOrganizacao('org-1'), EVENTO_A), true);
  assert.equal(escopoAlcanca(naOrganizacao('org-1'), EVENTO_C), false);
  assert.equal(escopoAlcanca(noEvento('evt-a'), EVENTO_A), true);
  assert.equal(escopoAlcanca(noEvento('evt-a'), EVENTO_B), false);
  assert.equal(escopoAlcanca(noEvento('evt-a'), PLATAFORMA), false);
  assert.equal(escopoAlcanca(noEvento('org-1'), { tipo: 'ORGANIZACAO', organizationId: 'org-1' }), false,
    'escopo de evento não alcança alvo de organização, mesmo com id coincidente');
});

// ------------------------------------------------- poderes efetivos
test('poderes efetivos saem da mesma decisão, não de uma cópia da regra', () => {
  const grants = [concessao('consultar', GLOBAL), concessao('suspender', noEvento('evt-a'))];
  assert.deepEqual(poderesEfetivos(colaborador(), grants, EVENTO_A, AGORA), ['consultar', 'suspender']);
  assert.deepEqual(poderesEfetivos(colaborador(), grants, EVENTO_B, AGORA), ['consultar']);
  assert.deepEqual(poderesEfetivos(colaborador(), grants, PLATAFORMA, AGORA), ['consultar']);
  assert.deepEqual(poderesEfetivos(colaborador(), [], EVENTO_A, AGORA), []);
  assert.deepEqual(poderesEfetivos(proprietario(), [], EVENTO_A, AGORA), [...ACOES_CONCEDIVEIS]);
});

test('a revisão de poderes não esconde ação sensível por falta de reverificação', () => {
  // Sem neutralizar as janelas, `suspender` sumiria da lista só porque ninguém
  // acabou de reverificar — e o proprietário leria uma lista que não é a dos
  // poderes da pessoa.
  const grants = [concessao('suspender', GLOBAL)];
  const semReforco = colaborador();
  assert.equal(decisaoComMotivo(semReforco, grants, 'suspender', EVENTO_A).recusa, 'EXIGE_VERIFICACAO_RECENTE');
  assert.deepEqual(poderesEfetivos(semReforco, grants, EVENTO_A, AGORA), ['suspender']);
});

test('poderes efetivos respeitam revogação e expiração', () => {
  const grants = [
    concessao('consultar', GLOBAL),
    concessao('auditar', GLOBAL, { revogadaEm: new Date(AGORA - 1) }),
    concessao('relatorios', GLOBAL, { expiraEm: new Date(AGORA - 1) }),
  ];
  assert.deepEqual(poderesEfetivos(colaborador(), grants, EVENTO_A, AGORA), ['consultar']);
});

test('a ordem da lista de poderes é a do catálogo, não a de chegada das concessões', () => {
  const grants = [concessao('suspender', GLOBAL), concessao('consultar', GLOBAL), concessao('auditar', GLOBAL)];
  assert.deepEqual(poderesEfetivos(colaborador(), grants, EVENTO_A, AGORA), ['consultar', 'auditar', 'suspender']);
});
