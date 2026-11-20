// Disposable CI database only; fixture rows are preserved.
//
// A renovação de uma concessão EXPIRADA só se prova com banco: a chave única da
// concessão é (pessoa, ação, escopo) e não inclui a validade, então quem arbitra
// se o insert acontece é o PostgreSQL. Com `createMany` e `skipDuplicates`
// sozinhos, o insert era descartado e o `expiresAt` vencido permanecia — e
// `concessaoVigente` trata expirada como ausente. O proprietário renovava, a
// resposta dizia que havia concedido, a trilha gravava GRANTED, e a pessoa
// continuava barrada.
//
// Nenhum teste com cliente falso enxerga isso, porque cliente falso não aplica
// restrição de unicidade.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PlatformMasterRepository } from '../dist/platform-master.repository.js';
import { PlatformMasterService } from '../dist/platform-master.service.js';

const db = new PrismaClient();
after(() => db.$disconnect());

// `webauthn` fica fora: `conceder` não o toca, e passar um dublê aqui sugeriria
// que a cerimônia participa desta prova, o que não é verdade.
const servico = new PlatformMasterService(db, new PlatformMasterRepository(db), null);

const MOTIVO = 'renovacao de acesso pedida pelo juridico';
const dias = (n) => new Date(Date.now() + n * 86400_000).toISOString();

async function pessoas() {
  const criar = (rotulo) => db.user.create({
    data: { name: rotulo, email: `grant-${randomUUID()}@evolvia-ci.local`, passwordHash: 'fixture' },
  });
  return { proprietario: await criar('PG proprietário'), colaborador: await criar('PG colaborador') };
}

const contexto = () => ({ identityId: randomUUID(), sessionId: randomUUID(), tokenHash: randomUUID() });

const pedido = (colaborador, expiraEm) => ({
  pessoas: [colaborador.id],
  acoes: ['consultar'],
  escopo: { tipo: 'GLOBAL' },
  motivo: MOTIVO,
  expiraEm,
});

const linhas = (colaborador) => db.platformGrant.findMany({
  where: { targetUserId: colaborador.id, action: 'consultar' },
  select: { expiresAt: true, grantedByUserId: true, grantedAt: true },
});

test('a primeira concessão cria a linha e reporta criada, não renovada', async () => {
  const { proprietario, colaborador } = await pessoas();
  const r = await servico.conceder(proprietario.id, contexto(), pedido(colaborador, dias(30)));
  assert.equal(r.criadas, 1);
  assert.equal(r.renovadas, 0);
  assert.equal(r.concedidas, 1);
  const atuais = await linhas(colaborador);
  assert.equal(atuais.length, 1);
  assert.ok(atuais[0].expiresAt > new Date(), 'a concessão nasceu vencida');
});

test('reconceder uma concessão EXPIRADA a torna vigente, sem duplicar a linha', async () => {
  const { proprietario, colaborador } = await pessoas();
  await servico.conceder(proprietario.id, contexto(), pedido(colaborador, dias(1)));

  // Vence à mão, que é o estado real depois do prazo passar.
  await db.platformGrant.updateMany({
    where: { targetUserId: colaborador.id, action: 'consultar' },
    data: { expiresAt: new Date(Date.now() - 86400_000) },
  });
  const vencidas = await linhas(colaborador);
  assert.ok(vencidas[0].expiresAt < new Date(), 'a fixture não chegou expirada: o caso perdeu o sentido');

  const r = await servico.conceder(proprietario.id, contexto(), pedido(colaborador, dias(30)));
  assert.equal(r.renovadas, 1, 'a renovação não alcançou a linha existente');
  assert.equal(r.criadas, 0, 'criou uma segunda linha para a mesma combinação');

  const depois = await linhas(colaborador);
  assert.equal(depois.length, 1, 'a chave única deixou passar duas linhas');
  assert.ok(
    depois[0].expiresAt > new Date(),
    'a linha continuou expirada: era este o defeito, e o proprietário não tinha como perceber',
  );
});

test('a trilha guarda os dois GRANTED: renovar não reescreve o histórico', async () => {
  const { proprietario, colaborador } = await pessoas();
  await servico.conceder(proprietario.id, contexto(), pedido(colaborador, dias(1)));
  await servico.conceder(proprietario.id, contexto(), pedido(colaborador, dias(30)));
  const trilha = await db.platformGrantEvent.findMany({
    where: { targetUserId: colaborador.id, action: 'consultar' },
    select: { kind: true },
  });
  assert.equal(trilha.length, 2);
  assert.deepEqual(trilha.map((l) => l.kind), ['GRANTED', 'GRANTED']);
});

test('reconceder com prazo diferente troca a validade, e sem prazo a deixa aberta', async () => {
  const { proprietario, colaborador } = await pessoas();
  await servico.conceder(proprietario.id, contexto(), pedido(colaborador, dias(5)));
  const curta = (await linhas(colaborador))[0].expiresAt;

  await servico.conceder(proprietario.id, contexto(), pedido(colaborador, dias(60)));
  const longa = (await linhas(colaborador))[0].expiresAt;
  assert.ok(longa > curta, 'o prazo novo não substituiu o anterior');

  // Sem prazo significa "vale até revogar", e tem de poder substituir um prazo.
  await servico.conceder(proprietario.id, contexto(), { ...pedido(colaborador, undefined), expiraEm: null });
  const abertas = await linhas(colaborador);
  assert.equal(abertas.length, 1);
  assert.equal(abertas[0].expiresAt, null, 'a concessão sem prazo não apagou a data anterior');
});
