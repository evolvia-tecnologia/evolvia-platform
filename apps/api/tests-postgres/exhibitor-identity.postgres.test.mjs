// PostgreSQL descartável com migrations (DATABASE_URL). Dois eventos não compartilham logo nem contatos.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { LocalEventPublicationMediaStorage } from '../dist/event-publication/event-publication-media.storage.js';
import { ExhibitorIdentityService } from '../dist/exhibitor-identity.service.js';

const run = randomBytes(4).toString('hex');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const prisma = new PrismaClient();
let ownerId;
let organizationA;
let organizationB;
let mediaRoot;
let storage;
let service;

async function insertEvent(organizationId, slugSuffix, status = 'PUBLISHED') {
  const event = await prisma.event.create({
    data: {
      ownerId,
      organizationId,
      name: `Feira ${slugSuffix} ${run}`,
      slug: `feira-${slugSuffix}-${run}`,
      eventType: 'Outro tipo de evento',
      format: 'IN_PERSON',
      registrationMode: 'FREE',
      status,
      timeZone: 'America/Sao_Paulo',
      capabilities: { create: { code: 'exhibitor', status: 'ACTIVE' } },
    },
  });
  return event;
}

before(async () => {
  mediaRoot = await mkdtemp(join(tmpdir(), 'evolvia-identity-'));
  process.env.EVOLVIA_MEDIA_ROOT = mediaRoot;
  const owner = await prisma.user.create({
    data: { name: `PG identidade ${run}`, email: `identity-${run}@evolvia-ci.local`, passwordHash: 'x' },
  });
  ownerId = owner.id;
  organizationA = await prisma.organization.create({
    data: { name: `Org A ${run}`, slug: `org-a-${run}`, createdById: ownerId },
  });
  organizationB = await prisma.organization.create({
    data: { name: `Org B ${run}`, slug: `org-b-${run}`, createdById: ownerId },
  });
  storage = new LocalEventPublicationMediaStorage();
  service = new ExhibitorIdentityService(prisma, storage);
});

after(async () => {
  await prisma.event.deleteMany({ where: { ownerId } });
  await prisma.organization.deleteMany({ where: { createdById: ownerId } });
  if (ownerId) await prisma.user.delete({ where: { id: ownerId } });
  await prisma.$disconnect();
  if (mediaRoot) await rm(mediaRoot, { recursive: true, force: true });
});

test('logo e canais públicos ficam no próprio evento e a ausência não copia outro cadastro', async () => {
  const eventA = await insertEvent(organizationA.id, 'alfa');
  const eventB = await insertEvent(organizationB.id, 'beta');
  const storageKey = `${organizationA.id}/${eventA.id}/${randomBytes(8).toString('hex')}.png`;
  const asset = await prisma.eventMediaAsset.create({
    data: {
      organizationId: organizationA.id,
      eventId: eventA.id,
      usage: 'LOGO',
      storageKey,
      mimeType: 'image/png',
      byteSize: png.length,
      width: 600,
      height: 200,
      checksumSha256: createHash('sha256').update(png).digest('hex'),
      state: 'ACTIVE',
      createdByUserId: ownerId,
    },
  });
  await storage.write(storageKey, png);
  await prisma.eventPublication.create({
    data: {
      organizationId: organizationA.id,
      eventId: eventA.id,
      publicContactEmail: ' suporte@feira-alfa.test ',
      publicContactPhone: '(11) 98888-7777',
      logoAssetId: asset.id,
    },
  });
  await prisma.eventPublication.create({
    data: { organizationId: organizationB.id, eventId: eventB.id },
  });

  const identityA = await service.forSlug(eventA.slug);
  assert.deepEqual(identityA, {
    event: { name: eventA.name, slug: eventA.slug },
    logo: { url: `/api/public/events/${eventA.slug}/exhibitor-identity/logo?v=${asset.id}`, width: 600, height: 200 },
    support: { email: 'suporte@feira-alfa.test', whatsapp: { number: '5511988887777', label: '(11) 98888-7777' } },
  });
  assert.equal(JSON.stringify(identityA).includes(storageKey), false);
  assert.equal(JSON.stringify(identityA).includes('taxId'), false);

  const identityB = await service.forSlug(eventB.slug);
  assert.deepEqual(identityB, {
    event: { name: eventB.name, slug: eventB.slug },
    logo: null,
    support: { email: null, whatsapp: null },
  });
  assert.equal(JSON.stringify(identityB).includes(eventA.slug), false);
  assert.equal(JSON.stringify(identityB).includes('suporte@feira-alfa.test'), false);

  const logo = await service.logo(eventA.slug);
  assert.equal(logo.mimeType, 'image/png');
  assert.deepEqual(logo.bytes, png);
  await assert.rejects(() => service.logo(eventB.slug), (error) => error instanceof NotFoundException && error.getStatus() === 404);

  const draft = await insertEvent(organizationA.id, 'rascunho', 'DRAFT');
  await prisma.eventPublication.create({
    data: {
      organizationId: organizationA.id,
      eventId: draft.id,
      publicContactEmail: 'oculto@feira-alfa.test',
      publicContactPhone: '(11) 97777-6666',
    },
  });
  await assert.rejects(() => service.forSlug(draft.slug), (error) => error instanceof NotFoundException);
  await assert.rejects(() => service.logo(draft.slug), (error) => error instanceof NotFoundException);

  await assert.rejects(() => prisma.eventPublication.create({
    data: { organizationId: organizationB.id, eventId: eventA.id, publicContactEmail: 'vazou@beta.test' },
  }));
  const foreign = await prisma.eventMediaAsset.create({
    data: {
      organizationId: organizationB.id,
      eventId: eventB.id,
      usage: 'LOGO',
      storageKey: `${organizationB.id}/${eventB.id}/${randomBytes(8).toString('hex')}.png`,
      mimeType: 'image/png',
      byteSize: png.length,
      width: 100,
      height: 40,
      checksumSha256: createHash('sha256').update(png).digest('hex'),
      state: 'ACTIVE',
      createdByUserId: ownerId,
    },
  });
  await assert.rejects(() => prisma.eventPublication.update({
    where: { eventId_organizationId: { eventId: eventA.id, organizationId: organizationA.id } },
    data: { logoAssetId: foreign.id },
  }));
  assert.equal((await service.forSlug(eventA.slug)).logo.url.endsWith(asset.id), true);
});
