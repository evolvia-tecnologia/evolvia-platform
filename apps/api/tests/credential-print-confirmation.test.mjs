import assert from 'node:assert/strict';
import test from 'node:test';
import { CredentialPrintConfirmationService } from '../dist/credential-print-confirmation.service.js';

// Prisma e repositório falsos: o que se prova aqui é a DECISÃO e o que ela
// escreve, não o banco. A serialização é provada pela consulta de lock que o
// serviço emite — mesmo recurso que credential-raffle-service.test.mjs usa.
function montar({ papel = 'OPERATOR', concessoes = [], capacidades = ['credential', 'operator_scoped_access'], confirmadas = [], emitidas = [1], reservaExiste = true } = {}) {
  const gravadas = [];
  const locks = [];
  const tx = {
    async $queryRaw(query) {
      locks.push(query);
      return reservaExiste ? [{ id: 'reserva' }] : [];
    },
    eventCredentialPrint: {
      findUnique: async ({ where }) => {
        const { kind, sequence } = where.eventId_reservationId_kind_sequence;
        if (kind === 'ISSUED') return emitidas.includes(sequence) ? { organizationId: 'org' } : null;
        return confirmadas.includes(sequence) ? { organizationId: 'org' } : null;
      },
      count: async ({ where }) => {
        assert.equal(where.kind, 'CONFIRMED');
        return confirmadas.length;
      },
      create: async ({ data }) => { gravadas.push(data); return data; },
    },
  };
  const prisma = { $transaction: async (callback) => callback(tx) };
  const repositorio = {
    contextoDoAtor: async () => ({
      organizationId: 'org',
      papel,
      capacidadesDoEvento: capacidades,
      concessoes: concessoes.map((acao) => ({ organizationId: 'org', eventId: 'evento', userId: 'ator', acao, revogadaEm: null })),
    }),
  };
  return { servico: new CredentialPrintConfirmationService(prisma, repositorio), gravadas, locks };
}

const pedido = { reservationId: 'reserva', sequence: 1 };

test('a inscrição é travada antes de contar, com evento e organização na consulta', async () => {
  const { servico, locks } = montar({ concessoes: ['credencial_imprimir'] });
  await servico.confirmar('ator', 'evento', pedido);
  assert.equal(locks.length, 1, 'uma única consulta de lock');
  assert.match(locks[0].sql, /FOR UPDATE/u);
  assert.match(locks[0].sql, /"EventRegistrationReservation"/u);
  assert.deepEqual(locks[0].values, ['reserva', 'evento', 'org']);
});

test('primeira conclusão exige credencial_imprimir e grava escopo do servidor', async () => {
  const { servico, gravadas } = montar({ concessoes: ['credencial_imprimir'] });
  const r = await servico.confirmar('ator', 'evento', pedido);
  assert.deepEqual(r, { sequence: 1, acaoExigida: 'credencial_imprimir', concluida: true, repetida: false });
  assert.equal(gravadas.length, 1);
  assert.deepEqual(gravadas[0], {
    organizationId: 'org', eventId: 'evento', reservationId: 'reserva',
    kind: 'CONFIRMED', sequence: 1, actorUserId: 'ator',
  });
});

test('sem nenhuma concessão a primeira conclusão é recusada e nada é gravado', async () => {
  const { servico, gravadas } = montar({ concessoes: [] });
  await assert.rejects(servico.confirmar('ator', 'evento', pedido), /Sem permissão para confirmar/u);
  assert.equal(gravadas.length, 0);
});

// O caso central do CL01: a segunda conclusão é reimpressão.
test('segunda conclusão exige reimpressão e é recusada a quem só tem impressão', async () => {
  const { servico, gravadas } = montar({ concessoes: ['credencial_imprimir'], confirmadas: [1], emitidas: [1, 2] });
  await assert.rejects(
    servico.confirmar('ator', 'evento', { reservationId: 'reserva', sequence: 2 }),
    /já foi impressa.*reimpressão/su,
  );
  assert.equal(gravadas.length, 0, 'recusa não grava');
});

test('segunda conclusão passa para quem tem credencial_reimprimir', async () => {
  const { servico, gravadas } = montar({ concessoes: ['credencial_reimprimir'], confirmadas: [1], emitidas: [1, 2] });
  const r = await servico.confirmar('ator', 'evento', { reservationId: 'reserva', sequence: 2 });
  assert.equal(r.acaoExigida, 'credencial_reimprimir');
  assert.equal(gravadas.length, 1);
  assert.equal(gravadas[0].sequence, 2);
});

test('reconfirmar a MESMA sequência é idempotente e não exige reimpressão', async () => {
  const { servico, gravadas } = montar({ concessoes: ['credencial_imprimir'], confirmadas: [1] });
  const r = await servico.confirmar('ator', 'evento', pedido);
  assert.deepEqual(r, { sequence: 1, acaoExigida: 'credencial_imprimir', concluida: true, repetida: true });
  assert.equal(gravadas.length, 0, 'repetição não grava linha nova');
});

test('tentativa inexistente não pode ser confirmada', async () => {
  const { servico, gravadas } = montar({ concessoes: ['credencial_imprimir'], emitidas: [] });
  await assert.rejects(servico.confirmar('ator', 'evento', pedido), /Emissão não encontrada/u);
  assert.equal(gravadas.length, 0);
});

test('inscrição de outro evento não é alcançada pelo lock', async () => {
  const { servico, gravadas } = montar({ concessoes: ['credencial_imprimir'], reservaExiste: false });
  await assert.rejects(servico.confirmar('ator', 'evento', pedido), /Inscrição não encontrada neste evento/u);
  assert.equal(gravadas.length, 0);
});

test('organizador conclui sem precisar de concessão', async () => {
  for (const papel of ['OWNER', 'ADMIN', 'MANAGER']) {
    const { servico, gravadas } = montar({ papel, concessoes: [] });
    await servico.confirmar('ator', 'evento', pedido);
    assert.equal(gravadas.length, 1, `${papel} deveria concluir`);
  }
});

test('papel sem acesso ao balcão é recusado mesmo com concessão', async () => {
  const { servico, gravadas } = montar({ papel: 'VIEWER', concessoes: ['credencial_imprimir'] });
  await assert.rejects(servico.confirmar('ator', 'evento', pedido), /Sem permissão/u);
  assert.equal(gravadas.length, 0);
});

test('capacidade credential inativa no evento recusa a conclusão', async () => {
  const { servico, gravadas } = montar({ concessoes: ['credencial_imprimir'], capacidades: ['operator_scoped_access'] });
  await assert.rejects(servico.confirmar('ator', 'evento', pedido), /Sem permissão/u);
  assert.equal(gravadas.length, 0);
});

test('entrada malformada é recusada antes de abrir transação', async () => {
  for (const ruim of [{}, { reservationId: '' }, { reservationId: 'reserva' }, { reservationId: 'reserva', sequence: 0 }, { reservationId: 'reserva', sequence: 1.5 }, { reservationId: 'reserva', sequence: '1' }]) {
    const { servico, locks, gravadas } = montar({ concessoes: ['credencial_imprimir'] });
    await assert.rejects(servico.confirmar('ator', 'evento', ruim), /inv|informada/iu, JSON.stringify(ruim));
    assert.equal(locks.length, 0, `não deveria travar nada para ${JSON.stringify(ruim)}`);
    assert.equal(gravadas.length, 0);
  }
});
