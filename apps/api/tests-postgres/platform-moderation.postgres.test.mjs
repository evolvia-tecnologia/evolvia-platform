// Disposable CI database only; fixture rows are preserved.
//
// Quatro provas que nenhum teste com cliente falso consegue dar, porque
// dependem do PostgreSQL avaliando as próprias regras:
//
//  1. as CHECK e os gatilhos da migration recusam de fato o que a política
//     nunca produz — até aqui isso era comparação de texto entre o SQL e o
//     módulo, não comportamento observado;
//  2. o upsert do Prisma preserva a fotografia do status original no caminho
//     em que o payload de update a OMITE de propósito. O banco avalia as CHECK
//     sobre a tupla do INSERT antes de arbitrar o conflito, então essa é a
//     passagem em que a moderação quebraria sem ninguém perceber em teste
//     unitário;
//  3. o ciclo inteiro devolve o status EXATO de partida, com escrita real nas
//     três tabelas — é a propriedade que impede um rascunho suspenso de
//     reaparecer publicado;
//  4. a trilha resiste a TRUNCATE. Gatilho de linha não dispara em TRUNCATE,
//     então as recusas de UPDATE e DELETE não bastam: é uma propriedade do
//     motor, invisível a qualquer teste que não fale com o banco de verdade.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
// Os padrões de recusa aceitam tanto o nome da constraint quanto a frase
// canônica do PostgreSQL: o Prisma embrulha o erro do banco e nem toda versão
// repete o nome. Exigir só o nome tornaria o teste frágil a detalhe de driver,
// sem ganhar precisão sobre o que importa — que a recusa veio de uma CHECK.
import { PrismaClient } from '@prisma/client';
import { decidirModeracao } from '../dist/platform-moderation-policy.js';
import { aplicarPlano, planejarGravacao } from '../dist/platform-moderation-transaction.js';

const db = new PrismaClient();
after(() => db.$disconnect());

async function cenario(status = 'PUBLISHED') {
  const chave = randomUUID();
  const dono = await db.user.create({
    data: { name: 'PG moderação', email: `moderacao-${chave}@evolvia-ci.local`, passwordHash: 'fixture' },
  });
  const organizacao = await db.organization.create({
    data: { name: 'PG moderação', slug: `moderacao-${randomUUID()}`, createdById: dono.id },
  });
  const evento = await db.event.create({
    data: {
      ownerId: dono.id, organizationId: organizacao.id, name: 'Moderação',
      slug: `moderacao-${randomUUID()}`, eventType: 'Congresso', format: 'IN_PERSON',
      registrationMode: 'FREE', status,
    },
  });
  return { dono, organizacao, evento };
}

const pedido = (extra) => ({
  ehMaster: true, atorUserId: 'master-1', classificacao: 'VIOLACAO_DE_REGRA',
  motivo: 'Denúncia confirmada.', referenciaDoCaso: 'CASO-PG-001', ...extra,
});

/** Executa uma ação de ponta a ponta, como o serviço fará. */
async function moderar(evento, organizacao, entradaDoPedido, extraDaGravacao = {}) {
  const linha = await db.platformEventModeration.findUnique({ where: { eventId: evento.id } });
  const atual = await db.event.findUniqueOrThrow({ where: { id: evento.id }, select: { status: true } });
  const veredito = decidirModeracao(pedido({
    estadoAtual: linha?.state ?? 'ATIVO',
    statusDoEvento: atual.status,
    statusOriginal: linha?.originalEventStatus ?? null,
    estadoAnterior: linha?.previousState ?? null,
    ...entradaDoPedido,
  }));
  assert.equal(veredito.permitido, true, `a política recusou: ${veredito.motivo}`);
  const plano = planejarGravacao({
    eventId: evento.id, organizationId: organizacao.id, acao: entradaDoPedido.acao,
    classificacao: 'VIOLACAO_DE_REGRA', veredito, linhaAtual: linha,
    statusDoEvento: atual.status, atorUserId: 'master-1', correlationId: randomUUID(),
    ...extraDaGravacao,
  });
  assert.equal(plano.gravar, true, `o plano recusou: ${plano.motivo}`);
  await db.$transaction((tx) => aplicarPlano(tx, plano));
  return plano;
}

test('PostgreSQL recusa estado sem fotografia e fotografia residual em ATIVO', async () => {
  const { organizacao, evento } = await cenario();
  const comum = { eventId: evento.id, organizationId: organizacao.id };
  await assert.rejects(
    db.platformEventModeration.create({ data: { ...comum, state: 'SUSPENSO', originalEventStatus: null } }),
    /fotografia_obrigatoria|violates check constraint/u,
    'o banco aceitou estado fora de ATIVO sem para onde voltar',
  );
  await assert.rejects(
    db.platformEventModeration.create({ data: { ...comum, state: 'ATIVO', originalEventStatus: 'PUBLISHED' } }),
    /ativo_sem_fotografia|violates check constraint/u,
    'o banco aceitou fotografia residual num estado limpo',
  );
  const valida = await db.platformEventModeration.create({
    data: { ...comum, state: 'SUSPENSO', originalEventStatus: 'PUBLISHED' },
  });
  assert.equal(valida.state, 'SUSPENSO');
});

test('PostgreSQL exige segunda aprovação de pessoa diferente para remover', async () => {
  const { organizacao, evento } = await cenario();
  const base = {
    eventId: evento.id, organizationId: organizacao.id, fromState: 'SUSPENSO', toState: 'REMOVIDO',
    eventStatusBefore: 'SUSPENDED', eventStatusAfter: 'SUSPENDED', classification: 'FRAUDE_SUSPEITA',
    reason: 'x', caseRef: 'CASO-PG-002', actorUserId: 'master-1', correlationId: randomUUID(),
  };
  for (const aprovador of ['', 'master-1']) {
    await assert.rejects(
      db.platformEventModerationEvent.create({ data: { ...base, action: 'REMOVER', approverUserId: aprovador } }),
      /remocao_exige_segunda_aprovacao|violates check constraint/u,
      `o banco aceitou remoção com aprovador ${JSON.stringify(aprovador)}`,
    );
  }
  const aceita = await db.platformEventModerationEvent.create({
    data: { ...base, action: 'REMOVER', approverUserId: 'master-2' },
  });
  assert.equal(aceita.approverUserId, 'master-2');
  // Ação que não é remoção dispensa o segundo par de olhos.
  await db.platformEventModerationEvent.create({
    data: { ...base, action: 'SUSPENDER', fromState: 'ATIVO', toState: 'SUSPENSO', approverUserId: '' },
  });
});

test('a trilha é append-only de verdade: UPDATE e DELETE não passam', async () => {
  const { organizacao, evento } = await cenario();
  const registro = await db.platformEventModerationEvent.create({
    data: {
      eventId: evento.id, organizationId: organizacao.id, action: 'SUSPENDER',
      fromState: 'ATIVO', toState: 'SUSPENSO', eventStatusBefore: 'PUBLISHED', eventStatusAfter: 'SUSPENDED',
      classification: 'CONDUTA', reason: 'original', caseRef: 'CASO-PG-003',
      actorUserId: 'master-1', correlationId: randomUUID(),
    },
  });
  await assert.rejects(
    db.platformEventModerationEvent.update({ where: { id: registro.id }, data: { reason: 'reescrito' } }),
    /append-only/u,
  );
  await assert.rejects(
    db.platformEventModerationEvent.delete({ where: { id: registro.id } }),
    /append-only/u,
  );
  const depois = await db.platformEventModerationEvent.findUniqueOrThrow({ where: { id: registro.id } });
  assert.equal(depois.reason, 'original', 'a razão foi alterada apesar das recusas');
});

test('o ciclo completo devolve o status EXATO e preserva a fotografia no upsert', async () => {
  // DRAFT de propósito: é o status em que o defeito clássico aparece. Se a
  // liberação devolvesse um padrão, este evento voltaria publicado.
  const { organizacao, evento } = await cenario('DRAFT');

  await moderar(evento, organizacao, { acao: 'suspender' });
  const suspenso = await db.platformEventModeration.findUniqueOrThrow({ where: { eventId: evento.id } });
  assert.equal(suspenso.state, 'SUSPENSO');
  assert.equal(suspenso.originalEventStatus, 'DRAFT');
  assert.equal((await db.event.findUniqueOrThrow({ where: { id: evento.id } })).status, 'SUSPENDED');

  // A passagem que só o banco prova: o payload de update OMITE a fotografia,
  // e o ramo create do upsert precisa carregá-la para o INSERT não violar a
  // CHECK antes de o conflito ser arbitrado.
  const planoRemocao = await moderar(evento, organizacao,
    { acao: 'remover', segundaAprovacaoPor: 'master-2' }, { segundaAprovacaoPor: 'master-2' });
  assert.equal(Object.prototype.hasOwnProperty.call(planoRemocao.moderacao, 'originalEventStatus'), false,
    'o plano deixou de preservar por omissão: esta prova perdeu o sentido');
  const removido = await db.platformEventModeration.findUniqueOrThrow({ where: { eventId: evento.id } });
  assert.equal(removido.state, 'REMOVIDO');
  assert.equal(removido.previousState, 'SUSPENSO');
  assert.equal(removido.originalEventStatus, 'DRAFT', 'a remoção apagou a fotografia e a volta ficou impossível');

  await moderar(evento, organizacao, { acao: 'restaurar' });
  const restaurado = await db.platformEventModeration.findUniqueOrThrow({ where: { eventId: evento.id } });
  assert.equal(restaurado.state, 'SUSPENSO');
  assert.equal(restaurado.previousState, null, 'sair de REMOVIDO sem limpar previousState contamina a próxima remoção');
  assert.equal(restaurado.originalEventStatus, 'DRAFT');

  await moderar(evento, organizacao, { acao: 'liberar' });
  const liberado = await db.platformEventModeration.findUniqueOrThrow({ where: { eventId: evento.id } });
  assert.equal(liberado.state, 'ATIVO');
  assert.equal(liberado.originalEventStatus, null, 'sobrou fotografia num estado limpo');
  assert.equal((await db.event.findUniqueOrThrow({ where: { id: evento.id } })).status, 'DRAFT',
    'o evento não voltou ao status exato de partida');

  const trilha = await db.platformEventModerationEvent.findMany({
    where: { eventId: evento.id }, orderBy: { occurredAt: 'asc' }, select: { action: true },
  });
  assert.deepEqual(trilha.map((linha) => linha.action), ['SUSPENDER', 'REMOVER', 'RESTAURAR', 'LIBERAR']);
});

test('a trilha resiste a TRUNCATE: as recusas de UPDATE e DELETE não bastam', async () => {
  // Gatilho FOR EACH ROW não dispara em TRUNCATE. Sem um gatilho de statement,
  // uma única instrução esvazia a trilha inteira sem violar nenhuma das
  // recusas acima — e a trilha existe justamente para ser a prova que a
  // plataforma vai precisar numa disputa. Medido em PostgreSQL 16.15 antes do
  // reparo: o TRUNCATE apagou as linhas e não levantou erro.
  const { organizacao, evento } = await cenario();
  await db.platformEventModerationEvent.create({
    data: {
      eventId: evento.id, organizationId: organizacao.id, action: 'SUSPENDER',
      fromState: 'ATIVO', toState: 'SUSPENSO', eventStatusBefore: 'PUBLISHED', eventStatusAfter: 'SUSPENDED',
      classification: 'CONDUTA', reason: 'sobrevive ao truncate', caseRef: 'CASO-PG-004',
      actorUserId: 'master-1', correlationId: randomUUID(),
    },
  });
  const antes = await db.platformEventModerationEvent.count();
  assert.ok(antes > 0, 'trilha vazia: esta prova passaria por vacuidade');

  // O TRUNCATE vai dentro de uma transação que termina em rollback de
  // qualquer jeito, para que uma regressão aqui não leve consigo a trilha das
  // outras suítes. `truncou` separa "o banco recusou" de "o banco aceitou e
  // nós desfizemos", que é exatamente a diferença que esta prova mede.
  let truncou = false;
  await assert.rejects(
    db.$transaction(async (tx) => {
      // Constante literal, sem interpolação: não há entrada externa aqui.
      await tx.$executeRawUnsafe('TRUNCATE TABLE "PlatformEventModerationEvent"');
      truncou = true;
      throw new Error('rollback deliberado');
    }),
    (erro) => {
      assert.equal(truncou, false,
        'TRUNCATE passou: uma instrução esvazia a trilha append-only inteira');
      return /append-only/u.test(erro.message);
    },
  );

  assert.equal(await db.platformEventModerationEvent.count(), antes,
    'a trilha perdeu linhas');
});
