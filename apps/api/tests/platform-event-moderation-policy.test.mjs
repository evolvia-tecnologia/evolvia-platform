import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACOES_DE_MODERACAO_DE_EVENTO, MOTIVOS_DE_RECUSA_DA_TRANSICAO, SITUACOES,
  planejarModeracao, visivelNoCatalogo,
} from '../src/platform-event-moderation-policy.ts';

const T0 = Date.parse('2026-11-14T12:00:00.000Z');
const ISO = new Date(T0).toISOString();
const ANTES = new Date(T0 - 3 * 86400_000).toISOString();

const evento = (status, moderacao = null) => ({ id: 'evt-0001', status, moderacao });
const mod = (over = {}) => ({ previousStatus: null, suspendedAt: null, removedAt: null, ...over });

const suspensoDe = (anterior, { removedAt = null, suspendedAt = ANTES } = {}) =>
  evento('SUSPENDED', mod({ previousStatus: anterior, suspendedAt, removedAt }));

// ----------------------------------------------------------------- catálogo

test('o catálogo de situações é exatamente o do schema aplicado', () => {
  assert.deepEqual([...SITUACOES], [
    'DRAFT', 'SETUP', 'HOMOLOGATION', 'READY_TO_PUBLISH',
    'PUBLISHED', 'SUSPENDED', 'FINISHED', 'CANCELLED',
  ]);
  assert.deepEqual([...ACOES_DE_MODERACAO_DE_EVENTO], ['suspender', 'desbloquear', 'excluir', 'restaurar']);
});

test('situação que o código não conhece é recusada, não presumida', () => {
  const r = planejarModeracao(evento('ARQUIVADO'), 'suspender', T0);
  assert.equal(r.ok, false);
  assert.equal(r.recusa, 'SITUACAO_DESCONHECIDA');
});

test('ação fora das quatro é recusada', () => {
  for (const acao of ['conceder', 'publicar', 'SUSPENDER', '', 'excluir_de_verdade']) {
    const r = planejarModeracao(evento('PUBLISHED'), acao, T0);
    assert.equal(r.ok, false, acao);
    assert.equal(r.recusa, 'ACAO_DESCONHECIDA', acao);
  }
});

// ---------------------------------------------------------------- suspender

test('suspender guarda a situação anterior, que é o ponto inteiro da tabela', () => {
  const r = planejarModeracao(evento('PUBLISHED'), 'suspender', T0);
  assert.equal(r.ok, true);
  assert.equal(r.de, 'PUBLISHED');
  assert.equal(r.para, 'SUSPENDED');
  assert.deepEqual(r.evento, { status: 'SUSPENDED' });
  assert.equal(r.moderacao.previousStatus, 'PUBLISHED', 'sem isto não há como desbloquear');
  assert.equal(r.moderacao.suspendedAt, ISO);
  assert.equal(r.moderacao.removedAt, null);
  assert.deepEqual(r.alteracoes, { de: 'PUBLISHED', para: 'SUSPENDED', removido: false });
});

test('suspender vale nas cinco situações em curso, e a anterior é sempre registrada', () => {
  for (const situacao of ['DRAFT', 'SETUP', 'HOMOLOGATION', 'READY_TO_PUBLISH', 'PUBLISHED']) {
    const r = planejarModeracao(evento(situacao), 'suspender', T0);
    assert.equal(r.ok, true, situacao);
    assert.equal(r.moderacao.previousStatus, situacao, situacao);
  }
});

test('evento encerrado ou cancelado não se suspende', () => {
  // Não há nada em curso para interromper, e suspender ali embaralharia o
  // registro do que aconteceu.
  for (const situacao of ['FINISHED', 'CANCELLED']) {
    const r = planejarModeracao(evento(situacao), 'suspender', T0);
    assert.equal(r.ok, false, situacao);
    assert.equal(r.recusa, 'NAO_SUSPENSIVEL', situacao);
  }
});

test('suspender duas vezes é recusado, e o motivo é a volta que se perderia', () => {
  // É a regra menos óbvia do arquivo. Se a segunda suspensão fosse aceita,
  // `previousStatus` passaria a 'SUSPENDED' e o desbloqueio devolveria o
  // evento para o estado suspenso — perda silenciosa da única informação que
  // torna o desbloqueio possível.
  const r = planejarModeracao(suspensoDe('PUBLISHED'), 'suspender', T0);
  assert.equal(r.ok, false);
  assert.equal(r.recusa, 'JA_SUSPENSO');
  assert.match(r.porque, /voltar/);
});

test('JA_SUSPENSO vem antes de NAO_SUSPENSIVEL, porque SUSPENDED também não é suspensível', () => {
  // A ordem das checagens é observável: responder "não é suspensível" a um
  // evento já suspenso mandaria a pessoa procurar o problema na situação do
  // evento em vez de na suspensão que já existe.
  const r = planejarModeracao(suspensoDe('PUBLISHED'), 'suspender', T0);
  assert.equal(r.recusa, 'JA_SUSPENSO');

  // E um evento cuja coluna diz SUSPENDED mas que nunca passou por moderação
  // cai no outro motivo — que é o certo para ele.
  const semLinha = planejarModeracao(evento('SUSPENDED'), 'suspender', T0);
  assert.equal(semLinha.ok, false);
  assert.equal(semLinha.recusa, 'NAO_SUSPENSIVEL');
});

// -------------------------------------------------------------- desbloquear

test('desbloquear devolve exatamente a situação anterior e limpa a moderação', () => {
  const r = planejarModeracao(suspensoDe('READY_TO_PUBLISH'), 'desbloquear', T0);
  assert.equal(r.ok, true);
  assert.equal(r.para, 'READY_TO_PUBLISH');
  assert.deepEqual(r.evento, { status: 'READY_TO_PUBLISH' });
  assert.deepEqual(r.moderacao, { previousStatus: null, suspendedAt: null, removedAt: null });
});

test('desbloquear devolve a situação anterior, qualquer que tenha sido', () => {
  for (const anterior of ['DRAFT', 'SETUP', 'HOMOLOGATION', 'READY_TO_PUBLISH', 'PUBLISHED']) {
    const r = planejarModeracao(suspensoDe(anterior), 'desbloquear', T0);
    assert.equal(r.ok, true, anterior);
    assert.equal(r.evento.status, anterior, anterior);
  }
});

test('desbloquear SEM situação anterior registrada é recusado, nunca adivinhado', () => {
  // O erro caro: 'DRAFT' despublicaria um evento que estava no ar, 'PUBLISHED'
  // publicaria um que nunca esteve. Recusar e pedir o destino explícito é a
  // única resposta que não causa dano.
  const semAnterior = planejarModeracao(evento('SUSPENDED', mod({ suspendedAt: ANTES })), 'desbloquear', T0);
  assert.equal(semAnterior.ok, false);
  assert.equal(semAnterior.recusa, 'SITUACAO_ANTERIOR_PERDIDA');

  const anteriorEstranha = planejarModeracao(
    evento('SUSPENDED', mod({ suspendedAt: ANTES, previousStatus: 'ARQUIVADO' })), 'desbloquear', T0,
  );
  assert.equal(anteriorEstranha.ok, false);
  assert.equal(anteriorEstranha.recusa, 'SITUACAO_ANTERIOR_PERDIDA', 'valor fora do catálogo não serve de destino');
});

test('desbloquear evento não suspenso é recusado', () => {
  for (const situacao of ['DRAFT', 'PUBLISHED', 'FINISHED']) {
    const r = planejarModeracao(evento(situacao), 'desbloquear', T0);
    assert.equal(r.ok, false, situacao);
    assert.equal(r.recusa, 'NAO_ESTA_SUSPENSO', situacao);
  }
});

test('desbloquear evento REMOVIDO é recusado: restaurar vem primeiro', () => {
  const r = planejarModeracao(suspensoDe('PUBLISHED', { removedAt: ANTES }), 'desbloquear', T0);
  assert.equal(r.ok, false);
  assert.equal(r.recusa, 'JA_REMOVIDO');
  assert.match(r.porque, /[Rr]estaure/);
});

// ------------------------------------------------------------------ excluir

test('excluir exige suspensão antes: duas decisões, duas entradas na trilha', () => {
  const r = planejarModeracao(evento('PUBLISHED'), 'excluir', T0);
  assert.equal(r.ok, false);
  assert.equal(r.recusa, 'EXIGE_SUSPENSAO_ANTES');
  assert.match(r.porque, /[Ss]uspenda/);
});

test('excluir um evento suspenso marca a remoção e PRESERVA quando a suspensão começou', () => {
  const r = planejarModeracao(suspensoDe('PUBLISHED', { suspendedAt: ANTES }), 'excluir', T0);
  assert.equal(r.ok, true);
  assert.equal(r.removedAtEsperado, undefined, 'a forma do retorno não tem campo solto');
  assert.equal(r.moderacao.removedAt, ISO);
  assert.equal(
    r.moderacao.suspendedAt, ANTES,
    'sobrescrever perderia a duração da suspensão, que é o que alguém revisando quer saber',
  );
  assert.equal(r.moderacao.previousStatus, 'PUBLISHED', 'a volta continua guardada');
  assert.equal(r.evento, null, 'Event.status não muda: ele já está suspenso');
  assert.deepEqual(r.alteracoes, { de: 'SUSPENDED', para: 'SUSPENDED', removido: true });
});

test('excluir duas vezes é recusado', () => {
  const r = planejarModeracao(suspensoDe('PUBLISHED', { removedAt: ANTES }), 'excluir', T0);
  assert.equal(r.ok, false);
  assert.equal(r.recusa, 'JA_REMOVIDO');
});

test('a remoção não é uma situação do evento, e não inventa enum novo', () => {
  const r = planejarModeracao(suspensoDe('PUBLISHED'), 'excluir', T0);
  assert.equal(r.ok, true);
  assert.equal(r.para, 'SUSPENDED', 'continua SUSPENDED');
  assert.ok(SITUACOES.includes(r.para), 'e sempre um valor que o schema conhece');
});

// ---------------------------------------------------------------- restaurar

test('restaurar desfaz a remoção e deixa o evento suspenso', () => {
  // Devolver ao ar no mesmo passo juntaria duas decisões que foram tomadas
  // separadas. Quem restaura decide depois se desbloqueia.
  const r = planejarModeracao(suspensoDe('PUBLISHED', { removedAt: ANTES, suspendedAt: ANTES }), 'restaurar', T0);
  assert.equal(r.ok, true);
  assert.equal(r.moderacao.removedAt, null);
  assert.equal(r.moderacao.suspendedAt, ANTES, 'a suspensão continua, com a marca original');
  assert.equal(r.moderacao.previousStatus, 'PUBLISHED');
  assert.equal(r.evento, null);
  assert.deepEqual(r.alteracoes, { de: 'SUSPENDED', para: 'SUSPENDED', removido: false });
});

test('restaurar o que não foi removido é recusado', () => {
  assert.equal(planejarModeracao(evento('PUBLISHED'), 'restaurar', T0).recusa, 'NAO_ESTA_REMOVIDO');
  assert.equal(planejarModeracao(suspensoDe('PUBLISHED'), 'restaurar', T0).recusa, 'NAO_ESTA_REMOVIDO');
});

test('o ciclo inteiro fecha: suspender, excluir, restaurar, desbloquear', () => {
  // A prova de que as quatro ações compõem. Cada passo alimenta o próximo com
  // o estado que o anterior produziu — se alguma delas perdesse
  // `previousStatus`, o último passo falharia.
  const suspensao = planejarModeracao(evento('PUBLISHED'), 'suspender', T0);
  assert.equal(suspensao.ok, true);
  let atual = { id: 'evt-0001', status: suspensao.evento.status, moderacao: suspensao.moderacao };

  const remocao = planejarModeracao(atual, 'excluir', T0 + 1000);
  assert.equal(remocao.ok, true);
  assert.equal(visivelNoCatalogo(atual), true, 'antes de remover, aparece');
  atual = { id: 'evt-0001', status: atual.status, moderacao: remocao.moderacao };
  assert.equal(visivelNoCatalogo(atual), false, 'removido não aparece na listagem');

  const volta = planejarModeracao(atual, 'restaurar', T0 + 2000);
  assert.equal(volta.ok, true);
  atual = { id: 'evt-0001', status: atual.status, moderacao: volta.moderacao };
  assert.equal(visivelNoCatalogo(atual), true, 'restaurado volta a aparecer');
  assert.equal(atual.status, 'SUSPENDED', 'e continua suspenso');

  const liberacao = planejarModeracao(atual, 'desbloquear', T0 + 3000);
  assert.equal(liberacao.ok, true);
  assert.equal(liberacao.evento.status, 'PUBLISHED', 'volta para onde estava, quatro passos depois');
  assert.deepEqual(liberacao.moderacao, { previousStatus: null, suspendedAt: null, removedAt: null });
});

// ------------------------------------------------------- forma e instantes

test('as duas marcas de uma ação têm o MESMO instante', () => {
  // `agora` é parâmetro justamente para isso: dois `Date.now()` separados por
  // microssegundos não casariam na trilha, e alguém conferindo veria dois
  // momentos para um ato só.
  const r = planejarModeracao(evento('SETUP'), 'suspender', T0);
  assert.equal(r.moderacao.suspendedAt, ISO);
  assert.equal(new Date(r.moderacao.suspendedAt).getTime(), T0);
});

test('a marca aceita Date e texto, e data ilegível conta como ausente', () => {
  const comDate = planejarModeracao(
    evento('SUSPENDED', mod({ previousStatus: 'DRAFT', suspendedAt: new Date(T0 - 1000) })), 'desbloquear', T0,
  );
  assert.equal(comDate.ok, true, 'Date vale como marca');

  const ilegivel = planejarModeracao(
    evento('SUSPENDED', mod({ previousStatus: 'DRAFT', suspendedAt: 'ontem' })), 'desbloquear', T0,
  );
  assert.equal(ilegivel.ok, false);
  assert.equal(ilegivel.recusa, 'NAO_ESTA_SUSPENSO', 'marca ilegível não é marca');
});

test('evento sem linha de moderação é tratado como nunca moderado', () => {
  assert.equal(planejarModeracao(evento('PUBLISHED', null), 'suspender', T0).ok, true);
  assert.equal(planejarModeracao(evento('PUBLISHED', null), 'desbloquear', T0).recusa, 'NAO_ESTA_SUSPENSO');
  assert.equal(planejarModeracao(evento('PUBLISHED', null), 'restaurar', T0).recusa, 'NAO_ESTA_REMOVIDO');
  assert.equal(visivelNoCatalogo(evento('PUBLISHED', null)), true);
});

test('toda recusa tem motivo legível, e nenhuma vaza estado interno', () => {
  const recusas = [
    planejarModeracao(evento('ARQUIVADO'), 'suspender', T0),
    planejarModeracao(evento('PUBLISHED'), 'nada', T0),
    planejarModeracao(evento('FINISHED'), 'suspender', T0),
    planejarModeracao(suspensoDe('PUBLISHED'), 'suspender', T0),
    planejarModeracao(evento('PUBLISHED'), 'desbloquear', T0),
    planejarModeracao(evento('SUSPENDED', mod({ suspendedAt: ANTES })), 'desbloquear', T0),
    planejarModeracao(suspensoDe('PUBLISHED', { removedAt: ANTES }), 'excluir', T0),
    planejarModeracao(evento('PUBLISHED'), 'excluir', T0),
    planejarModeracao(evento('PUBLISHED'), 'restaurar', T0),
  ];
  for (const r of recusas) {
    assert.equal(r.ok, false);
    assert.ok(typeof r.porque === 'string' && r.porque.length >= 10, JSON.stringify(r));
    assert.ok(/[.!]$/.test(r.porque), `mensagem sem pontuação final: ${r.porque}`);
    assert.ok(!('evento' in r) && !('moderacao' in r), 'recusa não devolve mudança para gravar');
  }
  // Mais forte que contar: TODO motivo declarado tem de ser alcançável. Motivo
  // que nenhum cenário produz é código morto numa política de autorização, e
  // ninguém sabe se ele não dispara porque é impossível ou porque a checagem
  // que o produziria foi removida.
  assert.deepEqual(
    [...new Set(recusas.map((r) => r.recusa))].sort(),
    [...MOTIVOS_DE_RECUSA_DA_TRANSICAO].sort(),
    'todos os motivos declarados têm de ser alcançáveis, e nenhum a mais',
  );
});

test('exclusão FÍSICA não é oferecida, e isso é decisão', () => {
  // `Event` tem dezenas de relações, várias com onDelete: Restrict. Um DELETE
  // falharia no banco ou arrastaria o histórico de pessoas sem relação com o
  // motivo da remoção. Se alguém acrescentar a ação, este teste cai.
  assert.ok(!ACOES_DE_MODERACAO_DE_EVENTO.includes('apagar'));
  assert.ok(!ACOES_DE_MODERACAO_DE_EVENTO.includes('destruir'));
  for (const acao of ['apagar', 'destruir', 'purgar']) {
    assert.equal(planejarModeracao(suspensoDe('PUBLISHED'), acao, T0).recusa, 'ACAO_DESCONHECIDA');
  }
});

test('dado inconsistente: removido sem marca de suspensão não inventa uma', () => {
  // Removido implica suspenso quando tudo passou por esta política. Mas a
  // coluna pode ter sido escrita à mão, e restaurar não pode preencher um
  // instante de suspensão que ninguém registrou — a trilha passaria a afirmar
  // uma data que não aconteceu.
  const inconsistente = evento('SUSPENDED', mod({ removedAt: ANTES, suspendedAt: null, previousStatus: 'PUBLISHED' }));
  const r = planejarModeracao(inconsistente, 'restaurar', T0);
  assert.equal(r.ok, true);
  assert.equal(r.moderacao.removedAt, null, 'a remoção é desfeita');
  assert.equal(r.moderacao.suspendedAt, null, 'e nenhuma suspensão é inventada');
  assert.equal(r.moderacao.previousStatus, 'PUBLISHED', 'a volta continua guardada');
});

test('situação anterior fora do catálogo é tratada como ausente, não propagada', () => {
  // `anteriorGuardado` confere contra o catálogo em vez de afirmar com cast.
  // Sem isso, um valor de catálogo antigo atravessaria a política e iria para
  // a coluna como se fosse uma situação válida.
  const comLixo = evento('SUSPENDED', mod({ suspendedAt: ANTES, removedAt: ANTES, previousStatus: 'ARQUIVADO' }));
  const r = planejarModeracao(comLixo, 'restaurar', T0);
  assert.equal(r.ok, true);
  assert.equal(r.moderacao.previousStatus, null, 'valor fora do catálogo não é regravado');

  const naExclusao = planejarModeracao(
    evento('SUSPENDED', mod({ suspendedAt: ANTES, previousStatus: 'ARQUIVADO' })), 'excluir', T0,
  );
  assert.equal(naExclusao.ok, true);
  assert.equal(naExclusao.moderacao.previousStatus, null);
});
