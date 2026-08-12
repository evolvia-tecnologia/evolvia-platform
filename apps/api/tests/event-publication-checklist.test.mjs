import assert from 'node:assert/strict';
import test from 'node:test';
import { EventPublicationService } from '../dist/event-publication/event-publication.service.js';

const event = {
  id: 'evt_single_day',
  organizationId: 'org_single_day',
  name: 'Festival Evolvia',
  slug: 'festival-evolvia',
  status: 'SETUP',
  format: 'ONLINE',
  startDate: new Date('2026-10-10T12:00:00.000Z'),
  endDate: null,
  venue: null,
};

const publication = {
  id: 'pub_single_day',
  organizationId: event.organizationId,
  eventId: event.id,
  shortDescription: 'Evento de um dia.',
  fullDescription: null,
  publicContactEmail: null,
  publicContactPhone: null,
  logoAssetId: null,
  coverAssetId: null,
  seoTitle: null,
  seoDescription: null,
  socialImageAssetId: null,
  accessibilitySummary: null,
  themeConfig: null,
  revision: 1,
  createdAt: new Date('2026-08-11T00:00:00.000Z'),
  updatedAt: new Date('2026-08-11T00:00:00.000Z'),
};

test('checklist aceita evento de um dia com início definido e sem data de término', async () => {
  const prisma = {
    event: { findUnique: async () => event },
  };
  const authorization = {
    requireMembership: async () => ({ role: 'OWNER' }),
  };
  const repository = {
    findByScope: async () => publication,
    findSectionsByScope: async () => [],
  };

  const service = new EventPublicationService(prisma, authorization, repository);
  const payload = await service.getAdmin('user_1', event.id);
  const dates = payload.checklist.items.find((item) => item.code === 'EVENT_DATES');

  assert.ok(dates);
  assert.equal(dates.ready, true);
  assert.equal(dates.required, true);
  assert.equal(payload.checklist.blockingCount, 0);
});
