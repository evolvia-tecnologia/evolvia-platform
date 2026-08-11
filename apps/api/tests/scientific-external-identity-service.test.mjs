import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ScientificExternalIdentityService,
  ScientificExternalIdentityServiceError,
} from '../dist/scientific-external-identity.service.js';

function cloneCredential(value) {
  return {
    ...value,
    issuedAt: new Date(value.issuedAt),
    expiresAt: new Date(value.expiresAt),
    revokedAt: value.revokedAt ? new Date(value.revokedAt) : null,
    consumedAt: value.consumedAt ? new Date(value.consumedAt) : null,
  };
}

function cloneSession(value) {
  return {
    ...value,
    issuedAt: new Date(value.issuedAt),
    expiresAt: new Date(value.expiresAt),
    revokedAt: value.revokedAt ? new Date(value.revokedAt) : null,
  };
}

class InMemoryScientificExternalIdentityRepository {
  constructor() {
    this.credentials = new Map();
    this.sessions = new Map();
    this.audits = [];
    this.eligible = new Set();
    this.credentialCounter = 0;
    this.sessionCounter = 0;
  }

  allow(scope) {
    this.eligible.add(`${scope.actor}:${scope.organizationId}:${scope.eventId}:${scope.personId}`);
  }

  async transaction(work) {
    const tx = {
      assertPersonEligibleForExternalActor: async (scope) => {
        const key = `${scope.actor}:${scope.organizationId}:${scope.eventId}:${scope.personId}`;
        if (!this.eligible.has(key)) throw new Error('Pessoa não elegível para este ator externo.');
      },
      createCredential: async (input) => {
        const stored = {
          ...input,
          id: `credential-${++this.credentialCounter}`,
          revokedAt: null,
          consumedAt: null,
        };
        this.credentials.set(stored.id, stored);
        return cloneCredential(stored);
      },
      findCredentialByTokenHashForUpdate: async (tokenHash) => {
        const found = [...this.credentials.values()].find((item) => item.tokenHash === tokenHash);
        return found ? cloneCredential(found) : null;
      },
      markCredentialConsumed: async (id, consumedAt) => {
        const current = this.credentials.get(id);
        if (!current) throw new Error('Credencial inexistente.');
        if (current.consumedAt) throw new Error('Credencial já consumida por outra transação.');
        const updated = { ...current, consumedAt: new Date(consumedAt) };
        this.credentials.set(id, updated);
        return cloneCredential(updated);
      },
      createSession: async (input) => {
        const stored = {
          ...input,
          id: `session-${++this.sessionCounter}`,
          revokedAt: null,
        };
        this.sessions.set(stored.id, stored);
        return cloneSession(stored);
      },
      createAudit: async (input) => {
        this.audits.push({ ...input });
      },
    };
    return work(tx);
  }

  async findSessionByHash(sessionHash) {
    const found = [...this.sessions.values()].find((item) => item.sessionHash === sessionHash);
    return found ? cloneSession(found) : null;
  }

  revokeSession(id, revokedAt) {
    const current = this.sessions.get(id);
    if (!current) throw new Error('Sessão inexistente.');
    this.sessions.set(id, { ...current, revokedAt: new Date(revokedAt) });
  }
}

const scope = {
  actor: 'AUTHOR',
  organizationId: 'org-1',
  eventId: 'event-1',
  personId: 'person-1',
};

const issuedAt = new Date('2026-08-10T12:00:00.000Z');
const expiresAt = new Date('2026-08-10T13:00:00.000Z');

test('emite credencial somente para vínculo externo explicitamente elegível e não persiste token puro', async () => {
  const repository = new InMemoryScientificExternalIdentityRepository();
  repository.allow(scope);
  const service = new ScientificExternalIdentityService(repository);

  const issued = await service.issueCredential({
    ...scope,
    createdByUserId: 'admin-1',
    expiresAt,
  }, issuedAt);

  assert.match(issued.token, /^evx_scientific_/);
  assert.match(issued.credential.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(issued.credential.tokenHash.includes(issued.token), false);
  assert.equal(repository.audits.length, 1);
  assert.equal(repository.audits[0].action, 'SCIENTIFIC_EXTERNAL_CREDENTIAL_ISSUED');
  assert.equal(JSON.stringify(repository.audits).includes(issued.token), false);
});

test('nega emissão quando pessoa não foi validada para o ator/evento', async () => {
  const repository = new InMemoryScientificExternalIdentityRepository();
  const service = new ScientificExternalIdentityService(repository);

  await assert.rejects(
    service.issueCredential({
      ...scope,
      createdByUserId: 'admin-1',
      expiresAt,
    }, issuedAt),
    /não elegível/,
  );
});

test('troca credencial single-use por sessão preservando exatamente o escopo e consumindo atomicamente', async () => {
  const repository = new InMemoryScientificExternalIdentityRepository();
  repository.allow(scope);
  const service = new ScientificExternalIdentityService(repository);
  const issued = await service.issueCredential({
    ...scope,
    createdByUserId: 'admin-1',
    expiresAt,
    singleUse: true,
  }, issuedAt);

  const exchangedAt = new Date('2026-08-10T12:10:00.000Z');
  const established = await service.exchangeCredential({
    token: issued.token,
    now: exchangedAt,
    sessionTtlMs: 20 * 60 * 1000,
  });

  assert.equal(established.credential.consumedAt?.toISOString(), exchangedAt.toISOString());
  assert.equal(established.session.actor, scope.actor);
  assert.equal(established.session.organizationId, scope.organizationId);
  assert.equal(established.session.eventId, scope.eventId);
  assert.equal(established.session.personId, scope.personId);
  assert.equal(established.session.credentialId, established.credential.id);
  assert.equal(established.session.expiresAt.toISOString(), '2026-08-10T12:30:00.000Z');
  assert.match(established.sessionToken, /^evx_scientific_/);
  assert.equal(JSON.stringify(repository.audits).includes(established.sessionToken), false);
  assert.deepEqual(
    repository.audits.map((item) => item.action),
    [
      'SCIENTIFIC_EXTERNAL_CREDENTIAL_ISSUED',
      'SCIENTIFIC_EXTERNAL_CREDENTIAL_EXCHANGED',
      'SCIENTIFIC_EXTERNAL_CREDENTIAL_CONSUMED',
    ],
  );
});

test('segunda troca de credencial single-use é negada', async () => {
  const repository = new InMemoryScientificExternalIdentityRepository();
  repository.allow(scope);
  const service = new ScientificExternalIdentityService(repository);
  const issued = await service.issueCredential({
    ...scope,
    createdByUserId: 'admin-1',
    expiresAt,
  }, issuedAt);

  await service.exchangeCredential({
    token: issued.token,
    now: new Date('2026-08-10T12:05:00.000Z'),
  });

  await assert.rejects(
    service.exchangeCredential({
      token: issued.token,
      now: new Date('2026-08-10T12:06:00.000Z'),
    }),
    /já consumida/,
  );
});

test('sessão nunca ultrapassa expiração da credencial', async () => {
  const repository = new InMemoryScientificExternalIdentityRepository();
  repository.allow(scope);
  const service = new ScientificExternalIdentityService(repository);
  const issued = await service.issueCredential({
    ...scope,
    createdByUserId: 'admin-1',
    expiresAt,
  }, issuedAt);

  const established = await service.exchangeCredential({
    token: issued.token,
    now: new Date('2026-08-10T12:50:00.000Z'),
    sessionTtlMs: 60 * 60 * 1000,
  });

  assert.equal(established.session.expiresAt.toISOString(), expiresAt.toISOString());
});

test('autentica sessão válida e retorna somente o escopo necessário', async () => {
  const repository = new InMemoryScientificExternalIdentityRepository();
  repository.allow(scope);
  const service = new ScientificExternalIdentityService(repository);
  const issued = await service.issueCredential({
    ...scope,
    createdByUserId: 'admin-1',
    expiresAt,
  }, issuedAt);
  const established = await service.exchangeCredential({
    token: issued.token,
    now: new Date('2026-08-10T12:05:00.000Z'),
  });

  const authenticated = await service.authenticateSession({
    sessionToken: established.sessionToken,
    now: new Date('2026-08-10T12:06:00.000Z'),
  });

  assert.deepEqual(authenticated, {
    actor: scope.actor,
    organizationId: scope.organizationId,
    eventId: scope.eventId,
    personId: scope.personId,
    sessionId: established.session.id,
    credentialId: established.credential.id,
    expiresAt: established.session.expiresAt,
  });
});

test('nega sessão revogada, expirada e segredo inexistente', async () => {
  const repository = new InMemoryScientificExternalIdentityRepository();
  repository.allow(scope);
  const service = new ScientificExternalIdentityService(repository);
  const issued = await service.issueCredential({
    ...scope,
    createdByUserId: 'admin-1',
    expiresAt,
  }, issuedAt);
  const established = await service.exchangeCredential({
    token: issued.token,
    now: new Date('2026-08-10T12:05:00.000Z'),
    sessionTtlMs: 10 * 60 * 1000,
  });

  repository.revokeSession(established.session.id, new Date('2026-08-10T12:06:00.000Z'));
  await assert.rejects(
    service.authenticateSession({
      sessionToken: established.sessionToken,
      now: new Date('2026-08-10T12:07:00.000Z'),
    }),
    /revogada/,
  );

  const secondRepository = new InMemoryScientificExternalIdentityRepository();
  secondRepository.allow(scope);
  const secondService = new ScientificExternalIdentityService(secondRepository);
  const secondIssued = await secondService.issueCredential({
    ...scope,
    createdByUserId: 'admin-1',
    expiresAt,
  }, issuedAt);
  const secondEstablished = await secondService.exchangeCredential({
    token: secondIssued.token,
    now: new Date('2026-08-10T12:05:00.000Z'),
    sessionTtlMs: 5 * 60 * 1000,
  });
  await assert.rejects(
    secondService.authenticateSession({
      sessionToken: secondEstablished.sessionToken,
      now: new Date('2026-08-10T12:10:00.000Z'),
    }),
    /expirada/,
  );

  await assert.rejects(
    secondService.authenticateSession({
      sessionToken: 'evx_scientific_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      now: new Date('2026-08-10T12:06:00.000Z'),
    }),
    ScientificExternalIdentityServiceError,
  );
});
