// PostgreSQL do CI descartável. O Chromium em ci-master-enrollment.mjs cobre a assinatura WebAuthn.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { PlatformMasterService } from '../dist/platform-master.service.js';
import { validarFiltroDoRelatorio } from '../dist/platform-audit-report.js';
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
  // A trilha deste ator, so da inscricao. Filtra por `action` para nao contar
  // linha de outro fluxo que use o mesmo usuario.
  const trilha = (actorUserId = titular.id) => prisma.platformAuditLog.findMany({
    where: { actorUserId, action: { startsWith: 'inscricao_master:' } },
    select: { action: true, result: true, correlationId: true, changes: true },
  });
  return { titular, ident, janela, origem, pedido, servico, ler, trilha };
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
  // Um consumo, uma chave, um ALLOWED. A disputa perdida nao pode sumir da
  // trilha: ela e exatamente a tentativa que alguem vai querer investigar.
  assert.equal(await prisma.platformAuditLog.count({
    where: { correlationId: f.janela.correlationId, result: 'ALLOWED' } }), 1);
  const recusadas = await prisma.platformAuditLog.findMany({
    where: { correlationId: f.janela.correlationId, result: 'DENIED' }, select: { changes: true } });
  assert.equal(recusadas.length, 1);
  assert.equal(recusadas[0].changes.motivo, 'consumo_nao_autorizado');
  await assert.rejects(concluir, e => e.getStatus() === 404);
  // Depois de consumida, a tentativa seguinte e DENIED com o motivo preciso —
  // que a resposta 404 nao revela, e a trilha sim.
  const depois = await prisma.platformAuditLog.findMany({
    where: { correlationId: f.janela.correlationId, result: 'DENIED' }, select: { changes: true } });
  assert.deepEqual(depois.map(l => l.changes.motivo).sort(), ['consumo_nao_autorizado', 'janela_ja_consumida']);
});

const MOTIVO_ESPERADO = {
  expirada: 'janela_vencida',
  revogada: 'janela_revogada',
  'outro titular': 'sem_janela_aberta',
  'outra finalidade': 'segredo_ou_finalidade_divergente',
};

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
    // A recusa tem de estar na trilha, e com o motivo distinguido. O cliente
    // recebe 404 em todos os quatro casos de proposito; quem investiga depois
    // precisa saber QUAL deles aconteceu.
    const linhas = await f.trilha(userId);
    assert.equal(linhas.length, 1, `trilha com ${linhas.length} linha(s)`);
    assert.equal(linhas[0].result, 'DENIED');
    assert.equal(linhas[0].action, 'inscricao_master:CONCLUIR');
    // A acao gravada tem de ser FILTRAVEL pelo relatorio. Nao e detalhe de
    // forma: `validarFiltroDoRelatorio` recusa sufixo minusculo de proposito, e
    // a versao anterior gravava `inscricao_master:concluir` — a linha existia e
    // `/platform/master/audit` devolvia 400 para a propria acao que alguem
    // procura ao investigar recusas. Validador real, sobre a linha real.
    assert.equal(validarFiltroDoRelatorio({ acoes: [linhas[0].action] }).ok, true,
      `acao gravada nao passa no filtro do relatorio: ${linhas[0].action}`);
    assert.equal(linhas[0].changes.motivo, MOTIVO_ESPERADO[caso]);
    // O segredo nunca entra na trilha.
    assert.equal(JSON.stringify(linhas[0].changes).includes(f.pedido.segredo), false);
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
  // Nada de ALLOWED: o consumo voltou atras junto com a credencial.
  assert.equal(await prisma.platformAuditLog.count({
    where: { correlationId: f.janela.correlationId, result: 'ALLOWED' } }), 0);
  // Mas a falha fica. Gravada DENTRO da transacao, ela voltaria atras tambem, e
  // a tentativa que chegou a verificar a atestacao desapareceria do registro.
  const falhas = await prisma.platformAuditLog.findMany({
    where: { correlationId: f.janela.correlationId, result: 'FAILED' }, select: { changes: true } });
  assert.equal(falhas.length, 1);
  assert.equal(falhas[0].changes.motivo, 'falha_na_persistencia');
});
