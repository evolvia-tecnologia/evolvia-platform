// Executa contra um PostgreSQL descartável com as migrations aplicadas (DATABASE_URL).
// No CI roda dentro do contêiner da API, depois do smoke; localmente, após `npm run build`.
//
// Aceite da #662, cobrando o que o teste unitário não alcança: que a recusa
// aconteça ANTES de qualquer escrita e que a prorrogação válida sobreviva a um
// recarregamento real do banco.
//
// O defeito que originou este arquivo: `save()` validava o CORPO do PATCH. Com
// apenas o término no corpo, a comparação não tinha o início para comparar e
// liberava; em seguida `persistEventData` gravava o término e nem incluía o
// início no update, deixando o antigo no lugar. Resultado persistido: término
// anterior ao início, com HTTP 200.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test, { after, before } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { AuthorizationService } from '../dist/authorization.service.js';
import { EventMutationPolicy } from '../dist/event-mutation-policy.service.js';
import { EventWizardService } from '../dist/event-wizard.service.js';

const run = randomBytes(5).toString('hex');
const token = `Datapg${run}`;
const prisma = new PrismaClient();
const authorization = new AuthorizationService(prisma);
const wizard = new EventWizardService(prisma, authorization, new EventMutationPolicy());

const EVENT_TYPE = 'Outro tipo de evento';
const ERRO = 'A data de término não pode ser anterior à data de início.';
const dia = (n) => `2026-12-${String(n).padStart(2, '0')}T12:00:00.000Z`;

let owner;
let organizationId;

async function rejects(promise, status, mensagem) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.getStatus?.(), status, `esperado ${status}, recebido ${error.getStatus?.()}: ${error.message}`);
    if (mensagem) {
      const resposta = error.getResponse?.();
      const lista = Array.isArray(resposta?.message) ? resposta.message : [resposta?.message ?? error.message];
      assert.ok(lista.includes(mensagem), `a recusa precisa dizer o motivo. Recebido: ${JSON.stringify(lista)}`);
    }
    return true;
  });
}

async function estado(eventId) {
  const [event, session] = await Promise.all([
    prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { startDate: true, endDate: true, name: true, timeZone: true, subjectAreas: true, status: true, updatedAt: true },
    }),
    prisma.eventWizardSession.findFirstOrThrow({
      where: { eventId },
      select: { revision: true, answers: true, lastSavedAt: true },
    }),
  ]);
  return { event, session };
}

/** Evento com intervalo válido gravado: 10/12 a 12/12. */
async function eventoComIntervalo() {
  const started = await wizard.start(owner.id, { organizationId, eventType: EVENT_TYPE });
  const eventId = started.event.id;
  const salvo = await wizard.save(owner.id, eventId, {
    currentStep: 'identity',
    revision: started.session.revision,
    answers: {
      eventType: EVENT_TYPE,
      name: `${token} intervalo`,
      format: 'IN_PERSON',
      registrationMode: 'FREE',
      timeZone: 'America/Sao_Paulo',
      startDate: dia(10),
      endDate: dia(12),
      subjectAreas: ['tecnologia'],
    },
  });
  const row = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  assert.equal(row.startDate.toISOString(), dia(10), 'pré-condição: início gravado');
  assert.equal(row.endDate.toISOString(), dia(12), 'pré-condição: término gravado');
  return { eventId, revision: salvo.session.revision };
}

before(async () => {
  owner = await prisma.user.create({
    data: { name: `PG datas ${run}`, email: `datas-${run}@evolvia-ci.local`, passwordHash: 'x' },
  });
  const organization = await prisma.organization.create({
    data: { name: `Org ${token}`, slug: `org-${token.toLowerCase()}`, createdById: owner.id },
  });
  organizationId = organization.id;
  await prisma.organizationMembership.create({
    data: { organizationId, userId: owner.id, role: 'OWNER' },
  });
});

after(async () => {
  // Restrições de FK e a trilha de auditoria impedem apagar. Os eventos criados
  // aqui ficam em DRAFT/SETUP, fora do catálogo público, então nada a limpar.
  await prisma.$disconnect();
});

test('corpo com só o término anterior ao início gravado é recusado sem alterar o evento', async () => {
  const { eventId, revision } = await eventoComIntervalo();
  const antes = await estado(eventId);

  await rejects(wizard.save(owner.id, eventId, {
    currentStep: 'identity',
    revision,
    answers: { eventType: EVENT_TYPE, endDate: dia(1) },
  }), 400, ERRO);

  assert.deepEqual(await estado(eventId), antes, 'nem o evento nem a sessão podem ter se movido');
});

test('corpo com só o início posterior ao término gravado é recusado sem alterar o evento', async () => {
  const { eventId, revision } = await eventoComIntervalo();
  const antes = await estado(eventId);

  await rejects(wizard.save(owner.id, eventId, {
    currentStep: 'identity',
    revision,
    answers: { eventType: EVENT_TYPE, startDate: dia(20) },
  }), 400, ERRO);

  assert.deepEqual(await estado(eventId), antes, 'o outro sentido também não grava nada');
});

test('as duas datas invertidas no mesmo corpo seguem recusadas sem alterar o evento', async () => {
  const { eventId, revision } = await eventoComIntervalo();
  const antes = await estado(eventId);

  await rejects(wizard.save(owner.id, eventId, {
    currentStep: 'identity',
    revision,
    answers: { eventType: EVENT_TYPE, startDate: dia(20), endDate: dia(15) },
  }), 400, ERRO);

  assert.deepEqual(await estado(eventId), antes);
});

test('prorrogação válida persiste e continua lá depois de recarregar', async () => {
  const { eventId, revision } = await eventoComIntervalo();

  const salvo = await wizard.save(owner.id, eventId, {
    currentStep: 'identity',
    revision,
    answers: { eventType: EVENT_TYPE, endDate: dia(20) },
  });
  assert.equal(salvo.session.revision, revision + 1, 'o salvamento aceito avança a revisão');

  // Recarregar pela própria rota, como a tela faz ao reabrir o Wizard.
  const recarregado = await wizard.get(owner.id, eventId);
  assert.equal(recarregado.answers.endDate, dia(20), 'o término prorrogado volta na leitura');
  assert.equal(recarregado.answers.startDate, dia(10), 'o início não pedido foi preservado');

  // E no banco, sem passar pelo serviço.
  const row = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  assert.equal(row.endDate.toISOString(), dia(20));
  assert.equal(row.startDate.toISOString(), dia(10), 'prorrogar não mexe no início');
  assert.equal(row.name, `${token} intervalo`, 'e não mexe em campo que o corpo não trouxe');
  assert.deepEqual(row.subjectAreas, ['tecnologia'], 'C-02: corpo parcial não apaga as áreas');
});

test('antecipar o início para dentro do intervalo persiste', async () => {
  const { eventId, revision } = await eventoComIntervalo();

  await wizard.save(owner.id, eventId, {
    currentStep: 'identity',
    revision,
    answers: { eventType: EVENT_TYPE, startDate: dia(1) },
  });

  const row = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  assert.equal(row.startDate.toISOString(), dia(1));
  assert.equal(row.endDate.toISOString(), dia(12), 'o término não pedido foi preservado');
});

test('evento com intervalo invertido gravado antes da correção continua editável no que não é data', async () => {
  // Reproduz o dado que o defeito deixou no banco, por fora do serviço.
  const { eventId, revision } = await eventoComIntervalo();
  await prisma.event.update({ where: { id: eventId }, data: { endDate: new Date(dia(5)) } });

  const salvo = await wizard.save(owner.id, eventId, {
    currentStep: 'identity',
    revision,
    answers: { eventType: EVENT_TYPE, name: `${token} renomeado` },
  });
  assert.equal(salvo.session.revision, revision + 1, 'corrigir o nome não pode ficar travado pelo dado legado');

  const row = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  assert.equal(row.name, `${token} renomeado`);
  assert.equal(row.endDate.toISOString(), dia(5), 'e o intervalo legado segue intocado, não "consertado" às escondidas');

  // Mas tocar numa data obriga a sair do estado inválido...
  await rejects(wizard.save(owner.id, eventId, {
    currentStep: 'identity',
    revision: salvo.session.revision,
    answers: { eventType: EVENT_TYPE, endDate: dia(8) },
  }), 400, ERRO);

  // ...e aceitar o intervalo válido resolve.
  await wizard.save(owner.id, eventId, {
    currentStep: 'identity',
    revision: salvo.session.revision,
    answers: { eventType: EVENT_TYPE, endDate: dia(14) },
  });
  const corrigido = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  assert.equal(corrigido.endDate.toISOString(), dia(14));
});

test('concluir barra o intervalo invertido gravado mesmo com o corpo sem datas', async () => {
  const { eventId, revision } = await eventoComIntervalo();
  await prisma.event.update({ where: { id: eventId }, data: { endDate: new Date(dia(5)) } });
  const antes = await estado(eventId);

  await rejects(wizard.complete(owner.id, eventId, {
    currentStep: 'review',
    revision,
    answers: {
      eventType: EVENT_TYPE,
      name: `${token} intervalo`,
      format: 'IN_PERSON',
      registrationMode: 'FREE',
      timeZone: 'America/Sao_Paulo',
      subjectAreas: ['tecnologia'],
    },
  }), 400, ERRO);

  assert.deepEqual(await estado(eventId), antes, 'a conclusão recusada não muda status nem revisão');
});
