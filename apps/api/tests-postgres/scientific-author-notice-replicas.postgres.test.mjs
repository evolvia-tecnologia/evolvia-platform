import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { ScientificAuthorNoticeMailService } from '../dist/scientific-author-notice-mail.service.js';

test('duas réplicas não repetem o POST após aceite ou perda da resposta', async (t) => {
  const scope = { organizationId: randomUUID(), eventId: randomUUID(), reservationId: randomUUID() };
  const environment = {
    EVOLVIA_SCIENTIFIC_NOTICE_DELIVERY_ENABLED: '1',
    EVOLVIA_SCIENTIFIC_NOTICE_ORGANIZATION_ID: scope.organizationId,
    EVOLVIA_SCIENTIFIC_NOTICE_EVENT_ID: scope.eventId,
    EVOLVIA_SCIENTIFIC_NOTICE_NOT_BEFORE: '2026-10-27T00:00:00Z',
    EVOLVIA_EMAIL_DELIVERY_ENDPOINT: 'https://gateway.example.test/messages',
    EVOLVIA_EMAIL_DELIVERY_TOKEN: 'local-test-only',
    EVOLVIA_EMAIL_FROM: 'secretaria@example.test',
    EVOLVIA_PUBLIC_BASE_URL: 'https://events.example.test',
  };
  for (const [key, value] of Object.entries(environment)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }

  const clients = [new PrismaClient(), new PrismaClient()];
  t.after(async () => {
    try {
      await clients[0].scientificNoticeDispatch.deleteMany({ where: { organizationId: scope.organizationId } });
    } finally {
      await Promise.all(clients.map(client => client.$disconnect()));
    }
  });
  const workers = clients.map(client => new ScientificAuthorNoticeMailService({
    scientificNoticeDispatch: client.scientificNoticeDispatch,
    scientificAuthorNotice: { findFirst: async () => ({ kind: 'SUBMITTED' }) },
    scientificSubmission: { findFirst: async () => ({
      title: 'Estudo', currentVersion: 1, event: { name: 'Congresso', slug: 'congresso' },
      ownerReservation: { registrationData: { full_name: 'Autora' }, status: 'CONFIRMED' },
      authors: [{ person: { email: 'autora@example.test' } }],
    }) },
    // O replay deve ser seguro mesmo sem um registro de auditoria disponível.
    auditLog: { findFirst: async () => null, create: async () => ({}) },
  }));

  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ method: req.method, key: req.headers['idempotency-key'] });
    req.resume();
    req.on('end', () => {
      if (req.url === '/UNKNOWN') res.destroy();
      else res.writeHead(202).end();
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  for (const status of ['ACCEPTED', 'UNKNOWN']) {
    const submissionId = randomUUID();
    const post = async (_endpoint, body, headers) => {
      const url = new URL('/' + status, 'http://127.0.0.1:' + server.address().port);
      const response = await fetch(url, { method: 'POST', headers, body });
      await response.text();
      return response.status;
    };
    const start = requests.length;
    await Promise.all(workers.map(worker => worker.notify(scope, submissionId, 1, post)));
    await workers[1].notify(scope, submissionId, 1, post);
    const dispatch = await clients[0].scientificNoticeDispatch.findFirstOrThrow({
      where: { organizationId: scope.organizationId, submissionId },
    });
    assert.equal(dispatch.status, status);
    assert.equal(dispatch.attempts, 1);
    assert.deepEqual(requests.slice(start), [{ method: 'POST', key: dispatch.idempotencyKey }]);
  }
});
