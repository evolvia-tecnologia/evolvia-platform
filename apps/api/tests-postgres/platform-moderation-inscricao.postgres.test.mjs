// Disposable CI PostgreSQL only. Unique fixture data is preserved, never deleted.
//
// A moderação recusa INSCRIÇÃO NOVA, e a recusa vem da linha de moderação.
//
// O cenário precisa de cuidado, e eu errei o primeiro plano deste arquivo antes
// de perceber: suspender um evento `PUBLISHED` pela transação também grava
// `Event.status = SUSPENDED`, e aí a conferência de status que JÁ existia em
// `reserve` recusa com a MESMA frase. O teste ficaria verde sem provar nada:
// quem barrou teria sido o status.
//
// Por isso o cenário é montado na combinação que separa as duas coisas: evento
// **PUBLISHED** com linha de moderação bloqueando, escrita direta na tabela. O
// que está em prova aqui é o CONSUMIDOR; o escritor tem as suas próprias
// portas, em `platform-moderation.postgres.test.mjs` e
// `platform-moderation-terminal.postgres.test.mjs`.
//
// A combinação não é artificial — é a razão de o enforcement não poder depender
// de `Event.status`:
//
//   - estado de moderação é restrição administrativa; status é ciclo de vida.
//     Confundir os dois foi o defeito corrigido em #691;
//   - para evento terminal a moderação nunca escreve `Event.status`, e a linha
//     passa a ser o único guarda;
//   - e se algum caminho futuro republicar o evento sem olhar a moderação, o
//     status passa e a linha tem de barrar.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const { RegistrationReservationsService } = await import('../dist/registration-reservations.service.js');

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

/**
 * Dublê que LANÇA se for usado.
 *
 * A recusa de moderação acontece antes de asaas, webhooks e reembolsos. Um
 * dublê silencioso esconderia uma mudança futura que passasse a tocá-los antes
 * da conferência; um que lança a denuncia na hora.
 */
const naoDeveriaSerUsado = (nome) => new Proxy({}, {
  get: (_alvo, prop) => () => {
    throw new Error(`a dependência "${nome}.${String(prop)}" foi chamada antes da recusa de moderação`);
  },
});

const servico = new RegistrationReservationsService(
  prisma,
  naoDeveriaSerUsado('asaas'),
  naoDeveriaSerUsado('webhooks'),
  naoDeveriaSerUsado('refunds'),
);

const INDISPONIVEL = /Inscrições indisponíveis para este evento/u;

/** Evento PUBLISHED e gratuito, pronto para receber inscrição. */
async function eventoPublicado(rotulo) {
  const chave = randomUUID();
  const dono = await prisma.user.create({
    data: { name: `INSC dono ${rotulo}`, email: `insc-dono-${chave}@evolvia-ci.local`, passwordHash: 'fixture' },
  });
  const org = await prisma.organization.create({
    data: { name: `INSC org ${chave}`, slug: `insc-org-${chave}`, createdById: dono.id },
  });
  const evento = await prisma.event.create({
    data: {
      ownerId: dono.id,
      organizationId: org.id,
      name: `INSC evento ${rotulo}`,
      slug: `insc-evento-${chave}`,
      eventType: 'Congresso',
      format: 'IN_PERSON',
      registrationMode: 'FREE',
      status: 'PUBLISHED',
    },
  });
  return { dono, org, evento };
}

/**
 * Linha de moderação escrita direto, sem passar pela transação.
 *
 * `originalEventStatus` é obrigatório fora de `ATIVO` pela CHECK da migration,
 * e nulo em `ATIVO` pela outra — então os dois casos aqui respeitam as mesmas
 * invariantes que o escritor respeita.
 */
const moderar = (contexto, state) => prisma.platformEventModeration.create({
  data: {
    eventId: contexto.evento.id,
    organizationId: contexto.org.id,
    state,
    originalEventStatus: state === 'ATIVO' ? null : 'PUBLISHED',
    lastReason: 'Denuncia em apuracao pela plataforma, registro de CI.',
    lastCaseRef: `CASO-CI-${randomUUID().slice(0, 8)}`,
  },
});

/**
 * Ficha válida: os campos obrigatórios vêm de `REQUIRED_CODES` em
 * `registration-reservations-policy`, conferidos no arquivo e não presumidos.
 * O documento é um CPF sintético que passa no dígito verificador — inválido
 * seria recusado antes da transação e o caso mediria a validação de ficha.
 */
const ficha = () => ({
  categoryId: 'categoria-ci-0001',
  lotId: 'lote-ci-00000001',
  answers: {
    full_name: 'Pessoa Sintetica de Teste',
    preferred_name: 'Pessoa',
    identity_document: '529.982.247-25',
    email: `insc-${randomUUID()}@evolvia-ci.local`,
    phone: '11912345678',
    terms_acceptance: true,
  },
});

const chaveDeIdempotencia = () => `idem-ci-${randomUUID()}`;

/** Devolve o erro em vez de deixá-lo subir. */
async function recusa(executar) {
  try {
    await executar();
  } catch (erro) {
    return erro;
  }
  return null;
}

const tentarInscrever = (contexto) => recusa(
  () => servico.reserve(contexto.evento.slug, ficha(), chaveDeIdempotencia()),
);

for (const estado of ['SUSPENSO', 'REMOVIDO']) {
  test(`evento PUBLISHED com moderação ${estado} recusa inscrição nova`, { timeout: 120000 }, async () => {
    const c = await eventoPublicado(estado.toLowerCase());
    await moderar(c, estado);

    // O status continua PUBLISHED: se a recusa vier, veio da moderação.
    const antes = await prisma.event.findUnique({ where: { id: c.evento.id }, select: { status: true } });
    assert.equal(String(antes.status), 'PUBLISHED', 'o cenário perdeu o sentido: o status já barraria sozinho');

    const erro = await tentarInscrever(c);

    assert.ok(erro, `inscrição nova foi aceita em evento ${estado}`);
    assert.match(
      String(erro.message),
      INDISPONIVEL,
      `a recusa veio de outro lugar, não da moderação: ${erro.message}`,
    );
    assert.equal(erro.getStatus?.(), 404, 'a recusa pública não pode distinguir evento moderado de inexistente');
  });
}

test('CONTROLE: sem linha de moderação, a mesma chamada falha por OUTRO motivo', { timeout: 120000 }, async () => {
  // Este caso é o que dá sentido aos dois acima. A fixture não tem categoria,
  // lote nem termos, então `reserve` falha de qualquer forma — e se falhasse
  // com a frase de indisponibilidade, a recusa dos casos anteriores poderia vir
  // da fixture incompleta em vez da moderação, e o verde não provaria a fiação.
  const c = await eventoPublicado('sem-linha');

  const erro = await tentarInscrever(c);

  assert.ok(erro, 'a fixture incompleta deveria falhar de alguma forma');
  assert.doesNotMatch(
    String(erro.message),
    INDISPONIVEL,
    'evento sem moderação foi recusado como indisponível: ausência de linha tem de significar ATIVO',
  );
});

test('CONTROLE: linha ATIVO equivale a ausência de linha', { timeout: 120000 }, async () => {
  const c = await eventoPublicado('ativo');
  await moderar(c, 'ATIVO');

  const erro = await tentarInscrever(c);

  assert.ok(erro);
  assert.doesNotMatch(
    String(erro.message),
    INDISPONIVEL,
    'linha ATIVO barrou a inscrição: evento já moderado e liberado voltaria a vender',
  );
});

test('liberar devolve o acesso: o bloqueio está preso ao estado, não é permanente', { timeout: 120000 }, async () => {
  const c = await eventoPublicado('liberar');
  await moderar(c, 'SUSPENSO');

  const bloqueado = await tentarInscrever(c);
  assert.match(String(bloqueado.message), INDISPONIVEL, 'o bloqueio não chegou a valer');

  // Liberação: volta a ATIVO e apaga a fotografia, como a CHECK exige.
  await prisma.platformEventModeration.update({
    where: { eventId: c.evento.id },
    data: { state: 'ATIVO', originalEventStatus: null },
  });

  const liberado = await tentarInscrever(c);
  assert.ok(liberado, 'a fixture incompleta deveria continuar falhando por outro motivo');
  assert.doesNotMatch(
    String(liberado.message),
    INDISPONIVEL,
    'depois de liberar, a inscrição continuou barrada pela moderação',
  );
});
