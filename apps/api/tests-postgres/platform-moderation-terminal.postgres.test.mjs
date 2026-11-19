// Disposable CI PostgreSQL only. Unique fixture data is preserved, never deleted.
//
// `Event.status` de evento terminal, lido DURANTE a moderação.
//
// É o teste que cliente falso não dá. O defeito original não era de cálculo — o
// plano sempre soube o status certo — era de ESCRITA: `aplicarPlano` mandava
// `Event.status = SUSPENDED` por cima de `FINISHED`, e a fotografia só devolvia
// na liberação. Durante toda a investigação o evento deixava de constar como
// encerrado. Quem responde se a coluna ficou intacta é o banco, lido entre as
// ações.
//
// Cada momento é um `findUnique` NOVO. Reaproveitar o objeto da leitura anterior
// provaria a minha variável, não a coluna.
//
// Isto exercita também as duas `CHECK` da migration com fotografia terminal,
// que é estado novo para elas. O módulo puro já confere a invariante sobre a
// linha resultante; conferir contra a própria constraint é o que distingue "a
// minha regra concorda comigo" de "o banco aceita".
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { decidirModeracao } from '../src/platform-moderation-policy.ts';
import { aplicarPlano, planejarGravacao } from '../src/platform-moderation-transaction.ts';

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

const MOTIVO = 'Denúncia confirmada pela auditoria interna da plataforma.';
const CLASSIFICACAO = 'VIOLACAO_DE_REGRA';
const ATOR = 'master-ator';
const APROVADOR = 'master-aprovador';

/**
 * Fixture próprio: `master-fixtures.mjs` vive na branch da #675 e não existe
 * nesta. Campos obrigatórios conferidos contra o schema, não presumidos.
 */
async function eventoCom(status) {
  const chave = randomUUID();
  const dono = await prisma.user.create({
    data: { name: 'MOD dono', email: `moderacao-${chave}@evolvia-ci.local`, passwordHash: 'fixture' },
  });
  const org = await prisma.organization.create({
    data: { name: `MOD org ${chave}`, slug: `mod-org-${chave}`, createdById: dono.id },
  });
  const evento = await prisma.event.create({
    data: {
      ownerId: dono.id,
      organizationId: org.id,
      name: `MOD evento ${status}`,
      slug: `mod-evento-${chave}`,
      eventType: 'Congresso',
      format: 'IN_PERSON',
      registrationMode: 'FREE',
      status,
    },
  });
  return { dono, org, evento };
}

/** O status como está no banco AGORA. Sempre uma leitura nova. */
async function statusNoBanco(eventId) {
  const linha = await prisma.event.findUnique({ where: { id: eventId }, select: { status: true } });
  return linha === null ? null : String(linha.status);
}

const moderacaoNoBanco = (eventId) => prisma.platformEventModeration.findUnique({
  where: { eventId },
  select: { state: true, previousState: true, originalEventStatus: true },
});

const trilhaNoBanco = (eventId) => prisma.platformEventModerationEvent.findMany({
  where: { eventId },
  select: { action: true, eventStatusBefore: true, eventStatusAfter: true, originalEventStatus: true },
  orderBy: { occurredAt: 'asc' },
});

/**
 * Roda uma ação de moderação pelo caminho real: política, plano e transação.
 *
 * O status e a linha atual são LIDOS do banco, como o serviço fará — passar o
 * que o teste acha que está lá esconderia justamente o defeito que isto mede.
 */
async function moderar(contexto, acao, extra = {}) {
  const { evento, org } = contexto;
  const statusAtual = await statusNoBanco(evento.id);
  const linha = await moderacaoNoBanco(evento.id);

  const veredito = decidirModeracao({
    acao,
    estadoAtual: linha?.state ?? 'ATIVO',
    estadoAnterior: linha?.previousState ?? null,
    statusOriginal: linha?.originalEventStatus ?? null,
    statusDoEvento: statusAtual,
    ehMaster: true,
    atorUserId: ATOR,
    classificacao: CLASSIFICACAO,
    motivo: MOTIVO,
    referenciaDoCaso: 'CASO-2026-PG',
    permitirSemSuspensaoPrevia: true,
    segundaAprovacaoPor: APROVADOR,
    ...extra,
  });
  assert.equal(veredito.permitido, true, `${acao} recusado pela política: ${veredito.motivo}`);

  const plano = planejarGravacao({
    eventId: evento.id,
    organizationId: org.id,
    acao,
    veredito,
    classificacao: CLASSIFICACAO,
    linhaAtual: linha,
    statusDoEvento: statusAtual,
    atorUserId: ATOR,
    segundaAprovacaoPor: APROVADOR,
    correlationId: `pg-${randomUUID()}`.slice(0, 64),
  });
  assert.equal(plano.gravar, true, `${acao} não gravaria: ${plano.motivo}`);

  await prisma.$transaction((tx) => aplicarPlano(tx, plano));
  return plano;
}

for (const terminal of ['FINISHED', 'CANCELLED']) {
  test(`${terminal}: suspender e liberar nunca tocam Event.status`, { timeout: 120000 }, async () => {
    const c = await eventoCom(terminal);

    // ANTES
    assert.equal(await statusNoBanco(c.evento.id), terminal, 'a fixture não nasceu no estado terminal');

    const suspensao = await moderar(c, 'suspender');
    assert.equal(suspensao.statusPreservadoPorSerTerminal, true);

    // DURANTE — esta é a leitura que o Work pediu, e a que o defeito reprovava.
    assert.equal(
      await statusNoBanco(c.evento.id), terminal,
      `o evento deixou de constar como ${terminal} durante a moderação`,
    );

    // A restrição existe — só mora na linha de moderação, não no status.
    const suspenso = await moderacaoNoBanco(c.evento.id);
    assert.equal(suspenso.state, 'SUSPENSO', 'a restrição administrativa não foi registrada');
    assert.equal(
      String(suspenso.originalEventStatus), terminal,
      'a CHECK exige fotografia fora de ATIVO, e ela tem de ser o próprio estado terminal',
    );

    await moderar(c, 'liberar');

    // DEPOIS
    assert.equal(
      await statusNoBanco(c.evento.id), terminal,
      `liberar reabriu o evento: ${terminal} não pode virar outra coisa`,
    );
    const liberado = await moderacaoNoBanco(c.evento.id);
    assert.equal(liberado.state, 'ATIVO');
    assert.equal(liberado.originalEventStatus, null, 'fotografia residual em ATIVO viola a CHECK');

    // A trilha conta a história sem mentir sobre o ciclo de vida.
    const trilha = await trilhaNoBanco(c.evento.id);
    assert.deepEqual(trilha.map((l) => String(l.action)), ['SUSPENDER', 'LIBERAR']);
    for (const linha of trilha) {
      assert.equal(String(linha.eventStatusBefore), terminal);
      assert.equal(
        String(linha.eventStatusAfter), terminal,
        'a trilha afirmaria uma mudança de ciclo de vida que não houve',
      );
    }
  });

  test(`${terminal}: remover e restaurar nunca tocam Event.status`, { timeout: 120000 }, async () => {
    const c = await eventoCom(terminal);
    assert.equal(await statusNoBanco(c.evento.id), terminal);

    await moderar(c, 'suspender');
    assert.equal(await statusNoBanco(c.evento.id), terminal, 'após suspender');

    await moderar(c, 'remover');
    assert.equal(await statusNoBanco(c.evento.id), terminal, 'após remover');
    const removido = await moderacaoNoBanco(c.evento.id);
    assert.equal(removido.state, 'REMOVIDO');
    assert.equal(removido.previousState, 'SUSPENSO', 'a restauração precisa saber de onde voltar');
    assert.equal(String(removido.originalEventStatus), terminal, 'remover sobrescreveu a fotografia preservada');

    await moderar(c, 'restaurar');
    assert.equal(
      await statusNoBanco(c.evento.id), terminal,
      `restaurar reabriu o evento: ${terminal} não pode virar outra coisa`,
    );
    const restaurado = await moderacaoNoBanco(c.evento.id);
    assert.equal(restaurado.state, 'SUSPENSO', 'restaurar devolve ao estado anterior, não a ATIVO');
    assert.equal(restaurado.previousState, null, 'sair de REMOVIDO sem limpar faria uma remoção futura herdar o anterior');
  });
}

test('CONTROLE POSITIVO: evento PUBLISHED É suspenso e volta ao publicado', { timeout: 120000 }, async () => {
  // Sem este caso, a suíte passaria caso eu tivesse desligado a escrita de
  // `Event.status` inteira — e aí suspender um evento no ar não teria efeito
  // nenhum sobre o ciclo de vida, que é um defeito pior que o corrigido.
  const c = await eventoCom('PUBLISHED');
  assert.equal(await statusNoBanco(c.evento.id), 'PUBLISHED');

  const suspensao = await moderar(c, 'suspender');
  assert.equal(suspensao.statusPreservadoPorSerTerminal, false, 'a regra terminal vazou para um evento no ar');
  assert.equal(
    await statusNoBanco(c.evento.id), 'SUSPENDED',
    'suspender evento no ar precisa sair do ar: sem isso a moderação não barra nada',
  );

  await moderar(c, 'liberar');
  assert.equal(
    await statusNoBanco(c.evento.id), 'PUBLISHED',
    'liberar devolveu status diferente do original: é a fotografia que impede publicar o que não foi publicado',
  );
});

test('CONTROLE POSITIVO: rascunho suspenso volta a rascunho, e não publicado', { timeout: 120000 }, async () => {
  // O risco número 1 do corpo da #691: se a liberação devolvesse um valor fixo,
  // a plataforma publicaria, em nome do organizador, algo que ele não publicou.
  const c = await eventoCom('DRAFT');

  await moderar(c, 'suspender');
  assert.equal(await statusNoBanco(c.evento.id), 'SUSPENDED');

  await moderar(c, 'liberar');
  assert.equal(
    await statusNoBanco(c.evento.id), 'DRAFT',
    'a plataforma publicou em nome do organizador algo que ele nunca publicou',
  );
});
