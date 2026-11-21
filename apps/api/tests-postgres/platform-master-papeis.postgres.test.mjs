// Disposable CI PostgreSQL only. Unique fixture data is preserved, never deleted.
//
// Papel de organização NÃO é papel de plataforma (#665, ordem Work 14/11).
//
// Este arquivo responde uma pergunta só: **ser dono de uma organização, ou dono
// de um evento, dá algum poder na Área Master?** A resposta tem de ser não, e
// tem de ser não por construção — `concessoes()` lê apenas `PlatformGrant`, e
// nunca `Organization.createdById` nem `Event.ownerId`.
//
// Por construção já era. O que faltava era teste: uma propriedade garantida
// porque ninguém escreveu o código que a violaria é uma propriedade que a
// próxima pessoa viola sem perceber. "Carregar a organização do usuário para
// facilitar" é uma mudança de uma linha, parece conveniência, e abriria a Área
// Master para todo organizador da plataforma.
//
// É o item "provar OWNER organizacional recusado" da ordem, e também o
// "sem misturar papel de organização com papel de plataforma".
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import {
  chamar, crachar, derrubarApp, evento, identidade, motivoValido,
  organizacao, pessoa, prisma, sessao, subirApp,
} from './master-fixtures.mjs';

before(async () => { await subirApp(); });
after(async () => { await derrubarApp(); });

/**
 * Monta alguém que é dono da organização E dono do evento.
 *
 * As duas coisas de propósito: são os dois caminhos pelos quais uma
 * implementação distraída poderia conceder acesso sem passar por `PlatformGrant`.
 */
async function donoDeVerdade(rotulo) {
  const dono = await pessoa(`${rotulo}-dono`);
  const org = await organizacao(rotulo, dono.id);
  const ev = await evento(rotulo, dono.id, org.id);
  return { dono, org, ev, jwt: crachar(dono.id, dono.email) };
}

test('dono da organização e do evento, sem identidade Master: 404 no próprio evento', { timeout: 120000 }, async () => {
  // Não é 403. Para quem não é da Área Master, ela não existe — nem para o dono
  // do recurso. 403 contaria que existe uma área administrativa e que ele só
  // não tem permissão, o que é meio caminho para procurá-la.
  const { ev, jwt } = await donoDeVerdade('papel-sem-ident');

  const r = await chamar(`/platform/master/events/${ev.id}/summary`, jwt, { master: 'token-qualquer' });
  assert.equal(r.status, 404, `o dono do evento não entra pela Área Master: deu ${r.status}`);

  const painel = await chamar('/platform/master/overview', jwt, { method: 'POST', master: 'token-qualquer', body: '{}' });
  assert.equal(painel.status, 404);
});

test('dono da organização COM identidade Master e sem concessão: 403 no próprio evento', { timeout: 120000 }, async () => {
  // O caso que importa. Ele tem sessão Master válida, é dono da organização e
  // dono do evento — e continua recusado, porque não há linha em
  // `PlatformGrant`. Se um dia alguém ligar a titularidade da organização à
  // decisão, é ESTE teste que cai.
  const { dono, ev, jwt } = await donoDeVerdade('papel-com-ident');
  const ident = await identidade(dono.id, 'DELEGADO');
  const master = await sessao(ident.id);

  assert.equal(
    await prisma.platformGrant.count({ where: { targetUserId: dono.id } }), 0,
    'o cenário exige que ele não tenha concessão nenhuma',
  );

  const r = await chamar(`/platform/master/events/${ev.id}/summary`, jwt, { master });
  assert.equal(r.status, 403, 'ser dono do recurso não é concessão na Área Master');

  // E a recusa deixa rastro, com o motivo correto: ausência de concessão, e não
  // escopo fora de alcance. O motivo errado mandaria o proprietário procurar o
  // problema no lugar errado.
  const trilha = await prisma.platformAuditLog.findMany({
    where: { actorUserId: dono.id }, select: { action: true, result: true }, orderBy: { occurredAt: 'desc' }, take: 1,
  });
  assert.equal(trilha.length, 1, 'negar sem rastro é como não ter negado');
  assert.equal(trilha[0].result, 'DENIED');
  assert.match(trilha[0].action, /SEM_CONCESSAO/);
});

test('dono da organização com concessão em OUTRO evento: 403 no evento que é dele', { timeout: 120000 }, async () => {
  // Combina as duas coisas: ele é dono da organização e tem concessão de
  // evento — mas de outro evento. A titularidade não preenche a lacuna do
  // escopo.
  const proprietario = await pessoa('papel-cruz-owner');
  const identOwner = await identidade(proprietario.id, 'OWNER');
  const masterOwner = await sessao(identOwner.id);

  const { dono, org, ev, jwt } = await donoDeVerdade('papel-cruz');
  const outroEvento = await evento('papel-cruz-outro', dono.id, org.id);
  const ident = await identidade(dono.id, 'DELEGADO');
  const master = await sessao(ident.id);

  const concedida = await chamar('/platform/master/grants', crachar(proprietario.id, proprietario.email), {
    method: 'POST', master: masterOwner,
    body: JSON.stringify({
      pessoas: [dono.id], acoes: ['consultar'],
      escopo: { tipo: 'EVENTOS', eventIds: [outroEvento.id] }, motivo: motivoValido,
    }),
  });
  assert.ok(concedida.ok, `concessão falhou: ${concedida.status} ${await concedida.text()}`);

  assert.equal(
    (await chamar(`/platform/master/events/${outroEvento.id}/summary`, jwt, { master })).status, 200,
    'no evento concedido ele passa',
  );
  assert.equal(
    (await chamar(`/platform/master/events/${ev.id}/summary`, jwt, { master })).status, 403,
    'e no evento que é DELE, sem concessão, é recusado — a titularidade não alcança',
  );
});

test('concessão de ORGANIZAÇÃO não abre o painel da plataforma', { timeout: 120000 }, async () => {
  // Papel de organização não é papel de plataforma. Quem cuida de uma
  // organização inteira ainda não vê os totais da plataforma: seria vazamento
  // pela soma, e é o mesmo motivo pelo qual concessão de evento não abre o
  // painel.
  const proprietario = await pessoa('papel-org-owner');
  const identOwner = await identidade(proprietario.id, 'OWNER');
  const masterOwner = await sessao(identOwner.id);

  const { dono, org, jwt } = await donoDeVerdade('papel-org');
  const ident = await identidade(dono.id, 'DELEGADO');
  const master = await sessao(ident.id);

  const concedida = await chamar('/platform/master/grants', crachar(proprietario.id, proprietario.email), {
    method: 'POST', master: masterOwner,
    body: JSON.stringify({
      pessoas: [dono.id], acoes: ['consultar', 'auditar'],
      escopo: { tipo: 'ORGANIZACAO', organizationId: org.id }, motivo: motivoValido,
    }),
  });
  assert.ok(concedida.ok, `concessão falhou: ${concedida.status} ${await concedida.text()}`);

  const naOrganizacao = await chamar(`/platform/master/organizations/${org.id}/audit`, jwt, {
    method: 'POST', master, body: '{}',
  });
  assert.equal(naOrganizacao.status, 201, `na organização concedida ele passa: ${await naOrganizacao.text()}`);

  const painel = await chamar('/platform/master/overview', jwt, { method: 'POST', master, body: '{}' });
  assert.equal(painel.status, 403, 'o painel da plataforma inteira exige alcance global');

  const trilhaDaPlataforma = await chamar('/platform/master/audit', jwt, { method: 'POST', master, body: '{}' });
  assert.equal(trilhaDaPlataforma.status, 403, 'e a trilha da plataforma inteira também');
});

test('concessão de organização não alcança OUTRA organização, nem a do próprio dono', { timeout: 120000 }, async () => {
  const proprietario = await pessoa('papel-org2-owner');
  const identOwner = await identidade(proprietario.id, 'OWNER');
  const masterOwner = await sessao(identOwner.id);

  const { dono, org, jwt } = await donoDeVerdade('papel-org2');
  // Ele é dono desta segunda organização também, e não recebe concessão nela.
  const suaOutraOrg = await organizacao('papel-org2-dele', dono.id);
  const ident = await identidade(dono.id, 'DELEGADO');
  const master = await sessao(ident.id);

  const concedida = await chamar('/platform/master/grants', crachar(proprietario.id, proprietario.email), {
    method: 'POST', master: masterOwner,
    body: JSON.stringify({
      pessoas: [dono.id], acoes: ['auditar'],
      escopo: { tipo: 'ORGANIZACAO', organizationId: org.id }, motivo: motivoValido,
    }),
  });
  assert.ok(concedida.ok, await concedida.text());

  assert.equal(
    (await chamar(`/platform/master/organizations/${org.id}/audit`, jwt, { method: 'POST', master, body: '{}' })).status,
    201, 'na organização concedida, sim',
  );
  assert.equal(
    (await chamar(`/platform/master/organizations/${suaOutraOrg.id}/audit`, jwt, { method: 'POST', master, body: '{}' })).status,
    403, 'na organização que é dele mas não foi concedida, não',
  );
});

test('o proprietário da plataforma não precisa de concessão, e é a única exceção', { timeout: 120000 }, async () => {
  // O outro lado da mesma regra: o papel de plataforma vem da identidade
  // Master com role OWNER, e não de titularidade de nenhum recurso. Sem este
  // caso, os cinco acima passariam numa implementação que nega tudo.
  const proprietario = await pessoa('papel-plataforma');
  const ident = await identidade(proprietario.id, 'OWNER');
  const master = await sessao(ident.id);
  const jwt = crachar(proprietario.id, proprietario.email);

  const { ev } = await donoDeVerdade('papel-plataforma-recurso');

  assert.equal(
    await prisma.platformGrant.count({ where: { targetUserId: proprietario.id } }), 0,
    'ele não tem concessão nenhuma, de propósito',
  );
  assert.equal(
    (await chamar(`/platform/master/events/${ev.id}/summary`, jwt, { master })).status, 200,
    'e alcança um evento de uma organização que não é dele',
  );
  assert.equal(
    (await chamar('/platform/master/overview', jwt, { method: 'POST', master, body: '{}' })).status, 201,
    'e o painel da plataforma',
  );
});
