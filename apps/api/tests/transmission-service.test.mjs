import assert from 'node:assert/strict';
import test from 'node:test';
import { TransmissionService } from '../dist/transmission.service.js';

const link = { kind: 'LIVE', title: 'Sala do evento', url: 'https://video.example.com/sala' };

function fixture(format) {
  let writes = 0;
  let capabilityReads = 0;
  const prisma = {
    event: { findUnique: async () => ({ id: 'evt', organizationId: 'org', format }) },
    eventCapability: { findUnique: async () => {
      capabilityReads += 1;
      return { status: 'ACTIVE', config: link };
    } },
    $transaction: async () => { writes += 1; },
  };
  const authorization = { requireRole: async () => ({ role: 'OWNER' }) };
  return {
    service: new TransmissionService(prisma, authorization),
    writes: () => writes,
    capabilityReads: () => capabilityReads,
  };
}

test('GET e PUT negam transmissão de evento presencial antes de ler ou gravar configuração', async () => {
  const { service, writes, capabilityReads } = fixture('IN_PERSON');
  await assert.rejects(service.get('user', 'evt'), /somente para eventos online ou híbridos/u);
  await assert.rejects(service.save('user', 'evt', link), /somente para eventos online ou híbridos/u);
  assert.equal(writes(), 0);
  assert.equal(capabilityReads(), 0);
});

test('link antigo não vaza para participante presencial nem para formato desconhecido', async () => {
  for (const format of ['IN_PERSON', 'UNKNOWN', null]) {
    const { service, capabilityReads } = fixture(format);
    assert.equal(await service.linkForConfirmedEvent('evt'), null);
    assert.equal(capabilityReads(), 0);
  }
});

test('transmissão continua acessível a eventos online e híbridos', async () => {
  for (const format of ['ONLINE', 'HYBRID']) {
    const { service, capabilityReads } = fixture(format);
    assert.deepEqual((await service.get('user', 'evt')).transmission, link);
    assert.deepEqual(await service.linkForConfirmedEvent('evt'), link);
    assert.equal(capabilityReads(), 2);
  }
});

test('permissão é verificada antes da leitura do link de transmissão', async () => {
  let readCapability = false;
  const prisma = {
    event: { findUnique: async () => ({ id: 'evt', organizationId: 'org', format: 'ONLINE' }) },
    eventCapability: { findUnique: async () => { readCapability = true; return null; } },
  };
  const authorization = { requireRole: async () => { throw new Error('Acesso negado'); } };
  const service = new TransmissionService(prisma, authorization);
  await assert.rejects(service.get('outsider', 'evt'), /Acesso negado/u);
  assert.equal(readCapability, false);
});
