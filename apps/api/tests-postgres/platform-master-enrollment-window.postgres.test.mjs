// PostgreSQL do CI descartável. O Chromium em ci-master-enrollment.mjs cobre a assinatura WebAuthn.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { PlatformMasterService } from '../dist/platform-master.service.js';
import { prisma, pessoa, identidade, repositorio, sha256, subirApp, derrubarApp } from './master-fixtures.mjs';

before(async () => { await subirApp(); });
after(async () => { await derrubarApp(); });

const aleatorio = () => randomBytes(32).toString('base64url');
async function preparar() {
  const titular = await pessoa('inscricao-master');
  const ident = await identidade(titular.id, 'OWNER');
  const segredo = aleatorio();
  const desafio = aleatorio();
  const janela = await prisma.platformMasterEnrollmentWindow.create({ data: {
    id: randomUUID(), identityId: ident.id, purpose: 'BOOTSTRAP',
    secretDigest: sha256([segredo, 'BOOTSTRAP', ident.id].join(':')),
    challengeHash: sha256(desafio), openedByNote: 'Banco descartável',
    correlationId: randomUUID(), expiresAt: new Date(Date.now() + 60_000),
  } });
  const origem = randomUUID();
  const pedido = { segredo, finalidade: 'BOOTSTRAP', desafio, resposta: {} };
  const chave = { credentialId: aleatorio(), publicKey: randomBytes(64), counter: 0, backedUp: false, transportes: [] };
  function servico(verificarRegistro = async () => chave) {
    return new PlatformMasterService(prisma, repositorio(), { verificarRegistro });
  }
  const ler = () => prisma.platformMasterEnrollmentWindow.findUniqueOrThrow({ where: { id: janela.id } });
  return { titular, ident, janela, origem, pedido, servico, ler };
}

test('duas conclusões verificadas concorrentes geram um consumo, uma chave e uma auditoria', { timeout: 30000 }, async () => {
  const f = await preparar();
  let liberar;
  const barreira = new Promise(resolve => { liberar = resolve; });
  let chegaram = 0;
  const servico = f.servico(async () => {
    if (++chegaram === 2) liberar();
    await barreira;
    return { credentialId: aleatorio(), publicKey: randomBytes(64), counter: 0, backedUp: false, transportes: [] };
  });
  const concluir = () => servico.consumirInscricao(f.titular.id, f.pedido, f.origem);
  const disputas = await Promise.allSettled([concluir(), concluir()]);
  assert.equal(disputas.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(disputas.find(r => r.status === 'rejected').reason.getStatus(), 401);
  assert.ok((await f.ler()).consumedAt);
  assert.equal(await prisma.platformWebAuthnCredential.count({ where: { identityId: f.ident.id } }), 1);
  assert.equal(await prisma.platformAuditLog.count({ where: { correlationId: f.janela.correlationId } }), 1);
  await assert.rejects(concluir, e => e.getStatus() === 404);
});

for (const caso of ['expirada', 'revogada', 'outro titular', 'outra finalidade']) {
  test('janela recusada: ' + caso, async () => {
    const f = await preparar();
    let userId = f.titular.id;
    if (caso === 'expirada' || caso === 'revogada') {
      await prisma.platformMasterEnrollmentWindow.update({ where: { id: f.janela.id },
        data: caso === 'expirada' ? { expiresAt: new Date(Date.now() - 1_000) } : { revokedAt: new Date() } });
    } else if (caso === 'outro titular') {
      const outro = await pessoa('titular-distinto');
      await identidade(outro.id, 'OWNER');
      userId = outro.id;
    } else {
      f.pedido.finalidade = 'RECOVERY';
    }
    await assert.rejects(() => f.servico().consumirInscricao(userId, f.pedido, f.origem), e => e.getStatus() === 404);
    assert.equal((await f.ler()).consumedAt, null);
    assert.equal(await prisma.platformWebAuthnCredential.count({ where: { identityId: f.ident.id } }), 0);
  });
}

test('falha de persistência da credencial desfaz o consumo', async () => {
  const f = await preparar();
  const outro = await preparar();
  const credencial = { credentialId: aleatorio(), publicKey: randomBytes(64), counter: 0, backedUp: false, transportes: [] };
  await prisma.platformWebAuthnCredential.create({ data: repositorio().dadosDaCredencial({
    ...credencial, identityId: outro.ident.id, rotulo: 'Chave existente',
  }) });
  await assert.rejects(() => f.servico(async () => credencial).consumirInscricao(f.titular.id, f.pedido, f.origem),
    erro => erro.code === 'P2002');
  assert.equal((await f.ler()).consumedAt, null);
  assert.equal(await prisma.platformAuditLog.count({ where: { correlationId: f.janela.correlationId } }), 0);
});
