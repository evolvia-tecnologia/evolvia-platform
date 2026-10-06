// Executa contra um PostgreSQL descartável com as migrations aplicadas (DATABASE_URL).
// No CI roda dentro do contêiner da API, depois do smoke; localmente, após `npm run build`.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test, { after, before } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { AuthorizationService } from '../dist/authorization.service.js';
import { EventMutationPolicy } from '../dist/event-mutation-policy.service.js';
import { EventPublicationPublicService } from '../dist/event-publication/event-publication-public.service.js';
import { EventWizardService } from '../dist/event-wizard.service.js';
import { EventsService } from '../dist/events.service.js';

const migrationSql = await readFile(
  new URL('../prisma/migrations/20261006140000_event_subject_areas/migration.sql', import.meta.url),
  'utf8',
);
const run = randomBytes(5).toString('hex');
const token = `Areapg${run}`;
const queries = [];
const prisma = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
prisma.$on('query', (entry) => queries.push(entry.query));
const authorization = new AuthorizationService(prisma);
const events = new EventsService(prisma, authorization);
const wizard = new EventWizardService(prisma, authorization, new EventMutationPolicy());
const discovery = new EventPublicationPublicService(prisma);
const people = {};
let organizationId;

async function user(key) {
  people[key] = await prisma.user.create({
    data: { name: `PG ${key}`, email: `${key}-${run}@evolvia-ci.local`, passwordHash: 'x' },
  });
  return people[key];
}

async function insertEvent(data) {
  return prisma.event.create({
    data: {
      ownerId: people.owner.id,
      organizationId,
      name: `${token} evento`,
      slug: `${token.toLowerCase()}-${randomBytes(4).toString('hex')}`,
      eventType: 'Outro tipo de evento',
      format: 'IN_PERSON',
      registrationMode: 'FREE',
      status: 'SETUP',
      ...data,
    },
  });
}

async function snapshot(eventId) {
  const [event, session, audits] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { subjectAreas: true, updatedAt: true } }),
    prisma.eventWizardSession.findFirst({ where: { eventId }, select: { revision: true, answers: true, updatedAt: true } }),
    prisma.auditLog.count({ where: { eventId, action: 'event.subject_areas_updated' } }),
  ]);
  return { event, session, audits };
}

async function rejects(promise, status) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.getStatus?.(), status, `esperado ${status}, recebido ${error.getStatus?.()}: ${error.message}`);
    return true;
  });
}

async function slugsFor(area) {
  const result = await discovery.discover({ query: token, area, pageSize: 24 });
  return new Set(result.items.map((item) => item.slug));
}

before(async () => {
  await user('owner');
  await user('operator');
  await user('external');
  await user('solo');
  const organization = await prisma.organization.create({
    data: { name: `Org ${token}`, slug: `org-${token.toLowerCase()}`, createdById: people.owner.id },
  });
  organizationId = organization.id;
  const external = await prisma.organization.create({
    data: { name: `Externa ${token}`, slug: `ext-${token.toLowerCase()}`, createdById: people.external.id },
  });
  await prisma.organizationMembership.createMany({
    data: [
      { organizationId, userId: people.owner.id, role: 'OWNER' },
      { organizationId, userId: people.operator.id, role: 'OPERATOR' },
      { organizationId: external.id, userId: people.external.id, role: 'OWNER' },
    ],
  });
});

after(async () => {
  await prisma.$disconnect();
});

test('Prisma 6.19.3 traduz has e isEmpty em SQL válido no PostgreSQL usado', async () => {
  const [{ version }] = await prisma.$queryRaw`SELECT version()`;
  assert.match(version, /^PostgreSQL 1[6-9]\./u);
  const { Prisma } = await import('@prisma/client');
  assert.equal(Prisma.prismaVersion.client, '6.19.3');

  queries.length = 0;
  await discovery.discover({ query: token, area: 'saude' });
  const sql = queries.find((query) => query.includes('"subjectAreas"'));
  assert.ok(sql, 'a descoberta por área consulta a coluna subjectAreas');
  console.log(`SQL_AREA_FILTER: ${sql}`);
});

test('busca marcada tem prioridade e o evento legado sem área usa o fallback por palavras', async () => {
  const marked = await insertEvent({ status: 'PUBLISHED', name: `${token} Encontro Clínico`, subjectAreas: ['saude'] });
  const legacy = await insertEvent({ status: 'PUBLISHED', name: `${token} Jornada de Saúde Coletiva` });
  const markedElsewhere = await insertEvent({
    status: 'PUBLISHED', name: `${token} Simpósio de Saúde e Direito`, subjectAreas: ['direito'],
  });
  const congress = await insertEvent({
    status: 'PUBLISHED', name: `${token} Congresso Científico`, profileCode: 'SCIENTIFIC_EVENT',
    eventType: 'Congresso ou evento científico',
  });
  const draft = await insertEvent({ status: 'SETUP', name: `${token} Rascunho de Saúde`, subjectAreas: ['saude'] });

  const legacyRow = await prisma.event.findUniqueOrThrow({ where: { id: legacy.id } });
  assert.deepEqual(legacyRow.subjectAreas, []);

  const saude = await slugsFor('saude');
  assert.ok(saude.has(marked.slug), 'evento marcado em Saúde');
  assert.ok(saude.has(legacy.slug), 'evento legado encontrado pelas palavras');
  assert.equal(saude.has(markedElsewhere.slug), false, 'marcação em Direito prevalece sobre a palavra Saúde');
  assert.equal(saude.has(draft.slug), false, 'rascunho não é público');
  assert.ok((await slugsFor('direito')).has(markedElsewhere.slug));
  assert.equal((await slugsFor('educacao')).has(congress.slug), false, 'congresso não entra em Educação');

  const changed = await events.updateSubjectAreas(people.owner.id, legacy.id, { subjectAreas: ['engenharias'] });
  assert.deepEqual(changed.subjectAreas, ['engenharias']);
  const persisted = await prisma.event.findUniqueOrThrow({ where: { id: legacy.id } });
  assert.deepEqual(persisted.subjectAreas, ['engenharias']);
  assert.equal(persisted.name, legacyRow.name);
  assert.equal(persisted.slug, legacyRow.slug);
  assert.equal((await slugsFor('saude')).has(legacy.slug), false, 'após marcar, o fallback deixa de valer');
  assert.ok((await slugsFor('engenharias')).has(legacy.slug));
});

test('usuário externo e operador recebem 404 antes de qualquer estado, sem escrita nem auditoria', async () => {
  const cancelled = await insertEvent({ status: 'CANCELLED', subjectAreas: ['saude'] });
  const active = await insertEvent({ subjectAreas: ['saude'] });
  for (const event of [cancelled, active]) {
    const beforeState = await snapshot(event.id);
    for (const actor of [people.external, people.operator, people.solo]) {
      await rejects(events.updateSubjectAreas(actor.id, event.id, { subjectAreas: ['direito'] }), 404);
      await rejects(events.updateSubjectAreas(actor.id, event.id, { subjectAreas: 'invalido' }), 404);
    }
    assert.deepEqual(await snapshot(event.id), beforeState);
  }
  await rejects(events.updateSubjectAreas(people.external.id, `inexistente-${run}`, { subjectAreas: ['saude'] }), 404);

  const beforeOwner = await snapshot(cancelled.id);
  await rejects(events.updateSubjectAreas(people.owner.id, cancelled.id, { subjectAreas: ['direito'] }), 409);
  assert.deepEqual(await snapshot(cancelled.id), beforeOwner);
});

test('dono sem organização altera o próprio evento, sem auditoria de organização; outro usuário recebe 404', async () => {
  const own = await prisma.event.create({
    data: {
      ownerId: people.solo.id, name: `${token} pessoal`, slug: `${token.toLowerCase()}-solo`,
      eventType: 'Outro tipo de evento', format: 'ONLINE', registrationMode: 'FREE', status: 'SETUP',
    },
  });
  const result = await events.updateSubjectAreas(people.solo.id, own.id, { subjectAreas: ['tecnologia'] });
  assert.deepEqual(result, { subjectAreas: ['tecnologia'], wizardRevision: null });
  assert.equal(await prisma.auditLog.count({ where: { eventId: own.id } }), 0);
  const beforeState = await snapshot(own.id);
  await rejects(events.updateSubjectAreas(people.owner.id, own.id, { subjectAreas: ['saude'] }), 404);
  await rejects(events.updateSubjectAreas(people.external.id, own.id, { subjectAreas: ['saude'] }), 404);
  assert.deepEqual(await snapshot(own.id), beforeState);
});

test('deduplica e recusa vazio, desconhecido, formato inválido e mais de 3 áreas sem gravar', async () => {
  const event = await insertEvent({});
  const saved = await events.updateSubjectAreas(people.owner.id, event.id, {
    subjectAreas: ['saude', 'saude', 'direito', 'saude'],
  });
  assert.deepEqual(saved.subjectAreas, ['saude', 'direito']);
  assert.deepEqual((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).subjectAreas, ['saude', 'direito']);

  const beforeState = await snapshot(event.id);
  for (const body of [
    {}, [], null, { subjectAreas: [] }, { subjectAreas: 'saude' }, { subjectAreas: ['futebol'] },
    { subjectAreas: ['saude', 7] }, { subjectAreas: ['saude', 'educacao', 'direito', 'tecnologia'] },
  ]) {
    await rejects(events.updateSubjectAreas(people.owner.id, event.id, body), 400);
  }
  assert.deepEqual(await snapshot(event.id), beforeState);
  assert.equal(beforeState.audits, 1);

  const created = await events.create(people.owner.id, {
    organizationId, name: `${token} criado`, eventType: 'Outro tipo de evento', format: 'ONLINE',
    registrationMode: 'FREE', subjectAreas: ['direito', 'direito'],
  });
  assert.deepEqual(created.subjectAreas, ['direito']);
  await rejects(events.create(people.owner.id, {
    organizationId, name: `${token} recusado`, eventType: 'Outro tipo de evento', format: 'ONLINE',
    registrationMode: 'FREE', subjectAreas: ['saude', 'educacao', 'direito', 'tecnologia'],
  }), 400);
  assert.equal(await prisma.event.count({ where: { name: `${token} recusado` } }), 0);
});

test('falha na auditoria desfaz área e revisão do Wizard na mesma transação', async () => {
  const started = await wizard.start(people.owner.id, { organizationId, eventType: 'Outro tipo de evento' });
  const eventId = started.event.id;
  const beforeState = await snapshot(eventId);

  const failingPrisma = new Proxy(prisma, {
    get(target, property) {
      if (property === '$transaction') {
        return (callback, options) => target.$transaction((tx) => callback(new Proxy(tx, {
          get(client, name) {
            if (name === 'auditLog') return { create: async () => { throw new Error('auditoria indisponível'); } };
            const value = Reflect.get(client, name);
            return typeof value === 'function' ? value.bind(client) : value;
          },
        })), options);
      }
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const failing = new EventsService(failingPrisma, new AuthorizationService(prisma));
  await assert.rejects(
    failing.updateSubjectAreas(people.owner.id, eventId, { subjectAreas: ['saude'] }),
    /auditoria indisponível/u,
  );
  assert.deepEqual(await snapshot(eventId), beforeState);
});

test('PATCH incrementa a revisão e um Wizard aberto com revisão antiga recebe 409 sem sobrescrever a área', async () => {
  const started = await wizard.start(people.owner.id, { organizationId, eventType: 'Congresso ou evento científico' });
  const eventId = started.event.id;
  const staleRevision = started.session.revision;
  const staleAnswers = { ...started.answers, name: `${token} Wizard aberto`, subjectAreas: ['educacao'] };

  const patched = await events.updateSubjectAreas(people.owner.id, eventId, { subjectAreas: ['saude'] });
  assert.equal(patched.wizardRevision, staleRevision + 1);

  await rejects(wizard.save(people.owner.id, eventId, {
    currentStep: 'identity', revision: staleRevision, answers: staleAnswers,
  }), 409);
  const reloaded = await wizard.get(people.owner.id, eventId);
  assert.equal(reloaded.session.revision, staleRevision + 1);
  assert.deepEqual(reloaded.answers.subjectAreas, ['saude']);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  assert.deepEqual(event.subjectAreas, ['saude']);
  assert.notEqual(event.name, staleAnswers.name, 'o save recusado não grava nenhum campo do Event');

  const fresh = await wizard.save(people.owner.id, eventId, {
    currentStep: 'identity', revision: reloaded.session.revision, answers: reloaded.answers,
  });
  assert.equal(fresh.session.revision, staleRevision + 2);
  assert.deepEqual(fresh.answers.subjectAreas, ['saude']);
});

test('PATCH concorrente com save do Wizard nunca perde a área marcada', async () => {
  const started = await wizard.start(people.owner.id, { organizationId, eventType: 'Outro tipo de evento' });
  const eventId = started.event.id;
  const choices = ['saude', 'direito', 'tecnologia', 'engenharias', 'negocios', 'educacao'];
  let outcomes = { wizardFirst: 0, patchFirst: 0 };

  const delays = [0, 1, 3, 6, 10, 15];
  const later = (ms, task) => new Promise((resolve) => setTimeout(resolve, ms)).then(task);
  for (let round = 0; round < 36; round += 1) {
    const current = await wizard.get(people.owner.id, eventId);
    const marked = choices[round % choices.length];
    const wizardArea = choices[(round + 1) % choices.length];
    const patchDelay = round % 2 === 0 ? delays[Math.floor(round / 2) % delays.length] : 0;
    const saveDelay = round % 2 === 1 ? delays[Math.floor(round / 2) % delays.length] : 0;
    const [patch, save] = await Promise.allSettled([
      later(patchDelay, () => events.updateSubjectAreas(people.owner.id, eventId, { subjectAreas: [marked] })),
      later(saveDelay, () => wizard.save(people.owner.id, eventId, {
        currentStep: 'format', revision: current.session.revision,
        answers: { ...current.answers, subjectAreas: [wizardArea] },
      })),
    ]);
    assert.equal(patch.status, 'fulfilled', patch.reason?.message);
    const row = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    const session = await prisma.eventWizardSession.findFirstOrThrow({ where: { eventId } });
    assert.deepEqual(row.subjectAreas, [marked], `rodada ${round}: a área do PATCH persiste`);
    assert.deepEqual(session.answers.subjectAreas, [marked], `rodada ${round}: sessão e evento concordam`);
    if (save.status === 'fulfilled') {
      outcomes.wizardFirst += 1;
      assert.equal(session.revision, current.session.revision + 2);
    } else {
      assert.equal(save.reason.getStatus(), 409);
      outcomes.patchFirst += 1;
      assert.equal(session.revision, current.session.revision + 1);
    }
  }
  console.log(`CONCURRENCY_OUTCOMES: ${JSON.stringify(outcomes)}`);
  assert.ok(outcomes.wizardFirst > 0 && outcomes.patchFirst > 0, 'as duas ordens de commit foram exercitadas');

  const base = await prisma.eventWizardSession.findFirstOrThrow({ where: { eventId } });
  const parallel = await Promise.all(choices.slice(0, 5).map((area) => (
    events.updateSubjectAreas(people.owner.id, eventId, { subjectAreas: [area] })
  )));
  const revisions = parallel.map((item) => item.wizardRevision).sort((a, b) => a - b);
  assert.deepEqual(revisions, [1, 2, 3, 4, 5].map((step) => base.revision + step), 'nenhum incremento perdido');
  const finalSession = await prisma.eventWizardSession.findFirstOrThrow({ where: { eventId } });
  const finalEvent = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  assert.equal(finalSession.revision, base.revision + 5);
  assert.deepEqual(finalSession.answers.subjectAreas, finalEvent.subjectAreas);
  const lastWriter = parallel.find((item) => item.wizardRevision === base.revision + 5);
  assert.deepEqual(finalEvent.subjectAreas, lastWriter.subjectAreas);
});

test('migration é idempotente e preserva as linhas legadas com área vazia', async () => {
  const schema = `legacy_${run}`;
  const source = await insertEvent({ name: `${token} legado`, venue: 'Recife - PE', estimatedAudience: 80 });
  const rollback = new Error('rollback intencional');
  await assert.rejects(prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await tx.$executeRawUnsafe(`CREATE TABLE "${schema}"."Event" (LIKE public."Event" INCLUDING DEFAULTS)`);
    await tx.$executeRawUnsafe(`ALTER TABLE "${schema}"."Event" DROP COLUMN "subjectAreas"`);
    const columns = await tx.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'Event' ORDER BY ordinal_position`,
      schema,
    );
    const list = columns.map(({ column_name }) => `"${column_name}"`).join(', ');
    await tx.$executeRawUnsafe(
      `INSERT INTO "${schema}"."Event" (${list}) SELECT ${list} FROM public."Event" WHERE "id" = $1`,
      source.id,
    );
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
    await tx.$executeRawUnsafe(migrationSql);
    await tx.$executeRawUnsafe(migrationSql);
    const [legacy] = await tx.$queryRawUnsafe(
      `SELECT to_jsonb(e) - 'subjectAreas' AS row, "subjectAreas" FROM "${schema}"."Event" e WHERE "id" = $1`,
      source.id,
    );
    const [original] = await tx.$queryRawUnsafe(
      `SELECT to_jsonb(e) - 'subjectAreas' AS row FROM public."Event" e WHERE "id" = $1`,
      source.id,
    );
    assert.deepEqual(legacy.subjectAreas, []);
    assert.deepEqual(legacy.row, original.row);
    const [definition] = await tx.$queryRawUnsafe(
      `SELECT is_nullable, column_default FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'Event' AND column_name = 'subjectAreas'`,
      schema,
    );
    assert.equal(definition.is_nullable, 'NO');
    assert.match(definition.column_default, /ARRAY\[\]::text\[\]/u);
    throw rollback;
  }), (error) => error === rollback);
  const [{ exists }] = await prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = ${schema}) AS exists`;
  assert.equal(exists, false);
});
