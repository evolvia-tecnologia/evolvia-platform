import assert from 'node:assert/strict';
import test from 'node:test';
import {
  alcanceDaLinha,
  montarVisaoDaEquipe,
  situacaoDoAcesso,
} from '../src/platform-team-view.ts';

const AGORA = Date.parse('2026-11-20T12:00:00.000Z');
const DIAS = (n) => new Date(AGORA + n * 86400_000).toISOString();

const concessao = (extra = {}) => ({
  targetUserId: 'user-1',
  action: 'consultar',
  scopeKind: 'GLOBAL',
  organizationId: '',
  eventId: '',
  grantedByUserId: 'owner-1',
  grantedAt: DIAS(-10),
  expiresAt: DIAS(30),
  ...extra,
});

const mudanca = (extra = {}) => ({
  targetUserId: 'user-1',
  kind: 'GRANTED',
  action: 'consultar',
  actorUserId: 'owner-1',
  occurredAt: DIAS(-10),
  ...extra,
});

const pessoa = (extra = {}) => ({ id: 'user-1', name: 'Pessoa Um', email: 'um@exemplo.com', ...extra });

// --- alcance: o ponto de segurança deste módulo ---------------------------

test('os três alcances conhecidos são traduzidos com os ids que lhes pertencem', () => {
  assert.deepEqual(alcanceDaLinha(concessao({ scopeKind: 'GLOBAL' })), { tipo: 'GLOBAL' });
  assert.deepEqual(
    alcanceDaLinha(concessao({ scopeKind: 'ORGANIZACAO', organizationId: 'org-9' })),
    { tipo: 'ORGANIZACAO', organizationId: 'org-9' },
  );
  assert.deepEqual(
    alcanceDaLinha(concessao({ scopeKind: 'EVENTO', eventId: 'evt-9' })),
    { tipo: 'EVENTO', eventId: 'evt-9' },
  );
});

test('alcance desconhecido NÃO vira GLOBAL', () => {
  // Este é o caso que motivou o módulo. `platform-master.repository.escopoDaLinha`
  // converte qualquer valor fora de ORGANIZACAO/EVENTO em GLOBAL, que é o
  // alcance MAIS LARGO — fail-open num campo de alcance. Hoje é latente, porque
  // a coluna é enum e só aceita três valores; passa a ser ativo no dia em que
  // alguem acrescentar um valor ao enum.
  for (const bruto of ['ORGANIZACOES', 'EVENTOS', 'TUDO', 'global', '']) {
    const alcance = alcanceDaLinha(concessao({ scopeKind: bruto }));
    assert.notEqual(alcance.tipo, 'GLOBAL', `"${bruto}" virou alcance global`);
    assert.equal(alcance.tipo, 'DESCONHECIDO');
  }
  // E carrega o bruto, para que quem olha saiba o que apareceu no banco.
  assert.deepEqual(
    alcanceDaLinha(concessao({ scopeKind: 'ORGANIZACOES' })),
    { tipo: 'DESCONHECIDO', bruto: 'ORGANIZACOES' },
  );
});

test('alcance desconhecido é CONTADO, para aparecer a um humano', () => {
  const visao = montarVisaoDaEquipe(
    [concessao({ scopeKind: 'TUDO' }), concessao({ action: 'auditar' })],
    [], [pessoa()], AGORA,
  );
  assert.equal(visao.comAlcanceDesconhecido, 1);
  // E a linha não é descartada: descartar esconderia a anomalia.
  assert.equal(visao.pessoas[0].acessos.length, 2);
});

// --- expirada nunca desaparece --------------------------------------------

test('sem prazo é vigente; prazo futuro é vigente; prazo passado é expirado', () => {
  assert.equal(situacaoDoAcesso(null, AGORA), 'VIGENTE');
  assert.equal(situacaoDoAcesso(undefined, AGORA), 'VIGENTE');
  assert.equal(situacaoDoAcesso('', AGORA), 'VIGENTE');
  assert.equal(situacaoDoAcesso(DIAS(1), AGORA), 'VIGENTE');
  assert.equal(situacaoDoAcesso(DIAS(-1), AGORA), 'EXPIRADA');
});

test('prazo ilegível conta como expirado, não como sem prazo', () => {
  // Na dúvida a leitura mostra o estado menos favorável: ninguém deve contar
  // com um acesso que o autorizador pode recusar.
  assert.equal(situacaoDoAcesso('nao-e-data', AGORA), 'EXPIRADA');
});

test('o instante exato da expiração já é expirado', () => {
  assert.equal(situacaoDoAcesso(new Date(AGORA).toISOString(), AGORA), 'EXPIRADA');
});

test('concessão expirada aparece na lista, com a data e rótulada', () => {
  const visao = montarVisaoDaEquipe([concessao({ expiresAt: DIAS(-2) })], [], [pessoa()], AGORA);
  const linha = visao.pessoas[0];
  assert.equal(linha.acessos.length, 1, 'a expirada foi escondida: quem lê não saberia por que o acesso sumiu');
  assert.equal(linha.acessos[0].situacao, 'EXPIRADA');
  assert.equal(linha.acessos[0].expiraEm, DIAS(-2));
  assert.equal(linha.vigentes, 0);
  assert.equal(linha.expiradas, 1);
  assert.equal(linha.semAcessoAgora, true);
});

test('vigentes e expiradas são contadas separadamente', () => {
  const visao = montarVisaoDaEquipe(
    [
      concessao({ action: 'consultar', expiresAt: DIAS(10) }),
      concessao({ action: 'auditar', expiresAt: DIAS(-10) }),
      concessao({ action: 'relatorios', expiresAt: null }),
    ],
    [], [pessoa()], AGORA,
  );
  const linha = visao.pessoas[0];
  assert.equal(linha.vigentes, 2);
  assert.equal(linha.expiradas, 1);
  assert.equal(linha.semAcessoAgora, false);
});

// --- quem perdeu acesso não desaparece ------------------------------------

test('pessoa sem concessão mas com histórico APARECE', () => {
  // `PlatformGrant` não tem coluna de revogação: revogar apaga a linha. Sem o
  // histórico, quem foi revogado é indistinguível de quem nunca teve acesso.
  const visao = montarVisaoDaEquipe(
    [],
    [mudanca({ kind: 'REVOKED', occurredAt: DIAS(-1) })],
    [pessoa()], AGORA,
  );
  assert.equal(visao.pessoas.length, 1, 'a pessoa revogada desapareceu da lista');
  const linha = visao.pessoas[0];
  assert.equal(linha.acessos.length, 0);
  assert.equal(linha.semAcessoAgora, true);
  assert.equal(linha.ultimaMudanca.tipo, 'REVOGADA');
  assert.equal(linha.ultimaMudanca.quando, DIAS(-1));
  assert.equal(linha.ultimaMudanca.porQuem, 'owner-1');
});

test('a última mudança é a mais recente, independente da ordem recebida', () => {
  const visao = montarVisaoDaEquipe(
    [],
    [
      mudanca({ kind: 'GRANTED', occurredAt: DIAS(-5) }),
      mudanca({ kind: 'REVOKED', occurredAt: DIAS(-1) }),
      mudanca({ kind: 'GRANTED', occurredAt: DIAS(-9) }),
    ],
    [pessoa()], AGORA,
  );
  assert.equal(visao.pessoas[0].ultimaMudanca.tipo, 'REVOGADA',
    'a ordenação seguiu a posição na lista em vez do instante');
});

test('tipo de mudança desconhecido não é adivinhado', () => {
  const visao = montarVisaoDaEquipe([], [mudanca({ kind: 'EXPIRED' })], [pessoa()], AGORA);
  assert.equal(visao.pessoas[0].ultimaMudanca.tipo, 'DESCONHECIDA');
});

test('a união cobre quem tem concessão, quem tem histórico, e quem tem os dois', () => {
  const visao = montarVisaoDaEquipe(
    [concessao({ targetUserId: 'so-concessao' }), concessao({ targetUserId: 'ambos' })],
    [mudanca({ targetUserId: 'so-historico' }), mudanca({ targetUserId: 'ambos' })],
    [], AGORA,
  );
  assert.deepEqual(
    visao.pessoas.map((p) => p.userId).sort(),
    ['ambos', 'so-concessao', 'so-historico'],
  );
});

// --- pessoa sem registro --------------------------------------------------

test('id sem registro de usuário aparece, com nome nulo e contado', () => {
  // Pode acontecer se a conta foi apagada e a concessão ficou. Omitir
  // esconderia um acesso que o autorizador ainda honra.
  const visao = montarVisaoDaEquipe([concessao({ targetUserId: 'fantasma' })], [], [pessoa()], AGORA);
  assert.equal(visao.pessoas.length, 1);
  assert.equal(visao.pessoas[0].userId, 'fantasma');
  assert.equal(visao.pessoas[0].nome, null);
  assert.equal(visao.pessoas[0].email, null);
  assert.equal(visao.semIdentificacao, 1);
});

test('nome vazio no registro vira nulo, e não string vazia', () => {
  const visao = montarVisaoDaEquipe([concessao()], [], [pessoa({ name: '   ', email: '' })], AGORA);
  assert.equal(visao.pessoas[0].nome, null);
  assert.equal(visao.pessoas[0].email, null);
  assert.equal(visao.semIdentificacao, 0, 'o registro existe: só os campos estão vazios');
});

// --- ordem determinística -------------------------------------------------

test('a ordem é por nome, depois e-mail, depois id', () => {
  const visao = montarVisaoDaEquipe(
    [
      concessao({ targetUserId: 'c' }),
      concessao({ targetUserId: 'a' }),
      concessao({ targetUserId: 'b' }),
    ],
    [],
    [
      { id: 'c', name: 'Ana', email: 'z@z.com' },
      { id: 'a', name: 'Zeca', email: 'a@a.com' },
      { id: 'b', email: 'bruno@b.com' },
    ],
    AGORA,
  );
  // Ana (nome), bruno@b.com (sem nome, cai no e-mail), Zeca (nome).
  assert.deepEqual(visao.pessoas.map((p) => p.userId), ['c', 'b', 'a']);
});

test('a ordem não depende da ordem recebida', () => {
  const linhas = [concessao({ targetUserId: 'x' }), concessao({ targetUserId: 'y' })];
  const pessoas = [{ id: 'x', name: 'Beto' }, { id: 'y', name: 'Alice' }];
  const uma = montarVisaoDaEquipe(linhas, [], pessoas, AGORA);
  const outra = montarVisaoDaEquipe([...linhas].reverse(), [], [...pessoas].reverse(), AGORA);
  assert.deepEqual(uma.pessoas.map((p) => p.userId), outra.pessoas.map((p) => p.userId));
  assert.deepEqual(uma.pessoas.map((p) => p.userId), ['y', 'x']);
});

test('vigentes vêm antes das expiradas na lista de acessos', () => {
  const visao = montarVisaoDaEquipe(
    [
      concessao({ action: 'auditar', expiresAt: DIAS(-1) }),
      concessao({ action: 'consultar', expiresAt: DIAS(1) }),
    ],
    [], [pessoa()], AGORA,
  );
  assert.deepEqual(
    visao.pessoas[0].acessos.map((a) => [a.acao, a.situacao]),
    [['consultar', 'VIGENTE'], ['auditar', 'EXPIRADA']],
  );
});

// --- entrada imprestável --------------------------------------------------

test('linha sem pessoa ou sem ação é descartada, e não inventa uma linha vazia', () => {
  const visao = montarVisaoDaEquipe(
    [
      concessao({ targetUserId: '' }),
      concessao({ targetUserId: '   ' }),
      concessao({ action: '' }),
      concessao({ targetUserId: null }),
    ],
    [], [], AGORA,
  );
  assert.equal(visao.pessoas.length, 0);
});

test('entrada vazia devolve visão vazia, e não erro', () => {
  const visao = montarVisaoDaEquipe([], [], [], AGORA);
  assert.deepEqual(visao, { pessoas: [], semIdentificacao: 0, comAlcanceDesconhecido: 0 });
});

test('a mesma pessoa com várias concessões vira UMA linha', () => {
  const visao = montarVisaoDaEquipe(
    [
      concessao({ action: 'consultar' }),
      concessao({ action: 'auditar' }),
      concessao({ action: 'relatorios' }),
    ],
    [], [pessoa()], AGORA,
  );
  assert.equal(visao.pessoas.length, 1);
  assert.equal(visao.pessoas[0].acessos.length, 3);
});
