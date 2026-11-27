/**
 * Contrato do script de revogacao de janela da Area Master (#571, achado A3).
 *
 * Cada caso prende uma propriedade que o achado exigia: revogacao SEGURA (nao
 * roda em producao, nao transfere titularidade, nao apaga credencial), ATOMICA
 * (um bloco, uma transacao, trilha por ultimo) e AUDITAVEL (ator sistemico,
 * contagem no changes, recusa explicita quando nada ha para revogar).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ATOR_DA_INSCRICAO, MOTIVOS, decidirEntrada, idEstiloCuid, lerArgumentos, montarSql,
} from './revogar-inscricao-master.policy.mjs';
import { ehAtorSistemico } from './provisionar-proprietario-master.policy.mjs';
import { executar } from './revogar-inscricao-master.mjs';

const IDENT = 'cmasteridentidade000000001';
const AMBIENTE = {
  DATABASE_URL: 'postgresql://evolvia:x@homologacao-db:5432/evolvia',
  NODE_ENV: 'test',
  EVOLVIA_AMBIENTE: 'homologacao',
};

const base = (extra = {}) => ({
  email: 'titular@evolvia-ci.local',
  identidade: IDENT,
  nota: 'Canal de entrega comprometido, chamado CH-7.',
  correlacao: 'ch-7',
  confirmarHost: 'homologacao-db',
  confirmouRevogacao: true,
  ...extra,
});

const sql = (extra = {}) => montarSql({ ...base(), ...extra });

// ------------------------------------------------------------ a autorizacao

test('sem --confirmar-revogacao, recusa', () => {
  // Fechar autorizacao pendente e deliberado. Um comando digitado pela metade
  // nao pode produzir efeito nenhum.
  const d = decidirEntrada(base({ confirmouRevogacao: false }), AMBIENTE);
  assert.equal(d.autorizado, false);
  assert.equal(d.motivo, MOTIVOS.confirmacao_ausente);
});

test('producao e recusada ANTES de qualquer validacao de conteudo', () => {
  // Se o conteudo fosse validado primeiro, o operador corrigiria o formato e
  // dispararia no banco errado.
  for (const env of [
    { ...AMBIENTE, DATABASE_URL: 'postgresql://u:p@prod-db-01:5432/evolvia' },
    { ...AMBIENTE, DATABASE_URL: 'postgresql://u:p@db:5432/producao' },
    { ...AMBIENTE, NODE_ENV: 'production' },
    { ...AMBIENTE, EVOLVIA_AMBIENTE: 'producao' },
  ]) {
    const d = decidirEntrada(base({ email: 'x', identidade: '!', nota: '', correlacao: '' }), env);
    assert.equal(d.autorizado, false);
    assert.equal(d.motivo, MOTIVOS.producao, `aceitou ${env.DATABASE_URL} / ${env.NODE_ENV}`);
  }
});

test('ambiente de homologacao tem de ser declarado', () => {
  const d = decidirEntrada(base(), { ...AMBIENTE, EVOLVIA_AMBIENTE: undefined });
  assert.equal(d.autorizado, false);
  assert.equal(d.motivo, MOTIVOS.ambiente_nao_declarado);
});

test('--confirmar-host tem de repetir o host do DATABASE_URL', () => {
  for (const host of [undefined, '', 'outro-db', 'homologacao-db ', 'HOMOLOGACAO-DB']) {
    const d = decidirEntrada(base({ confirmarHost: host }), AMBIENTE);
    assert.equal(d.autorizado, false, `aceitou ${String(host)}`);
    assert.equal(d.motivo, MOTIVOS.host_nao_confirmado);
  }
  assert.equal(decidirEntrada(base(), AMBIENTE).autorizado, true);
});

test('sem DATABASE_URL nao ha o que confirmar', () => {
  assert.equal(decidirEntrada(base(), { EVOLVIA_AMBIENTE: 'homologacao' }).motivo, MOTIVOS.sem_banco);
});

test('conteudo invalido e recusado campo por campo', () => {
  const casos = [
    [{ email: 'sem-arroba' }, MOTIVOS.email_invalido],
    [{ email: `${'a'.repeat(250)}@x.org` }, MOTIVOS.email_invalido],
    [{ identidade: 'id com espaco' }, MOTIVOS.identidade_invalida],
    [{ identidade: '' }, MOTIVOS.identidade_invalida],
    [{ nota: '   ' }, MOTIVOS.nota_invalida],
    [{ nota: 'x'.repeat(201) }, MOTIVOS.nota_invalida],
    [{ correlacao: 'com espaco' }, MOTIVOS.correlacao_invalida],
    [{ correlacao: 'x'.repeat(65) }, MOTIVOS.correlacao_invalida],
  ];
  for (const [troca, esperado] of casos) {
    const d = decidirEntrada(base(troca), AMBIENTE);
    assert.equal(d.autorizado, false, `aceitou ${JSON.stringify(troca)}`);
    assert.equal(d.motivo, esperado, `motivo errado para ${JSON.stringify(troca)}`);
  }
});

// ------------------------------------------------------------- o SQL gerado

test('um bloco, uma transacao, e a trilha e o ULTIMO INSERT', () => {
  const s = sql();
  assert.equal(s.split('DO $evolvia_revogacao_master$').length - 1, 1, 'mais de um bloco');
  assert.ok(s.trimEnd().endsWith('$evolvia_revogacao_master$;'), 'o bloco nao fecha');
  const trilha = s.indexOf('INSERT INTO "PlatformAuditLog"');
  const revogacao = s.indexOf('UPDATE "PlatformMasterEnrollmentWindow"');
  assert.ok(revogacao > 0 && trilha > revogacao,
    'a trilha tem de vir depois: se ela falhar, o bloco cai e a revogacao se desfaz');
  assert.equal(s.indexOf('INSERT INTO', trilha + 1), -1, 'ha INSERT depois da trilha');
});

test('revoga por UPDATE, nunca por DELETE, e so o que esta ABERTO', () => {
  const s = sql();
  assert.ok(!s.includes('DELETE FROM'), 'DELETE perderia a auditoria da janela');
  const alvo = s.slice(s.indexOf('UPDATE "PlatformMasterEnrollmentWindow"'), s.indexOf('GET DIAGNOSTICS'));
  assert.ok(alvo.includes('"revokedAt" = now()'));
  assert.ok(alvo.includes('"challengeHash" = NULL'), 'desafio gravado sem uso continuaria na linha');
  for (const condicao of ['"consumedAt" IS NULL', '"revokedAt" IS NULL', '"expiresAt" > now()']) {
    assert.ok(alvo.includes(condicao), `o UPDATE alcanca linha que nao devia: falta ${condicao}`);
  }
});

test('zero linhas revogadas FALHA em vez de sair em silencio', () => {
  // Zero linhas afetadas lido como sucesso faria o operador parar de procurar
  // um segredo que continua valido em outro lugar.
  const s = sql();
  assert.ok(s.includes('GET DIAGNOSTICS revogadas = ROW_COUNT'), 'nao conta o que revogou');
  assert.ok(/IF revogadas = 0 THEN\n\s*RAISE EXCEPTION 'Nao havia autorizacao aberta/u.test(s),
    'sem a recusa explicita, revogar nada parece ter revogado algo');
});

test('a trava da identidade vem antes da revogacao, na mesma ordem dos irmaos', () => {
  const s = sql();
  const trava = s.indexOf('FOR UPDATE');
  assert.ok(trava > 0, 'sem trava, revogar e abrir ao mesmo tempo podem se cruzar');
  assert.ok(trava < s.indexOf('UPDATE "PlatformMasterEnrollmentWindow"'));
});

test('nao transfere titularidade: a identidade tem de pertencer ao e-mail', () => {
  const s = sql();
  assert.ok(s.includes('IF ident_id <> '), 'sem a guarda, o e-mail de B agiria na identidade de A');
  assert.ok(s.includes('nao pertence a este e-mail'));
});

test('nao apaga credencial, nao encerra sessao, nao altera a identidade', () => {
  // Confundir revogar janela com recuperar acesso e o erro que separou os dois
  // comandos: recuperar APAGA autenticadores.
  const s = sql();
  assert.ok(!s.includes('PlatformWebAuthnCredential'), 'tocou credencial');
  assert.ok(!s.includes('PlatformMasterSession'), 'tocou sessao');
  assert.ok(!s.includes('UPDATE "PlatformMasterIdentity"'), 'alterou a identidade');
  assert.ok(!s.includes('pendingChallenge'),
    'limpar cerimonia pendente cancelaria um registro de chave de reserva em curso');
});

test('nao exige identidade ACTIVE, e isso e deliberado', () => {
  // Exigir ACTIVE deixaria sem recurso justamente o caso em que a suspeita foi
  // o motivo de suspender a identidade.
  const s = sql();
  assert.ok(!s.includes("status = 'ACTIVE'"), 'passou a exigir ACTIVE para revogar');
  assert.ok(!s.includes('ident_status'), 'passou a ler status para decidir');
});

test('nenhum material secreto aparece no SQL', () => {
  // A palavra "segredo" APARECE, numa mensagem para o operador, e isso esta
  // certo: o que nao pode aparecer e material — digest, hash ou token. Revogar
  // nao le nem produz segredo, e e por isso que este comando nao tem
  // `--segredo` nenhum.
  const s = sql();
  for (const proibido of ['secretDigest', 'sha256', 'tokenHash', 'passwordHash', 'publicKey']) {
    assert.ok(!s.includes(proibido), `${proibido} apareceu no SQL de revogacao`);
  }
  // Nenhum bloco longo de base64url, que e a forma que um segredo teria.
  assert.equal(/[A-Za-z0-9_-]{43,}/u.test(s), false, 'ha um valor com forma de segredo no SQL');
});

// ------------------------------------------------------------------ trilha

test('o ator da trilha e sistemico e reconhecido pelo predicado compartilhado', () => {
  assert.equal(ehAtorSistemico(ATOR_DA_INSCRICAO), true);
  const s = sql();
  assert.ok(s.includes(`'${ATOR_DA_INSCRICAO}'`));
  // O alvo e o titular, o ator e o sistema. Trocar os dois afirmaria que o
  // titular revogou a propria janela pela aplicacao, e nao houve aplicacao.
  assert.ok(s.includes("'revogar_inscricao_master', 'GLOBAL', '', '', alvo_id"));
});

test('a trilha registra QUANTAS janelas foram revogadas', () => {
  const s = sql();
  assert.ok(s.includes("'janelasRevogadas', revogadas"),
    'sem a contagem, a linha nao distingue revogar uma de revogar nenhuma');
  assert.ok(s.includes("'identityId', ident_id"));
});

test('a nota do operador vai para reason, inteira', () => {
  const s = sql({ nota: "Pedido do fundador; o canal 'interno' vazou." });
  assert.ok(s.includes("'Pedido do fundador; o canal ''interno'' vazou.'"),
    'a aspa simples nao foi dobrada: o bloco quebraria ou mudaria de sentido');
});

// --------------------------------------------------------- valores hostis

test('valor com a marca do bloco e recusado', () => {
  assert.throws(() => sql({ nota: 'x $evolvia_revogacao_master$ y' }), /marca de delimitacao/u);
});

test('valor com byte nulo e recusado', () => {
  assert.throws(() => sql({ nota: 'antes\u0000depois' }), /byte nulo/u);
});

test('montarSql nao confia no chamador: revalida identidade e correlacao', () => {
  // Defesa em profundidade para quem usa o modulo por codigo, sem passar por
  // `decidirEntrada`.
  assert.throws(() => montarSql({ ...base(), identidade: 'id com espaco' }), /identidade/u);
  assert.throws(() => montarSql({ ...base(), correlacao: 'com espaco' }), /correlacao/u);
});

test('idEstiloCuid tem a forma que a coluna exige', () => {
  for (let i = 0; i < 50; i += 1) assert.match(idEstiloCuid(), /^c[a-z0-9]{24}$/u);
});

// ------------------------------------------------------------------- a CLI

test('lerArgumentos aceita --chave valor e --chave=valor', () => {
  const a = lerArgumentos(['--email', 'a@b.org', '--identidade', IDENT, '--confirmar-revogacao']);
  assert.equal(a.email, 'a@b.org');
  assert.equal(a.identidade, IDENT);
  assert.equal(a.confirmouRevogacao, true);
  const b = lerArgumentos([`--email=a@b.org`, `--correlacao=ch-1`]);
  assert.equal(b.email, 'a@b.org');
  assert.equal(b.correlacao, 'ch-1');
  assert.equal(b.confirmouRevogacao, false, 'a confirmacao nasce falsa');
});

test('argumento desconhecido nao vira confirmacao', () => {
  const a = lerArgumentos(['--confirmar', '--revogar', '--forcar']);
  assert.equal(a.confirmouRevogacao, false);
});

test('a CLI manda o SQL para a saida padrao e o resumo para a de erro', () => {
  const saida = [];
  const erro = [];
  const codigo = executar(
    ['--email', 'titular@evolvia-ci.local', '--identidade', IDENT,
      '--nota', 'Chamado CH-7.', '--correlacao', 'ch-7',
      '--confirmar-host', 'homologacao-db', '--confirmar-revogacao'],
    AMBIENTE, (t) => saida.push(t), (t) => erro.push(t),
  );
  assert.equal(codigo, 0);
  // `> revogacao.sql` tem de receber SQL e nada mais.
  assert.equal(saida.length, 1);
  assert.ok(saida[0].startsWith('DO $evolvia_revogacao_master$'));
  const resumo = erro.join('\n');
  assert.ok(resumo.includes('homologacao-db'));
  assert.ok(resumo.includes('recuperar-acesso-master.mjs'), 'o resumo nao aponta o caminho da recuperacao');
  assert.ok(!resumo.includes('DO $evolvia_revogacao_master$'), 'o SQL vazou para a saida de erro');
});

test('a CLI recusada devolve 1 e nao imprime SQL', () => {
  const saida = [];
  const erro = [];
  // So `--email`: a primeira recusa tem de ser a do HOST, nao a da confirmacao
  // nem a do conteudo. A ordem e a mesma dos irmaos, e e ela que impede corrigir
  // o formato e disparar no banco errado.
  const codigo = executar(['--email', 'titular@evolvia-ci.local'], AMBIENTE,
    (t) => saida.push(t), (t) => erro.push(t));
  assert.equal(codigo, 1);
  assert.equal(saida.length, 0, 'imprimiu SQL numa execucao recusada');
  assert.equal(erro.length, 1);
  assert.equal(erro[0], MOTIVOS.host_nao_confirmado);
});

test('com host confirmado e sem confirmacao, a recusa e a da confirmacao', () => {
  const saida = [];
  const erro = [];
  const codigo = executar(
    ['--email', 'titular@evolvia-ci.local', '--identidade', IDENT,
      '--nota', 'Chamado CH-7.', '--correlacao', 'ch-7', '--confirmar-host', 'homologacao-db'],
    AMBIENTE, (t) => saida.push(t), (t) => erro.push(t),
  );
  assert.equal(codigo, 1);
  assert.equal(saida.length, 0);
  assert.equal(erro[0], MOTIVOS.confirmacao_ausente);
});

// ------------------- achados da revisao independente da #744 (26/11) -------------------

test('--confirmar-revogacao=false NAO autoriza, e a recusa tem motivo proprio', () => {
  // O achado: o parser separava `chave=valor` e este case descartava o valor,
  // marcando a confirmacao como verdadeira. Com os demais campos validos, quem
  // escreveu `=false` recebia o SQL de revogacao. A flag passa a ser recusada
  // quando vem com valor, em vez de reinterpretada.
  const a = lerArgumentos(['--confirmar-revogacao=false']);
  assert.equal(a.confirmouRevogacao, false, 'nao pode virar true');
  assert.equal(a.confirmacaoComValor, true);
  assert.equal(decidirEntrada(base({ confirmouRevogacao: false, confirmacaoComValor: true }), AMBIENTE).motivo,
    MOTIVOS.confirmacao_com_valor);
});

test('--confirmar-revogacao=true tambem e recusado: nao se reinterpreta a flag', () => {
  // Deliberado. Aceitar `=true` obrigaria a decidir o que fazer com `=1`,
  // `=sim`, `=FALSE` — e o unico erro que importa aqui e autorizar sem querer.
  for (const forma of ['--confirmar-revogacao=true', '--confirmar-revogacao=1', '--confirmar-revogacao=']) {
    const a = lerArgumentos([forma]);
    assert.equal(a.confirmouRevogacao, false, forma);
    assert.equal(a.confirmacaoComValor, true, forma);
  }
});

test('a flag sozinha continua autorizando', () => {
  const a = lerArgumentos(['--confirmar-revogacao']);
  assert.equal(a.confirmouRevogacao, true);
  assert.equal(a.confirmacaoComValor, false);
  assert.equal(decidirEntrada(base(), AMBIENTE).autorizado, true);
});

test('com tudo valido e --confirmar-revogacao=false, nenhum SQL e impresso', () => {
  // O teste que prende a consequencia do achado, nao so a leitura do argumento:
  // antes, esta execucao imprimia o bloco de revogacao.
  const saida = [];
  const erro = [];
  const codigo = executar(
    ['--email', 'titular@evolvia-ci.local', '--identidade', IDENT,
      '--nota', 'Chamado CH-7.', '--correlacao', 'ch-7',
      '--confirmar-host', 'homologacao-db', '--confirmar-revogacao=false'],
    AMBIENTE, (t) => saida.push(t), (t) => erro.push(t),
  );
  assert.equal(codigo, 1);
  assert.equal(saida.length, 0, 'imprimiu SQL com a confirmacao negada');
  assert.equal(erro[0], MOTIVOS.confirmacao_com_valor);
});

test('a ordem das recusas nao muda: producao antes da confirmacao malformada', () => {
  // Um comando com `=false` apontado para producao tem de ser recusado POR SER
  // producao. Senao o operador corrige a flag e dispara no banco errado.
  const producao = { ...AMBIENTE, DATABASE_URL: 'postgresql://evolvia:x@db-prod:5432/evolvia', EVOLVIA_AMBIENTE: 'producao' };
  const r = decidirEntrada(base({ confirmouRevogacao: false, confirmacaoComValor: true }), producao);
  assert.equal(r.autorizado, false);
  assert.equal(r.motivo, MOTIVOS.producao);
});

test('idEstiloCuid sorteia com crypto por padrao, e segue injetavel', () => {
  // `randomInt` do node:crypto, como a politica irma. O que da para prender aqui
  // sem medir entropia: o indice fica no intervalo, o alfabeto e respeitado, e a
  // injecao continua valendo — e dela que os testes de SQL estavel dependem.
  const limites = new Set();
  idEstiloCuid((limite) => { limites.add(limite); return 0; });
  assert.deepEqual([...limites], [36], 'o sorteio recebe o tamanho do alfabeto');
  assert.equal(idEstiloCuid(() => 0), 'c' + 'a'.repeat(24));
  assert.equal(idEstiloCuid(() => 35), 'c' + '9'.repeat(24));
  const muitos = new Set(Array.from({ length: 200 }, () => idEstiloCuid()));
  assert.equal(muitos.size, 200, 'colidiu em 200 sorteios');
  for (const id of muitos) assert.match(id, /^c[a-z0-9]{24}$/u);
});
