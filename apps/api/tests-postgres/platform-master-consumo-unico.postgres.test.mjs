// Disposable CI PostgreSQL only. Unique fixture data is preserved, never deleted.
//
// Concorrência real sobre PostgreSQL: consumo único do desafio e contador que
// não retrocede (#665).
//
// Este arquivo existe por uma crítica certeira do Work no PR #675: o teste que
// eu tinha provava reuso EM SEQUÊNCIA, não em paralelo. A garantia estava no
// `where` do `consumirDesafio`, que inclui o valor do desafio — duas
// requisições simultâneas disputam a mesma linha e só uma atualiza. Mas
// garantia sem teste é intenção.
//
// Duas coisas são medidas aqui, e a segunda é incomum:
//
//  1. O meu código, pelo repositório REAL tirado do container. Reimplementar a
//     consulta no teste provaria o teste.
//  2. O próprio teste. Um resultado "exatamente 1" pode ser coincidência de
//     agendamento: se o banco serializar por acidente, a implementação errada
//     passaria igual. Então cada caso de concorrência tem um par que roda a
//     implementação ÓBVIA E ERRADA no mesmo cenário e exige que ela FALHE. Se
//     os dois lados concordarem, o teste não distingue nada e é ele que está
//     quebrado — e a asserção diz isso.
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  JANELA_DO_DESAFIO_MS, chamar, crachar, derrubarApp, identidade,
  pessoa, prisma, repositorio, sessao, subirApp,
} from './master-fixtures.mjs';

before(async () => { await subirApp(); });
after(async () => { await derrubarApp(); });

const PARALELAS = 8;

/** Um digest plausível e único: a coluna é `@unique`, e dois testes não podem colidir. */
const digestFalso = () => randomBytes(32).toString('hex');

async function comDesafio(rotulo) {
  const titular = await pessoa(rotulo);
  const ident = await identidade(titular.id, 'OWNER');
  const desafio = digestFalso();
  await prisma.platformMasterIdentity.update({
    where: { id: ident.id },
    data: {
      pendingChallenge: desafio,
      pendingChallengeKind: 'AUTHENTICATION',
      pendingChallengeExpires: new Date(Date.now() + JANELA_DO_DESAFIO_MS),
    },
  });
  return { titular, ident, desafio };
}

/**
 * A implementação ÓBVIA E ERRADA: lê, cede o laço, escreve sem condição.
 *
 * Não é código de produção e nunca será. Existe para provar que o teste
 * distingue — se ela passasse no mesmo cenário, o verde do caso anterior não
 * significaria nada.
 */
async function consumoIngenuo(identityId, desafioGravado) {
  const linha = await prisma.platformMasterIdentity.findUnique({
    where: { id: identityId }, select: { pendingChallenge: true },
  });
  if (linha?.pendingChallenge !== desafioGravado) return false;
  await new Promise((resolver) => { setTimeout(resolver, 25); });
  await prisma.platformMasterIdentity.update({
    where: { id: identityId },
    data: { pendingChallenge: null, pendingChallengeKind: null, pendingChallengeExpires: null },
  });
  return true;
}

// ------------------------------------------------ consumo único do desafio

test('oito consumos PARALELOS do mesmo desafio: exatamente um vence', { timeout: 120000 }, async () => {
  const { ident, desafio } = await comDesafio('conc-desafio');
  const repo = repositorio();

  const resultados = await Promise.all(
    Array.from({ length: PARALELAS }, () => repo.consumirDesafio(ident.id, desafio)),
  );

  const vencedores = resultados.filter(Boolean).length;
  assert.equal(vencedores, 1, `${vencedores} chamadas consumiram o mesmo desafio; tem de ser exatamente 1`);

  const depois = await prisma.platformMasterIdentity.findUnique({
    where: { id: ident.id },
    select: { pendingChallenge: true, pendingChallengeKind: true, pendingChallengeExpires: true },
  });
  assert.equal(depois.pendingChallenge, null, 'a linha tem de ficar limpa');
  assert.equal(depois.pendingChallengeKind, null);
  assert.equal(depois.pendingChallengeExpires, null);
});

test('o teste acima DISTINGUE: a implementação ingênua falha no mesmo cenário', { timeout: 120000 }, async () => {
  // Se este caso passasse com 1, o caso anterior não provaria atomicidade —
  // provaria que o agendamento serializou por acidente.
  const { ident, desafio } = await comDesafio('conc-ingenuo');

  const resultados = await Promise.all(
    Array.from({ length: PARALELAS }, () => consumoIngenuo(ident.id, desafio)),
  );

  const vencedores = resultados.filter(Boolean).length;
  assert.ok(
    vencedores > 1,
    `a implementação ingênua deveria deixar várias passarem e deixou ${vencedores}. `
    + 'Se der 1, o banco serializou por conta própria e o par de testes perdeu o poder de distinguir: '
    + 'o cenário precisa de mais concorrência, não de uma asserção mais frouxa.',
  );
});

test('consumo de desafio que não é o gravado não limpa a linha', { timeout: 120000 }, async () => {
  // O `where` inclui o VALOR. Sem isso, qualquer chamada apagaria o desafio de
  // uma cerimônia em curso, e uma tentativa inválida derrubaria a válida.
  const { ident, desafio } = await comDesafio('conc-outro-valor');
  const repo = repositorio();

  assert.equal(await repo.consumirDesafio(ident.id, digestFalso()), false, 'valor errado não consome');
  const linha = await prisma.platformMasterIdentity.findUnique({
    where: { id: ident.id }, select: { pendingChallenge: true },
  });
  assert.equal(linha.pendingChallenge, desafio, 'o desafio da cerimônia em curso continua lá');

  assert.equal(await repo.consumirDesafio(ident.id, desafio), true, 'e o valor certo ainda consome');
});

// ----------------------------------------- duas requisições HTTP simultâneas

test('duas requisições HTTP simultâneas com o mesmo desafio: nenhuma credencial é gravada', { timeout: 120000 }, async () => {
  // Limite deste caso, e é melhor dizer: as quatro recusas da cerimônia
  // compartilham a MESMA frase de propósito, para não contar ao atacante em
  // qual situação ele caiu. Então por HTTP não se vê QUAL requisição consumiu o
  // desafio — as duas falham na assinatura, porque não existe autenticador
  // aqui. Quem prova o consumo único é o caso do repositório, acima. Este prova
  // a invariante que importa em operação: nada fica pela metade.
  const titular = await pessoa('conc-http');
  const ident = await identidade(titular.id, 'OWNER');
  const master = await sessao(ident.id);
  const jwt = crachar(titular.id, titular.email);

  const abertura = await chamar('/platform/master/credentials/challenge', jwt, { method: 'POST', master });
  assert.equal(abertura.status, 201, await abertura.text());
  const { challenge } = await abertura.json();

  const corpo = JSON.stringify({ desafio: challenge, resposta: { id: `inexistente-${randomUUID()}` } });
  const respostas = await Promise.all(
    Array.from({ length: 2 }, () => chamar('/platform/master/credentials', jwt, { method: 'POST', master, body: corpo })),
  );

  for (const r of respostas) {
    assert.equal(r.status, 401, `sem autenticador, as duas têm de ser recusadas: ${await r.text()}`);
  }

  const depois = await prisma.platformMasterIdentity.findUnique({
    where: { id: ident.id }, select: { pendingChallenge: true },
  });
  assert.equal(depois.pendingChallenge, null, 'o desafio tem de sair da linha, consumido uma vez');
  assert.equal(
    await prisma.platformWebAuthnCredential.count({ where: { identityId: ident.id } }), 0,
    'recusa não grava credencial, e muito menos duas',
  );
});

// --------------------------------------------- o contador não retrocede

test('replay com ponto de partida velho NÃO faz o contador retroceder', { timeout: 120000 }, async () => {
  // Este é o ataque real: uma assertion antiga, reapresentada. O `where` com
  // `counter: { lte: de }` recusa a escrita cujo ponto de partida já ficou
  // velho.
  //
  // Vale registrar o que esta guarda NÃO garante, porque eu pensei errado antes
  // de escrever: ela não faz o maior valor vencer. Duas chamadas paralelas com
  // o MESMO `de` terminam no valor de quem chegou primeiro, e asserção sobre
  // qual delas seria flaky. Por isso o cenário é determinístico: o contador já
  // avançou, e os replays partem de um ponto velho.
  const titular = await pessoa('conc-contador');
  const ident = await identidade(titular.id, 'OWNER');
  const repo = repositorio();
  const credentialId = `cred-${randomUUID()}`;

  await prisma.platformWebAuthnCredential.create({
    data: {
      identityId: ident.id,
      credentialId,
      publicKey: Buffer.from(randomBytes(64)).toString('base64url'),
      counter: 5,
      label: 'Chave de fixture',
      backedUp: false,
      transports: 'usb',
    },
  });

  await repo.avancarContador(credentialId, 5, 50);
  const avancado = await prisma.platformWebAuthnCredential.findUnique({
    where: { credentialId }, select: { counter: true },
  });
  assert.equal(avancado.counter, 50, 'o avanço legítimo vale');

  // Oito replays simultâneos partindo de 5, todos com valores menores que 50.
  await Promise.all(
    Array.from({ length: PARALELAS }, (_, i) => repo.avancarContador(credentialId, 5, 6 + i)),
  );

  const depois = await prisma.platformMasterSession === null ? null : await prisma.platformWebAuthnCredential.findUnique({
    where: { credentialId }, select: { counter: true },
  });
  assert.equal(depois.counter, 50, 'nenhum replay pode baixar o contador — é a janela do autenticador clonado');
});

test('o teste acima DISTINGUE: sem a guarda, o contador retrocede', { timeout: 120000 }, async () => {
  const titular = await pessoa('conc-contador-ingenuo');
  const ident = await identidade(titular.id, 'OWNER');
  const credentialId = `cred-${randomUUID()}`;

  await prisma.platformWebAuthnCredential.create({
    data: {
      identityId: ident.id,
      credentialId,
      publicKey: Buffer.from(randomBytes(64)).toString('base64url'),
      counter: 50,
      label: 'Chave de fixture',
      backedUp: false,
      transports: 'usb',
    },
  });

  // A escrita sem a condição de `lte`: é isto que o código faria se a guarda
  // saísse, e é por isso que o caso anterior tem valor.
  await prisma.platformWebAuthnCredential.update({
    where: { credentialId }, data: { counter: 6 },
  });
  const depois = await prisma.platformWebAuthnCredential.findUnique({
    where: { credentialId }, select: { counter: true },
  });
  assert.equal(depois.counter, 6, 'sem a guarda o contador retrocede, e o caso anterior é o que impede isso');
});
