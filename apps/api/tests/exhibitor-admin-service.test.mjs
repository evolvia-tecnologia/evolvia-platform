import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ExhibitorService } from '../dist/exhibitor.service.js';
import { AuthorizationService } from '../dist/authorization.service.js';

const event = { id: 'event', organizationId: 'org', name: 'Feira', slug: 'feira', status: 'PUBLISHED', capabilities: [{ id: 'cap' }] };
const companyId = 'company123456';
const productId = 'product123456';
function fixture({ role = 'OWNER', membershipStatus = 'ACTIVE', memberOrg = 'org', capabilities = event.capabilities } = {}) {
  const prisma = {
    event: { findUnique: async () => ({ ...event, capabilities }) },
    organizationMembership: { findUnique: async ({ where }) => where.organizationId_userId.organizationId === memberOrg ? { role, status: membershipStatus } : null },
  };
  return { prisma, service: new ExhibitorService(prisma, new AuthorizationService(prisma)) };
}
const endpoints = [
  ['home', []], ['saveCompany', [{}]], ['saveCredential', [{}]], ['saveForm', [{}]],
  ['saveProduct', [{}]], ['saveDownload', [{}]], ['saveOrder', [{}]],
  ['markCredential', ['credential1234', {}]], ['setOrderStatus', ['order1234567', {}]],
];
for (const scenario of [
  { role: 'OPERATOR' }, { role: 'VIEWER' }, { membershipStatus: 'INACTIVE' }, { memberOrg: 'other-org' }, { capabilities: [] },
]) {
  test(`todas as operações administrativas recusam escopo sem autorização: ${JSON.stringify(scenario)}`, async () => {
    const { service } = fixture(scenario);
    for (const [method, args] of endpoints) await assert.rejects(service[method]('user', 'event', ...args), error => error.getStatus() === 404);
  });
}

test('home consulta somente a organização e evento autorizados e aponta a área da empresa sem senha', async () => {
  const { service, prisma } = fixture();
  let queries = 0;
  const checkScope = ({ where }) => { assert.equal(where.eventId, 'event'); assert.equal(where.organizationId, 'org'); queries++; };
  for (const name of ['Company', 'Credential', 'Form', 'Product', 'Download', 'Order', 'Message']) {
    prisma[`eventExhibitor${name}`] = { findMany: async input => { checkScope(input); return []; } };
  }
  prisma.eventExhibitorCredential.groupBy = async input => { checkScope(input); return []; };
  prisma.eventExhibitorCredential.count = async input => { checkScope(input); return 0; };
  prisma.eventExhibitorCompany.aggregate = async input => { checkScope(input); return { _count: { _all: 0 }, _sum: {} }; };
  prisma.eventPublication = { findUnique: async ({ where }) => {
    assert.deepEqual(where, { eventId_organizationId: { eventId: 'event', organizationId: 'org' } });
    return { publicContactEmail: 'suporte@feira.com.br', publicContactPhone: '(11) 98888-7777', logoAsset: { id: 'logo-a', usage: 'LOGO', state: 'ACTIVE', width: 400, height: 120 } };
  } };
  const result = await service.home('user', 'event');
  assert.ok(queries > 10);
  assert.deepEqual(result.identity, { logo: { url: '/api/public/events/feira/exhibitor-identity/logo?v=logo-a', width: 400, height: 120 } });
  assert.equal(result.publicPath, '/evento/feira/expositor');
  assert.equal(result.externalAccessAvailable, true);
  assert.equal(typeof service.createSession, 'undefined');
});

test('empresa de outro evento não permite criar pedido nem consultar produto', async () => {
  const { service, prisma } = fixture();
  prisma.$transaction = async callback => callback({ eventExhibitorCompany: { findFirst: async ({ where }) => {
    assert.deepEqual(where, { eventId: 'event', organizationId: 'org', id: companyId }); return null;
  } } });
  await assert.rejects(service.saveOrder('user', 'event', { companyId, productId, quantity: 2 }), /Empresa não encontrada/);
});

function orderFixture({ current = null, audience = 'BOTH', deadline = null, priceCents = 1500 } = {}) {
  const f = fixture(); const writes = []; const audits = [];
  const tx = {
    eventExhibitorCompany: { findFirst: async ({ where }) => { assert.equal(where.organizationId, 'org'); assert.equal(where.eventId, 'event'); return { id: companyId, kind: 'EXHIBITOR' }; } },
    eventExhibitorProduct: { findFirst: async ({ where }) => { assert.equal(where.organizationId, 'org'); assert.equal(where.eventId, 'event'); return { id: productId, priceCents, form: { active: true, kind: 'REQUEST', audience, deadline } }; } },
    eventExhibitorOrder: {
      findFirst: async () => current,
      create: async ({ data }) => { writes.push(data); return { id: 'order1234567', ...data }; },
      update: async ({ data }) => { writes.push(data); return { ...current, ...data }; },
    },
    auditLog: { create: async ({ data }) => { audits.push(data); } },
  };
  f.prisma.$transaction = async (callback, options) => { assert.equal(options.isolationLevel, 'Serializable'); return callback(tx); };
  return { ...f, writes, audits };
}

test('solicitação captura preço e ator, sem pagamento; repetição mantém o preço original', async () => {
  const f = orderFixture();
  const result = await f.service.saveOrder('user', 'event', { companyId, productId, quantity: 2 });
  assert.equal(result.status, 'REQUESTED'); assert.equal(result.priceCents, 1500);
  assert.equal(f.writes[0].organizationId, 'org'); assert.equal(f.audits[0].actorUserId, 'user');
  const repeated = orderFixture({ current: { id: result.id, status: 'REQUESTED', quantity: 2, priceCents: 1500 }, priceCents: 9999 });
  assert.equal((await repeated.service.saveOrder('user', 'event', { companyId, productId, quantity: 2 })).priceCents, 1500);
  assert.equal(repeated.writes.length, 0); assert.equal(repeated.audits.length, 0);
});

test('mudança de quantidade preserva snapshot e pedido cancelado captura novo preço', async () => {
  const f = orderFixture({ current: { id: 'order1234567', status: 'REQUESTED', quantity: 1, priceCents: 1000 }, priceCents: 2000 });
  assert.equal((await f.service.saveOrder('user', 'event', { companyId, productId, quantity: 3 })).priceCents, 1000);
  const reopened = orderFixture({ current: { id: 'order1234567', status: 'CANCELLED', quantity: 1, priceCents: 1000 }, priceCents: 2000 });
  assert.equal((await reopened.service.saveOrder('user', 'event', { companyId, productId, quantity: 3 })).priceCents, 2000);
});

test('pedido confirmado, formulário vencido ou de outro público não gera escrita', async () => {
  for (const options of [{ current: { status: 'CONFIRMED' } }, { deadline: new Date('2000-01-01') }, { audience: 'PROVIDER' }]) {
    const f = orderFixture(options);
    await assert.rejects(f.service.saveOrder('user', 'event', { companyId, productId, quantity: 1 }));
    assert.equal(f.writes.length, 0); assert.equal(f.audits.length, 0);
  }
});

test('concorrência de mudança de status recusa sucesso e não audita uma escrita inexistente', async () => {
  const { service, prisma } = fixture();
  prisma.eventExhibitorOrder = { findFirst: async ({ where }) => { assert.equal(where.eventId, 'event'); assert.equal(where.organizationId, 'org'); return { id: 'order1234567', status: 'REQUESTED' }; } };
  prisma.$transaction = async callback => callback({ eventExhibitorOrder: { updateMany: async ({ where }) => { assert.equal(where.status, 'REQUESTED'); return { count: 0 }; } } });
  await assert.rejects(service.setOrderStatus('user', 'event', 'order1234567', { status: 'CONFIRMED' }), error => error.getStatus() === 409);
});

test('cadastro e auditoria usam a mesma transação; falha de auditoria não confirma o cadastro', async () => {
  const { service, prisma } = fixture(); let committed = false; let staged = null;
  prisma.$transaction = async (callback, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    const result = await callback({
      eventExhibitorDownload: { create: async ({ data }) => { staged = data; return { id:'download1234',...data }; } },
      auditLog: { create: async () => { throw new Error('audit unavailable'); } },
    });
    committed = true; return result;
  };
  await assert.rejects(service.saveDownload('user','event',{title:'Manual',url:'https://example.com/manual.pdf'}),/audit unavailable/);
  assert.equal(staged.organizationId,'org'); assert.equal(staged.eventId,'event'); assert.equal(committed,false);
});

test('reduzir cota abaixo de credenciais emitidas não atualiza empresa', async () => {
  const { service, prisma } = fixture();
  prisma.$transaction = async callback => callback({ eventExhibitorCompany: { findFirst: async () => ({ id:companyId }) }, eventExhibitorCredential: { groupBy: async () => [{kind:'EXHIBITOR',_count:{_all:3}}] } });
  await assert.rejects(service.saveCompany('user','event',{
    id:companyId,kind:'EXHIBITOR',nationality:'BRAZILIAN',document:'11.222.333/0001-81',loginEmail:'fixture@example.com',legalName:'Empresa Exemplo',tradeName:'Exemplo',quotaExhibitor:2,quotaAssembler:0,quotaService:0,contactName:'Pessoa Teste',contactRole:'Coordenação',contactEmail:'fixture@example.com',
  }), /cota não pode ficar abaixo/);
});


test('migration preserva a faixa de preço validada pela aplicação', () => {
  const migration = readFileSync(new URL('../prisma/migrations/20261008020000_exhibitor_admin/migration.sql', import.meta.url), 'utf8');
  assert.match(migration, /EventExhibitorProduct_priceCents_check/);
  assert.match(migration, /"priceCents" >= 0 AND "priceCents" <= 10000000/);
  assert.match(migration, /EventExhibitorOrder_quantity_check/);
  assert.match(migration, /"quantity" >= 1/);
  assert.match(migration, /EventExhibitorOrder_productId_eventId_organizationId_idx/);
  assert.match(migration, /EventExhibitorMessage_companyId_eventId_organizationId_idx/);
});


test('transições inválidas de pedido explicam o estado correto', async () => {
  for (const scenario of [
    { existing: 'CANCELLED', target: 'CONFIRMED', message: 'Não é possível alterar um pedido cancelado. Crie uma nova solicitação.' },
    { existing: 'CONFIRMED', target: 'REQUESTED', message: 'Não é possível reverter um pedido confirmado para solicitado.' },
  ]) {
    const { service, prisma } = fixture();
    prisma.eventExhibitorOrder = {
      findFirst: async ({ where }) => {
        assert.equal(where.eventId, 'event');
        assert.equal(where.organizationId, 'org');
        return { id: 'order1234567', status: scenario.existing };
      },
    };
    await assert.rejects(
      service.setOrderStatus('user', 'event', 'order1234567', { status: scenario.target }),
      error => error.getStatus() === 400 && error.message === scenario.message,
    );
  }
});


test('edição transfere a credencial para empresa do mesmo evento e valida a cota de destino', async () => {
  const { service, prisma } = fixture();
  const targetCompanyId = 'company654321';
  const existingCredential = {
    id: 'credential1234',
    companyId,
    kind: 'EXHIBITOR',
    nationality: 'BRAZILIAN',
    document: '52998224725',
    fullName: 'Pessoa Teste',
    badgeName: 'PESSOA',
    role: 'Coordenação',
    phone: '',
    mobile: '',
    credentialedAt: null,
    printedAt: null,
  };
  let updated = null;
  let audit = null;
  prisma.$transaction = async (callback, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    return callback({
      eventExhibitorCompany: {
        findFirst: async ({ where }) => {
          assert.deepEqual(where, { id: targetCompanyId, eventId: 'event', organizationId: 'org' });
          return { id: targetCompanyId, quotaExhibitor: 2, quotaAssembler: 0, quotaService: 0 };
        },
      },
      eventExhibitorCredential: {
        findFirst: async ({ where }) => {
          assert.deepEqual(where, { id: existingCredential.id, eventId: 'event', organizationId: 'org' });
          return existingCredential;
        },
        count: async ({ where }) => {
          assert.equal(where.companyId, targetCompanyId);
          assert.equal(where.kind, 'EXHIBITOR');
          assert.deepEqual(where.id, { not: existingCredential.id });
          return 0;
        },
        update: async ({ where, data }) => {
          assert.deepEqual(where, { id: existingCredential.id });
          updated = data;
          return { ...existingCredential, ...data };
        },
      },
      auditLog: { create: async ({ data }) => { audit = data; } },
    });
  };

  const saved = await service.saveCredential('user', 'event', {
    id: existingCredential.id,
    companyId: targetCompanyId,
    kind: existingCredential.kind,
    nationality: existingCredential.nationality,
    document: existingCredential.document,
    fullName: existingCredential.fullName,
    badgeName: existingCredential.badgeName,
    role: existingCredential.role,
    phone: existingCredential.phone,
    mobile: existingCredential.mobile,
  });

  assert.equal(updated.companyId, targetCompanyId);
  assert.equal(saved.companyId, targetCompanyId);
  assert.equal(audit.organizationId, 'org');
  assert.equal(audit.eventId, 'event');
  assert.equal(audit.metadata.companyId, targetCompanyId);
  assert.equal(audit.metadata.previousCompanyId, companyId);
});

test('transferência de credencial respeita a cota da empresa de destino', async () => {
  const { service, prisma } = fixture();
  const targetCompanyId = 'company654321';
  prisma.$transaction = async (callback) => callback({
    eventExhibitorCompany: {
      findFirst: async () => ({ id: targetCompanyId, quotaExhibitor: 1, quotaAssembler: 0, quotaService: 0 }),
    },
    eventExhibitorCredential: {
      findFirst: async () => ({
        id: 'credential1234', companyId, kind: 'EXHIBITOR', nationality: 'BRAZILIAN',
        document: '52998224725', fullName: 'Pessoa Teste', badgeName: 'PESSOA',
        role: 'Coordenação', phone: '', mobile: '', credentialedAt: null, printedAt: null,
      }),
      count: async () => 1,
    },
  });

  await assert.rejects(
    service.saveCredential('user', 'event', {
      id: 'credential1234', companyId: targetCompanyId, kind: 'EXHIBITOR',
      nationality: 'BRAZILIAN', document: '52998224725', fullName: 'Pessoa Teste',
      badgeName: 'PESSOA', role: 'Coordenação', phone: '', mobile: '',
    }),
    /cota deste tipo de crachá já foi usada/,
  );
});

test('transferência recusa empresa ou credencial fora do evento sem escrita nem auditoria', async () => {
  for (const missing of ['company', 'credential']) {
    const { service, prisma } = fixture();
    let writes = 0;
    let audits = 0;
    prisma.$transaction = async (callback, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      return callback({
        eventExhibitorCompany: {
          findFirst: async ({ where }) => {
            assert.deepEqual(where, { id: 'company654321', eventId: 'event', organizationId: 'org' });
            return missing === 'company' ? null : { id: 'company654321', quotaExhibitor: 2 };
          },
        },
        eventExhibitorCredential: {
          findFirst: async ({ where }) => {
            assert.deepEqual(where, { id: 'credential1234', eventId: 'event', organizationId: 'org' });
            return null;
          },
          update: async () => { writes++; throw new Error('escrita indevida'); },
          create: async () => { writes++; throw new Error('escrita indevida'); },
        },
        auditLog: { create: async () => { audits++; } },
      });
    };
    await assert.rejects(service.saveCredential('user', 'event', {
      id: 'credential1234', companyId: 'company654321', kind: 'EXHIBITOR',
      nationality: 'BRAZILIAN', document: '52998224725', fullName: 'Pessoa Teste',
      badgeName: 'PESSOA', role: 'Coordenação', phone: '', mobile: '',
    }), missing === 'company' ? /Empresa não encontrada neste evento/ : /Credencial não encontrada neste evento/);
    assert.equal(writes, 0);
    assert.equal(audits, 0);
  }
});


test('edição na mesma empresa continua permitida quando a cota já está preenchida', async () => {
  const { service, prisma } = fixture();
  const existingCredential = {
    id: 'credential1234', companyId, kind: 'EXHIBITOR', nationality: 'BRAZILIAN',
    document: '52998224725', fullName: 'Pessoa Teste', badgeName: 'PESSOA',
    role: 'Coordenação', phone: '', mobile: '', credentialedAt: null, printedAt: null,
  };
  let updated = false;
  prisma.$transaction = async (callback, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    return callback({
      eventExhibitorCompany: {
        findFirst: async ({ where }) => {
          assert.deepEqual(where, { id: companyId, eventId: 'event', organizationId: 'org' });
          return { id: companyId, quotaExhibitor: 1, quotaAssembler: 0, quotaService: 0 };
        },
      },
      eventExhibitorCredential: {
        findFirst: async ({ where }) => {
          assert.deepEqual(where, { id: existingCredential.id, eventId: 'event', organizationId: 'org' });
          return existingCredential;
        },
        count: async ({ where }) => {
          assert.equal(where.companyId, companyId);
          assert.deepEqual(where.id, { not: existingCredential.id });
          return 1;
        },
        update: async ({ data }) => {
          updated = true;
          return { ...existingCredential, ...data };
        },
      },
      auditLog: { create: async ({ data }) => {
        assert.equal(data.metadata.companyId, companyId);
        assert.equal(Object.hasOwn(data.metadata, 'previousCompanyId'), false);
      } },
    });
  };

  const saved = await service.saveCredential('user', 'event', {
    id: existingCredential.id, companyId, kind: 'EXHIBITOR',
    nationality: 'BRAZILIAN', document: '52998224725', fullName: 'Pessoa Atualizada',
    badgeName: 'PESSOA', role: 'Coordenação', phone: '', mobile: '',
  });

  assert.equal(updated, true);
  assert.equal(saved.fullName, 'Pessoa Atualizada');
  assert.equal(saved.companyId, companyId);
});
