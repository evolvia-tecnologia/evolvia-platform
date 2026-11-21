// Disposable CI database only; fixture rows are preserved.
//
// A moderação não pode perder nem duplicar dinheiro (#691, item 8 da fila #640).
//
// POR QUE ESTE ARQUIVO EXISTE
// --------------------------
// A moderação escreve em três lugares: `PlatformEventModeration`, `Event.status`
// e a trilha. Não toca em inscrição, pedido, checkout, reembolso nem recibo —
// e é exatamente por isso que a prova é necessária. "Não toca" é uma afirmação
// sobre ausência, e ausência não se demonstra lendo o código: demonstra-se
// fotografando o estado financeiro, moderando, e conferindo que a fotografia
// não mudou em um único campo.
//
// O `updatedAt` entra na fotografia DE PROPÓSITO. Ele é o detector sensível:
// qualquer escrita na linha o altera, mesmo uma que regravasse o mesmo valor.
// Uma fotografia sem ele passaria por um UPDATE inócuo que, amanhã, deixaria de
// ser inócuo.
//
// O que cada caso cobre, do contrato da #691:
//
//   - checkout individual pago e pedido agrupado pago: nenhuma perda, nenhuma
//     duplicação, nem na suspensão nem na liberação;
//   - reembolso APROVADO com recibo: a decisão e o valor sobrevivem à moderação,
//     porque suspender o evento não desfaz uma aprovação que já aconteceu;
//   - estado terminal: evento FINISHED moderado preserva o status terminal E o
//     dinheiro, e a supressão do status é AFIRMADA no plano;
//   - isolamento: moderar a organização A não encosta no dinheiro da B.
//
// Os nomes dos modelos vieram do handoff do @Work em #691, e foram CONFERIDOS
// contra `apps/api/prisma/schema.prisma` em `develop` antes de escrever. Uma
// divergência apareceu na conferência: `EventRegistrationOrder.status` é
// `String @db.VarChar(24)` com default `"RESERVED"`, e não um enum. Por isso os
// casos afirmam que o valor é PRESERVADO, e não que ele pertence a um
// vocabulário que eu não posso verificar.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { decidirModeracao } from '../dist/platform-moderation-policy.js';
import { aplicarPlano, planejarGravacao } from '../dist/platform-moderation-transaction.js';

const db = new PrismaClient();
after(() => db.$disconnect());

const digest = () => randomBytes(32).toString('hex');
const PRECO_INDIVIDUAL = 15000;
const PRECO_AGRUPADO_UM = 9000;
const PRECO_AGRUPADO_DOIS = 12000;

/** Organização, evento, catálogo, categoria e lote. */
async function palco(status = 'PUBLISHED') {
  const chave = randomUUID();
  const dono = await db.user.create({
    data: { name: 'PG financeiro', email: `financeiro-${chave}@evolvia-ci.local`, passwordHash: 'fixture' },
  });
  const organizacao = await db.organization.create({
    data: { name: 'PG financeiro', slug: `financeiro-${chave}`, createdById: dono.id },
  });
  const evento = await db.event.create({
    data: {
      ownerId: dono.id, organizationId: organizacao.id, name: 'Moderação financeira',
      slug: `financeiro-${chave}`, eventType: 'Congresso', format: 'IN_PERSON',
      registrationMode: 'PAID', status,
    },
  });
  const catalogo = await db.eventRegistrationCatalog.create({
    data: { organizationId: organizacao.id, eventId: evento.id },
  });
  const categoria = await db.eventRegistrationCategory.create({
    data: {
      organizationId: organizacao.id, eventId: evento.id, catalogId: catalogo.id,
      code: `cat-${randomBytes(2).toString('hex')}`, name: 'Geral',
    },
  });
  const lote = await db.eventRegistrationLot.create({
    data: {
      organizationId: organizacao.id, eventId: evento.id, categoryId: categoria.id,
      code: `lot-${randomBytes(2).toString('hex')}`, name: 'Lote único',
      startsAt: new Date('2026-01-01T00:00:00.000Z'),
      endsAt: new Date('2026-12-31T00:00:00.000Z'),
      priceCents: PRECO_INDIVIDUAL,
    },
  });
  return { dono, organizacao, evento, categoria, lote };
}

async function inscricaoConfirmada(palcoAtual, precoCents) {
  const { organizacao, evento, categoria, lote } = palcoAtual;
  return db.eventRegistrationReservation.create({
    data: {
      organizationId: organizacao.id, eventId: evento.id,
      categoryId: categoria.id, lotId: lote.id,
      protocol: `EVO-${randomBytes(8).toString('hex').toUpperCase()}`,
      idempotencyKeyHash: digest(), payloadHash: digest(),
      identityHash: digest(), emailHash: digest(),
      registrationData: { canal: 'prova-financeira-moderacao' },
      basePriceCents: precoCents, finalPriceCents: precoCents,
      status: 'CONFIRMED', expiresAt: null,
      confirmedAt: new Date('2026-10-01T12:00:00.000Z'),
    },
  });
}

/** Checkout individual PAGO. */
async function checkoutPago(inscricao) {
  return db.eventRegistrationCheckout.create({
    data: {
      organizationId: inscricao.organizationId, eventId: inscricao.eventId,
      reservationId: inscricao.id,
      idempotencyKeyHash: digest(), requestHash: digest(),
      amountCents: inscricao.finalPriceCents,
      expiresAt: new Date('2026-10-02T12:00:00.000Z'),
      status: 'PAID', paidAt: new Date('2026-10-01T12:05:00.000Z'),
    },
  });
}

/** Pedido agrupado PAGO, com duas entradas ligadas a duas inscrições. */
async function pedidoAgrupadoPago(palcoAtual) {
  const { organizacao, evento, categoria, lote } = palcoAtual;
  const subtotal = PRECO_AGRUPADO_UM + PRECO_AGRUPADO_DOIS;
  const pedido = await db.eventRegistrationOrder.create({
    data: {
      organizationId: organizacao.id, eventId: evento.id,
      idempotencyKeyHash: digest(), payloadHash: digest(),
      // Coluna de texto livre, não enum — ver o cabeçalho deste arquivo.
      status: 'PAID', subtotalCents: subtotal,
    },
  });
  const entradas = [];
  for (const [posicao, preco] of [[1, PRECO_AGRUPADO_UM], [2, PRECO_AGRUPADO_DOIS]]) {
    const inscricao = await inscricaoConfirmada(palcoAtual, preco);
    entradas.push(await db.eventRegistrationOrderEntry.create({
      data: {
        organizationId: organizacao.id, eventId: evento.id, orderId: pedido.id,
        position: posicao, categoryId: categoria.id, lotId: lote.id,
        reservationId: inscricao.id,
        identityHash: inscricao.identityHash, emailHash: inscricao.emailHash,
        basePriceCents: preco, finalPriceCents: preco,
      },
    }));
  }
  const checkout = await db.eventRegistrationOrderCheckout.create({
    data: {
      organizationId: organizacao.id, eventId: evento.id, orderId: pedido.id,
      idempotencyKeyHash: digest(), requestHash: digest(),
      amountCents: subtotal,
      expiresAt: new Date('2026-10-02T12:00:00.000Z'),
      status: 'PAID', paidAt: new Date('2026-10-01T12:10:00.000Z'),
    },
  });
  return { pedido, entradas, checkout };
}

/** Reembolso APROVADO, com recibo emitido. */
async function reembolsoAprovado(inscricao, checkout) {
  const pedido = await db.registrationRefundRequest.create({
    data: {
      reservationId: inscricao.id, eventId: inscricao.eventId,
      organizationId: inscricao.organizationId,
      reason: 'Não poderei comparecer a este evento.',
      status: 'APPROVED',
      decisionNote: 'Dentro da regra aceita na compra.',
      decidedByUserId: 'organizador-1',
      decidedAt: new Date('2026-10-03T09:00:00.000Z'),
      preparedCheckoutId: checkout.id,
      preparedAmountCents: checkout.amountCents,
      sandboxPaymentId: `sandbox-${randomBytes(6).toString('hex')}`,
    },
  });
  const recibo = await db.mockRefundReceipt.create({
    data: {
      requestId: pedido.id,
      paymentId: `sandbox-pay-${randomBytes(6).toString('hex')}`,
      amountCents: checkout.amountCents,
      issuedAt: new Date('2026-10-03T09:05:00.000Z'),
    },
  });
  return { pedido, recibo };
}

/**
 * Fotografia do estado financeiro do evento, em forma canônica.
 *
 * Ordenada por id para não depender da ordem que o banco devolve, e com
 * `updatedAt` incluído: é ele que delata qualquer escrita, inclusive uma que
 * regravasse o mesmo valor.
 */
async function fotografiaFinanceira(eventId) {
  const ordem = { orderBy: { id: 'asc' } };
  const [inscricoes, checkouts, pedidos, entradas, checkoutsAgrupados, reembolsos] = await Promise.all([
    db.eventRegistrationReservation.findMany({ where: { eventId }, ...ordem }),
    db.eventRegistrationCheckout.findMany({ where: { eventId }, ...ordem }),
    db.eventRegistrationOrder.findMany({ where: { eventId }, ...ordem }),
    db.eventRegistrationOrderEntry.findMany({ where: { eventId }, ...ordem }),
    db.eventRegistrationOrderCheckout.findMany({ where: { eventId }, ...ordem }),
    db.registrationRefundRequest.findMany({ where: { eventId }, ...ordem }),
  ]);
  const recibos = await db.mockRefundReceipt.findMany({
    where: { requestId: { in: reembolsos.map((linha) => linha.id) } },
    orderBy: { requestId: 'asc' },
  });
  // `JSON.stringify` com chaves ordenadas: duas leituras iguais têm de produzir
  // o mesmo texto, senão a comparação acusaria diferença onde não houve.
  const canonico = (valor) => JSON.stringify(valor, (_chave, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)));
    }
    return v;
  });
  return {
    texto: canonico({ inscricoes, checkouts, pedidos, entradas, checkoutsAgrupados, reembolsos, recibos }),
    contagens: {
      inscricoes: inscricoes.length, checkouts: checkouts.length, pedidos: pedidos.length,
      entradas: entradas.length, checkoutsAgrupados: checkoutsAgrupados.length,
      reembolsos: reembolsos.length, recibos: recibos.length,
    },
    somaPaga: checkouts.filter((c) => c.status === 'PAID').reduce((t, c) => t + c.amountCents, 0)
      + checkoutsAgrupados.filter((c) => c.status === 'PAID').reduce((t, c) => t + c.amountCents, 0),
  };
}

const pedidoDeModeracao = (extra) => ({
  ehMaster: true, atorUserId: 'master-1', classificacao: 'VIOLACAO_DE_REGRA',
  motivo: 'Denúncia confirmada.', referenciaDoCaso: 'CASO-PG-FIN', ...extra,
});

/** Uma ação de moderação de ponta a ponta, como o serviço fará. */
async function moderar(evento, organizacao, entrada, extraDaGravacao = {}) {
  const linha = await db.platformEventModeration.findUnique({ where: { eventId: evento.id } });
  const atual = await db.event.findUniqueOrThrow({ where: { id: evento.id }, select: { status: true } });
  const veredito = decidirModeracao(pedidoDeModeracao({
    estadoAtual: linha?.state ?? 'ATIVO',
    statusDoEvento: atual.status,
    statusOriginal: linha?.originalEventStatus ?? null,
    estadoAnterior: linha?.previousState ?? null,
    ...entrada,
  }));
  assert.equal(veredito.permitido, true, `a política recusou: ${veredito.motivo}`);
  const plano = planejarGravacao({
    eventId: evento.id, organizationId: organizacao.id, acao: entrada.acao,
    classificacao: 'VIOLACAO_DE_REGRA', veredito, linhaAtual: linha,
    statusDoEvento: atual.status, atorUserId: 'master-1', correlationId: randomUUID(),
    ...extraDaGravacao,
  });
  assert.equal(plano.gravar, true, `o plano recusou: ${plano.motivo}`);
  await db.$transaction((tx) => aplicarPlano(tx, plano));
  return plano;
}

const statusDoEvento = async (id) =>
  (await db.event.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

test('suspender e liberar não alteram um centavo, e o status volta exato', { timeout: 120000 }, async () => {
  const cena = await palco('PUBLISHED');
  const individual = await inscricaoConfirmada(cena, PRECO_INDIVIDUAL);
  const checkout = await checkoutPago(individual);
  await pedidoAgrupadoPago(cena);
  await reembolsoAprovado(individual, checkout);

  const antes = await fotografiaFinanceira(cena.evento.id);
  // Guarda contra fotografia vazia: um teste que compara nada com nada passa.
  assert.deepEqual(antes.contagens, {
    inscricoes: 3, checkouts: 1, pedidos: 1, entradas: 2,
    checkoutsAgrupados: 1, reembolsos: 1, recibos: 1,
  }, 'a cena financeira não foi montada: os casos abaixo não provariam nada');
  assert.equal(antes.somaPaga, PRECO_INDIVIDUAL + PRECO_AGRUPADO_UM + PRECO_AGRUPADO_DOIS);

  await moderar(cena.evento, cena.organizacao, { acao: 'suspender' });
  assert.equal(await statusDoEvento(cena.evento.id), 'SUSPENDED');

  const durante = await fotografiaFinanceira(cena.evento.id);
  assert.equal(durante.texto, antes.texto,
    'a suspensão alterou dado financeiro: nenhuma linha de inscrição, pedido, checkout, reembolso ou recibo pode mudar');
  assert.deepEqual(durante.contagens, antes.contagens, 'a suspensão perdeu ou duplicou linha financeira');
  assert.equal(durante.somaPaga, antes.somaPaga);

  await moderar(cena.evento, cena.organizacao, { acao: 'liberar' });
  assert.equal(await statusDoEvento(cena.evento.id), 'PUBLISHED',
    'a liberação não devolveu o status exato de partida');

  const depois = await fotografiaFinanceira(cena.evento.id);
  assert.equal(depois.texto, antes.texto, 'a liberação alterou dado financeiro');
  assert.deepEqual(depois.contagens, antes.contagens, 'a liberação perdeu ou duplicou linha financeira');
  assert.equal(depois.somaPaga, antes.somaPaga);

  // O reembolso APROVADO continua aprovado: suspender o evento não desfaz uma
  // decisão que já aconteceu, e o recibo não é reemitido.
  const reembolso = await db.registrationRefundRequest.findFirstOrThrow({
    where: { eventId: cena.evento.id }, include: { mockReceipt: true },
  });
  assert.equal(reembolso.status, 'APPROVED');
  assert.equal(reembolso.decidedByUserId, 'organizador-1');
  assert.equal(reembolso.mockReceipt.amountCents, PRECO_INDIVIDUAL);
  assert.equal(await db.mockRefundReceipt.count({ where: { requestId: reembolso.id } }), 1,
    'o recibo foi duplicado');

  // E a moderação de fato aconteceu — senão tudo acima estaria preservado por
  // nada ter sido feito.
  const trilha = await db.platformEventModerationEvent.findMany({
    where: { eventId: cena.evento.id }, orderBy: { occurredAt: 'asc' }, select: { action: true },
  });
  assert.deepEqual(trilha.map((l) => l.action), ['SUSPENDER', 'LIBERAR'],
    'a moderação não registrou as duas ações: a preservação acima pode ser de um no-op');
  const estado = await db.platformEventModeration.findUniqueOrThrow({ where: { eventId: cena.evento.id } });
  assert.equal(estado.state, 'ATIVO');
  assert.equal(estado.originalEventStatus, null);
});

test('evento FINISHED moderado preserva o status terminal E o dinheiro', { timeout: 120000 }, async () => {
  // Decisão de produto de 20/11: estado terminal pode ser moderado com motivo e
  // trilha, preservando o status terminal e os reembolsos anteriores. O risco
  // concreto é a moderação reescrever `FINISHED` para `SUSPENDED` e o evento
  // deixar de constar como realizado — com certificado e prestação de contas
  // penduradas nisso.
  const cena = await palco('FINISHED');
  const individual = await inscricaoConfirmada(cena, PRECO_INDIVIDUAL);
  const checkout = await checkoutPago(individual);
  await reembolsoAprovado(individual, checkout);

  const antes = await fotografiaFinanceira(cena.evento.id);
  assert.equal(antes.contagens.reembolsos, 1, 'a cena não tem reembolso: o caso não provaria preservação');

  const plano = await moderar(cena.evento, cena.organizacao, { acao: 'suspender' });

  // A SUPRESSÃO TEM DE SER AFIRMADA, e não inferida de um `null`.
  //
  // `platform-moderation-transaction.ts` declara que
  // `statusPreservadoPorSerTerminal` existe "para que a supressão seja afirmada
  // e auditável em vez de inferida de um null". Afirmar apenas que o status não
  // mudou deixaria passar um plano que suprimisse SEM registrar — e quem
  // precisasse reconstituir o caso depois não teria o campo que explica por que
  // o status ficou como estava.
  assert.equal(plano.statusPreservadoPorSerTerminal, true,
    'a supressão do status terminal não foi registrada no plano: ela ficou silenciosa');
  // E o plano não pode nem PEDIR a escrita: sem isto, um plano que pedisse e
  // falhasse em aplicar produziria o mesmo estado final observável.
  assert.equal(plano.statusDoEventoNovo, null,
    'o plano pediu escrita em Event.status num evento terminal');

  assert.equal(await statusDoEvento(cena.evento.id), 'FINISHED',
    'a moderação reescreveu um status terminal: o evento deixou de constar como realizado');
  const estado = await db.platformEventModeration.findUniqueOrThrow({ where: { eventId: cena.evento.id } });
  assert.equal(estado.state, 'SUSPENSO', 'o efeito da moderação não foi registrado');
  assert.equal(estado.originalEventStatus, 'FINISHED', 'a fotografia do status terminal não foi guardada');

  const depois = await fotografiaFinanceira(cena.evento.id);
  assert.equal(depois.texto, antes.texto, 'moderar um evento terminal alterou dado financeiro');
  assert.equal(depois.somaPaga, antes.somaPaga);
});

test('moderar a organização A não encosta no dinheiro da organização B', { timeout: 120000 }, async () => {
  const a = await palco('PUBLISHED');
  const b = await palco('PUBLISHED');
  assert.notEqual(a.organizacao.id, b.organizacao.id);

  const inscricaoA = await inscricaoConfirmada(a, PRECO_INDIVIDUAL);
  await checkoutPago(inscricaoA);
  await pedidoAgrupadoPago(a);
  const inscricaoB = await inscricaoConfirmada(b, PRECO_INDIVIDUAL);
  const checkoutB = await checkoutPago(inscricaoB);
  await reembolsoAprovado(inscricaoB, checkoutB);

  const antesB = await fotografiaFinanceira(b.evento.id);
  assert.ok(antesB.contagens.reembolsos === 1 && antesB.somaPaga > 0, 'a cena B não foi montada');

  await moderar(a.evento, a.organizacao, { acao: 'suspender' });

  assert.equal(await statusDoEvento(a.evento.id), 'SUSPENDED');
  assert.equal(await statusDoEvento(b.evento.id), 'PUBLISHED',
    'moderar A mudou o status do evento de B');
  const depoisB = await fotografiaFinanceira(b.evento.id);
  assert.equal(depoisB.texto, antesB.texto, 'moderar A alterou dado financeiro de B');

  // B não ganhou linha de moderação nenhuma.
  assert.equal(await db.platformEventModeration.count({ where: { eventId: b.evento.id } }), 0,
    'moderar A criou estado de moderação em B');
  assert.equal(await db.platformEventModerationEvent.count({ where: { eventId: b.evento.id } }), 0,
    'moderar A escreveu trilha em B');
});
