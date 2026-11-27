/**
 * Contrato do script de inscricao de autenticador da Area Master (#690).
 *
 * Cada caso aqui nasceu de um requisito escrito da autorizacao executiva de
 * 25/11, e varios nasceram de um mutante que sobreviveu. Onde isso aconteceu,
 * o comentario diz qual era o mutante — senao a proxima pessoa remove o caso
 * por achar que ele e redundante.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import {
  ATOR_DA_INSCRICAO,
  FINALIDADES, JANELA_MAXIMA_MINUTOS, JANELA_PADRAO_MINUTOS, MINIMO_DO_SEGREDO, MOTIVOS,
  decidirEntrada, digestDaInscricao, hostDoBanco, lerArgumentos, montarSql,
} from './recuperar-acesso-master.policy.mjs';
import { ehAtorSistemico } from './provisionar-proprietario-master.policy.mjs';

const SEGREDO = randomBytes(32).toString('base64url');
const IDENT = 'cmasteridentidade000000001';
const AMBIENTE = { DATABASE_URL: 'postgresql://evolvia:x@homologacao-db:5432/evolvia', NODE_ENV: 'test', EVOLVIA_AMBIENTE: 'homologacao' };

const base = (extra = {}) => ({
  finalidade: 'BOOTSTRAP', email: 'titular@evolvia-ci.local', identidade: IDENT,
  nota: 'Autorizado pelo fundador em 25/11, chamado CH-1.', correlacao: 'ch-1',
  minutos: JANELA_PADRAO_MINUTOS, confirmarHost: 'homologacao-db',
  confirmouBootstrap: true, confirmouRecuperacao: false, transferenciaPedida: false,
  ...extra,
});

// --------------------------------------------------------------- o segredo

test('o digest liga o segredo a finalidade E a identidade', () => {
  const b = digestDaInscricao(SEGREDO, 'BOOTSTRAP', IDENT);
  const r = digestDaInscricao(SEGREDO, 'RECOVERY', IDENT);
  const outra = digestDaInscricao(SEGREDO, 'BOOTSTRAP', 'coutraidentidade00000000x');
  assert.notEqual(b, r, 'janela de bootstrap serviria para recuperacao, que REVOGA credenciais');
  assert.notEqual(b, outra, 'segredo vazado valeria em outra identidade Master');
  assert.equal(b, createHash('sha256').update(`${SEGREDO}:BOOTSTRAP:${IDENT}`).digest('hex'));
  assert.equal(b.length, 64, 'a coluna secretDigest foi dimensionada para sha256 em hex');
});

test('o segredo curto e recusado, e o limite e o de 32 bytes', () => {
  assert.equal(MINIMO_DO_SEGREDO, 43);
  assert.throws(() => digestDaInscricao('a'.repeat(42), 'BOOTSTRAP', IDENT), /segredo precisa/u);
  assert.doesNotThrow(() => digestDaInscricao('a'.repeat(43), 'BOOTSTRAP', IDENT));
});

// ------------------------------------------------- a ordem das recusas

test('producao e recusada ANTES de qualquer validacao de conteudo', () => {
  // Mutante que sobreviveu a primeira versao: validar conteudo antes do
  // ambiente. O operador corrigia o formato e disparava no banco de producao.
  const pedidoTorto = base({ finalidade: 'lixo', email: 'nao-e-email', nota: '', correlacao: '!!' });
  for (const env of [
    { DATABASE_URL: 'postgresql://u:p@prod-db-01:5432/evolvia' },
    { DATABASE_URL: 'postgresql://u:p@db-producao:5432/evolvia' },
    { DATABASE_URL: 'postgresql://u:p@x:5432/evolvia', NODE_ENV: 'production' },
    { DATABASE_URL: 'postgresql://u:p@x:5432/evolvia', EVOLVIA_AMBIENTE: 'Producao' },
  ]) {
    const d = decidirEntrada({ ...pedidoTorto, confirmarHost: hostDoBanco(env.DATABASE_URL) }, env);
    assert.equal(d.autorizado, false);
    assert.equal(d.motivo, MOTIVOS.producao, `deveria recusar por PRODUCAO: ${JSON.stringify(env)}`);
  }
});

test('host nao confirmado e recusado, e prefixo nao basta', () => {
  assert.equal(decidirEntrada(base({ confirmarHost: null }), AMBIENTE).motivo, MOTIVOS.host_nao_confirmado);
  assert.equal(decidirEntrada(base({ confirmarHost: 'homologacao' }), AMBIENTE).motivo, MOTIVOS.host_nao_confirmado,
    'prefixo do host aceito permitiria confirmar o banco errado');
  assert.equal(decidirEntrada(base({ confirmarHost: 'HOMOLOGACAO-DB' }), AMBIENTE).motivo, MOTIVOS.host_nao_confirmado,
    'a confirmacao e exata; caixa diferente e host diferente para o operador');
});

test('sem DATABASE_URL, e com socket Unix, nao ha host a confirmar', () => {
  assert.equal(decidirEntrada(base(), {}).motivo, MOTIVOS.sem_banco);
  assert.equal(hostDoBanco('postgresql:///evolvia?host=/var/run/postgresql'), null,
    'socket Unix nao tem host: a guarda de host nao teria o que comparar');
});

test('a transferencia de titularidade e LIDA e recusada, e antes de qualquer sucesso', () => {
  const d = decidirEntrada(base({ transferenciaPedida: true }), AMBIENTE);
  assert.equal(d.autorizado, false);
  assert.equal(d.motivo, MOTIVOS.transferencia_de_titularidade);
  // E tambem no montarSql, para que nenhum chamador contorne a politica.
  assert.throws(() => montarSql({ ...base(), segredo: SEGREDO, transferirTitularidade: true }),
    /NAO transfere titularidade/u);
});

// ------------------------------------------------------- a confirmacao

test('cada finalidade exige a SUA confirmacao', () => {
  assert.equal(decidirEntrada(base({ confirmouBootstrap: false }), AMBIENTE).motivo, MOTIVOS.confirmacao_ausente);
  // Confirmar a outra nao vale, e a mensagem diz isso em vez de assumir.
  const cruzado = decidirEntrada(
    base({ finalidade: 'RECOVERY', confirmouBootstrap: true, confirmouRecuperacao: false }), AMBIENTE);
  assert.equal(cruzado.motivo, MOTIVOS.confirmacao_divergente,
    'um comando de bootstrap confirmado nao pode autorizar recuperacao, que REVOGA credenciais');
  assert.equal(
    decidirEntrada(base({ finalidade: 'RECOVERY', confirmouRecuperacao: true, confirmouBootstrap: false }), AMBIENTE).autorizado,
    true);
});

test('as validacoes de conteudo recusam uma a uma', () => {
  const casos = [
    [{ finalidade: 'OUTRA' }, MOTIVOS.finalidade_invalida],
    [{ email: 'sem-arroba' }, MOTIVOS.email_invalido],
    [{ email: `${'a'.repeat(250)}@x.com` }, MOTIVOS.email_invalido],
    [{ identidade: 'id com espaco' }, MOTIVOS.identidade_invalida],
    [{ nota: '   ' }, MOTIVOS.nota_invalida],
    [{ nota: 'x'.repeat(201) }, MOTIVOS.nota_invalida],
    [{ correlacao: 'tem espaco' }, MOTIVOS.correlacao_invalida],
    [{ correlacao: 'c'.repeat(65) }, MOTIVOS.correlacao_invalida],
    [{ minutos: 0 }, MOTIVOS.janela_invalida],
    [{ minutos: JANELA_MAXIMA_MINUTOS + 1 }, MOTIVOS.janela_invalida],
    [{ minutos: 1.5 }, MOTIVOS.janela_invalida],
  ];
  for (const [troca, esperado] of casos) {
    const d = decidirEntrada(base(troca), AMBIENTE);
    assert.equal(d.autorizado, false, `deveria recusar: ${JSON.stringify(troca)}`);
    assert.equal(d.motivo, esperado, `motivo errado para ${JSON.stringify(troca)}`);
  }
});

test('os limites das colunas sao respeitados nas bordas', () => {
  // nota tem VarChar(200) e correlationId VarChar(64) no schema lido.
  assert.equal(decidirEntrada(base({ nota: 'x'.repeat(200) }), AMBIENTE).autorizado, true);
  assert.equal(decidirEntrada(base({ correlacao: 'c'.repeat(64) }), AMBIENTE).autorizado, true);
  assert.equal(decidirEntrada(base({ minutos: JANELA_MAXIMA_MINUTOS }), AMBIENTE).autorizado, true);
});

// ------------------------------------------------------------- o SQL

test('o SQL NUNCA contem o segredo cru', () => {
  for (const finalidade of FINALIDADES) {
    const confirmacao = finalidade === 'BOOTSTRAP'
      ? { confirmouBootstrap: true } : { confirmouRecuperacao: true };
    const sql = montarSql({ ...base({ finalidade, ...confirmacao }), segredo: SEGREDO });
    assert.ok(!sql.includes(SEGREDO), `o segredo apareceu no SQL de ${finalidade}: vazaria em log de psql`);
    assert.ok(sql.includes(digestDaInscricao(SEGREDO, finalidade, IDENT)), 'o digest nao foi gravado');
  }
});

test('bootstrap NAO revoga nada; recuperacao revoga credencial e invalida sessao', () => {
  const boot = montarSql({ ...base(), segredo: SEGREDO });
  assert.ok(!boot.includes('DELETE FROM "PlatformWebAuthnCredential"'),
    'bootstrap apagando credencial destruiria a chave de quem ja tem uma');
  assert.ok(!boot.includes('"revokedAt" = now()'), 'bootstrap nao encerra sessao de ninguem');

  const rec = montarSql({
    ...base({ finalidade: 'RECOVERY', confirmouBootstrap: false, confirmouRecuperacao: true }),
    segredo: SEGREDO,
  });
  assert.ok(rec.includes('DELETE FROM "PlatformWebAuthnCredential" WHERE "identityId" = ident_id;'),
    'o autenticador perdido continuaria valendo');
  assert.ok(rec.includes('UPDATE "PlatformMasterSession"') && rec.includes('"revokedAt" = now()'),
    'uma sessao aberta sobreviveria a recuperacao');
  assert.ok(!rec.includes('DELETE FROM "PlatformMasterSession"'),
    'apagar a sessao em vez de revogar perderia a auditoria dela');
});

test('as duas guardas de credencial sao mutuamente exclusivas e estao presentes', () => {
  const boot = montarSql({ ...base(), segredo: SEGREDO });
  const rec = montarSql({
    ...base({ finalidade: 'RECOVERY', confirmouBootstrap: false, confirmouRecuperacao: true }),
    segredo: SEGREDO,
  });
  assert.ok(boot.includes('IF true AND credenciais > 0'), 'bootstrap sem a guarda de zero credenciais');
  assert.ok(boot.includes('IF false AND credenciais = 0'), 'a guarda de recuperacao vazou para o bootstrap');
  assert.ok(rec.includes('IF false AND credenciais > 0'), 'a guarda de bootstrap vazou para a recuperacao');
  assert.ok(rec.includes('IF true AND credenciais = 0'), 'recuperacao sem o que revogar seria bootstrap disfarcado');
});

test('a trilha e o ULTIMO INSERT, para que falha de auditoria desfaca tudo', () => {
  const rec = montarSql({
    ...base({ finalidade: 'RECOVERY', confirmouBootstrap: false, confirmouRecuperacao: true }),
    segredo: SEGREDO,
  });
  const janela = rec.indexOf('INSERT INTO "PlatformMasterEnrollmentWindow"');
  const trilha = rec.indexOf('INSERT INTO "PlatformAuditLog"');
  const remocao = rec.indexOf('DELETE FROM "PlatformWebAuthnCredential"');
  assert.ok(janela > 0 && trilha > 0 && remocao > 0, 'faltou uma das tres escritas');
  assert.ok(trilha > janela && trilha > remocao,
    'auditoria antes da mudanca permitiria mudanca sem auditoria se a mudanca falhasse');
});

test('o bloco guarda titularidade, identidade suspensa e repeticao', () => {
  const sql = montarSql({ ...base(), segredo: SEGREDO });
  assert.ok(sql.includes('nao transfere titularidade'), 'sem a guarda de identidade x e-mail');
  assert.ok(sql.includes("ident_status <> 'ACTIVE'"),
    'identidade suspensa receberia acesso de volta por via indireta');
  assert.ok(sql.includes('"consumedAt" IS NULL') && sql.includes('"expiresAt" > now()'),
    'sem a guarda de repeticao, duas execucoes deixariam dois segredos validos');
  assert.ok(sql.includes('"pendingChallenge" = NULL'),
    'um desafio pendente sobreviveria a revogacao');
  // Quatro RAISE EXCEPTION de dados + a de repeticao + a de credencial.
  const excecoes = sql.match(/RAISE EXCEPTION/gu) ?? [];
  assert.equal(excecoes.length, 7, `o bloco deveria ter 7 RAISE EXCEPTION, tem ${excecoes.length}`);
});

test('a janela usa os minutos pedidos, e nao um valor fixo', () => {
  for (const minutos of [1, 5, JANELA_MAXIMA_MINUTOS]) {
    const sql = montarSql({ ...base({ minutos }), segredo: SEGREDO });
    assert.ok(sql.includes(`interval '${minutos} minutes'`), `a janela ignorou --minutos ${minutos}`);
  }
});

test('aspa simples no texto nao quebra nem injeta', () => {
  const sql = montarSql({ ...base({ nota: "Chamado do fundador: 'CH-1'" }), segredo: SEGREDO });
  assert.ok(sql.includes("'Chamado do fundador: ''CH-1'''"), 'a aspa nao foi dobrada');
  assert.ok(!sql.includes("; DROP"), 'controle');
});

test('o segredo fora de base64url e recusado no montarSql', () => {
  assert.throws(() => montarSql({ ...base(), segredo: `${'a'.repeat(42)}+/` }), /base64url/u);
});

// ------------------------------------------------------ a linha de comando

test('a linha de comando le as duas formas e nao inventa confirmacao', () => {
  const lido = lerArgumentos([
    '--finalidade', 'recuperacao', '--email=titular@evolvia-ci.local',
    '--identidade', IDENT, '--nota=CH-1', '--correlacao=ch-1',
    '--minutos=5', '--confirmar-host=homologacao-db', '--confirmar-recuperacao',
  ]);
  assert.equal(lido.finalidade, 'RECUPERACAO');
  assert.equal(lido.email, 'titular@evolvia-ci.local');
  assert.equal(lido.minutos, 5);
  assert.equal(lido.confirmouRecuperacao, true);
  assert.equal(lido.confirmouBootstrap, false, 'confirmou a outra sem ninguem pedir');
  assert.equal(lido.transferenciaPedida, false);
});

test('a flag de transferencia e lida de ponta a ponta, para ser recusada', () => {
  // Mutante que sobreviveu: a CLI nao repassar a flag. O SQL continuava seguro,
  // mas o operador nao recebia recusa — e a recusa E o requisito.
  const lido = lerArgumentos(['--transferir-titularidade']);
  assert.equal(lido.transferenciaPedida, true, 'a CLI nao leu a flag: a politica nunca a recusaria');
});

test('--minutos tem o padrao, e o padrao e curto', () => {
  assert.equal(lerArgumentos([]).minutos, JANELA_PADRAO_MINUTOS);
  assert.ok(JANELA_PADRAO_MINUTOS <= 15, 'janela padrao longa e janela aberta');
});

test('recusa emissão sem ambiente de homologação explícito', () => {
  for (const ambiente of [undefined, 'dev', 'ci']) {
    assert.equal(decidirEntrada(base(), { ...AMBIENTE, EVOLVIA_AMBIENTE: ambiente }).autorizado, false);
  }
});

test('marcador de produção na senha não classifica o banco como produção', () => {
  const env = { ...AMBIENTE, DATABASE_URL: 'postgresql://teste:prod@homologacao-db/evolvia' };
  assert.equal(decidirEntrada(base(), env).autorizado, true);
  assert.equal(decidirEntrada(base(), { ...env, DATABASE_URL: env.DATABASE_URL + '-prod' }).motivo, MOTIVOS.producao);
});

// ------------------------------------------- janela unica por identidade (A2)
//
// Os quatro casos abaixo nasceram de um mutante que sobreviveu. Em 26/11,
// trocando no SQL gerado
//
//     IF janela_vence IS NOT NULL THEN   ->   IF false THEN
//
// as 22 asseracoes deste arquivo continuavam verdes. A guarda que impede dois
// segredos validos ao mesmo tempo nao tinha teste nenhum, nem aqui nem no
// PostgreSQL. O efeito concorrente esta em
// `apps/api/tests-postgres/platform-master-enrollment-abertura.postgres.test.mjs`;
// aqui prende-se o TEXTO, que e o que este modulo produz.

const GUARDA_DE_JANELA_UNICA = '  IF janela_vence IS NOT NULL THEN';

const sqlDasDuasFinalidades = () => ({
  boot: montarSql({ ...base(), segredo: SEGREDO }),
  rec: montarSql({
    ...base({ finalidade: 'RECOVERY', confirmouBootstrap: false, confirmouRecuperacao: true }),
    segredo: SEGREDO,
  }),
});

test('a guarda de janela unica existe e recusa com mensagem, nao em silencio', () => {
  for (const [qual, sql] of Object.entries(sqlDasDuasFinalidades())) {
    assert.ok(sql.includes(GUARDA_DE_JANELA_UNICA),
      `${qual}: sem a guarda, duas execucoes deixariam dois segredos validos`);
    // `RAISE EXCEPTION` e nao zero linhas afetadas: o operador le silencio como
    // sucesso, e aqui silencio significaria "abri uma segunda janela".
    assert.ok(/IF janela_vence IS NOT NULL THEN\n\s*RAISE EXCEPTION 'Ja existe autorizacao aberta/u.test(sql),
      `${qual}: a guarda nao levanta excecao`);
  }
});

test('a guarda e INDEPENDENTE da finalidade: bootstrap aberto bloqueia recuperacao', () => {
  // O SELECT da guarda nao pode filtrar por `purpose`. Se filtrasse, uma janela
  // de BOOTSTRAP aberta nao impediria abrir uma de RECOVERY, e RECOVERY APAGA
  // credenciais — dois segredos vivos com efeitos diferentes.
  const { boot, rec } = sqlDasDuasFinalidades();
  for (const [qual, sql] of Object.entries({ boot, rec })) {
    const guarda = sql.slice(sql.indexOf('SELECT w."expiresAt" INTO janela_vence'), sql.indexOf(GUARDA_DE_JANELA_UNICA));
    assert.ok(guarda.length > 0, `${qual}: nao achei o SELECT da guarda`);
    assert.ok(!guarda.includes('purpose'),
      `${qual}: a guarda filtra por finalidade e deixaria passar a outra`);
  }
});

test('a guarda olha so janela ABERTA, para nao travar o titular por historico', () => {
  // Se bastasse existir linha, uma tentativa abandonada travaria o titular ate
  // alguem apagar registro a mao — e o sentido da janela curta e poder repetir.
  const { boot } = sqlDasDuasFinalidades();
  const guarda = boot.slice(boot.indexOf('SELECT w."expiresAt" INTO janela_vence'), boot.indexOf(GUARDA_DE_JANELA_UNICA));
  for (const condicao of ['"consumedAt" IS NULL', '"revokedAt" IS NULL', '"expiresAt" > now()']) {
    assert.ok(guarda.includes(condicao), `a guarda ignora ${condicao} e travaria por historico`);
  }
});

test('a guarda vem ANTES do INSERT da janela', () => {
  // Conferir depois de inserir nao e conferir: a segunda janela ja existiria, e
  // so o rollback da excecao a desfaria — por acidente, nao por desenho.
  const { boot, rec } = sqlDasDuasFinalidades();
  for (const [qual, sql] of Object.entries({ boot, rec })) {
    const posicaoDaGuarda = sql.indexOf(GUARDA_DE_JANELA_UNICA);
    const posicaoDoInsert = sql.indexOf('  INSERT INTO "PlatformMasterEnrollmentWindow"');
    assert.ok(posicaoDaGuarda > 0 && posicaoDoInsert > 0, `${qual}: faltou guarda ou INSERT`);
    assert.ok(posicaoDaGuarda < posicaoDoInsert, `${qual}: a guarda esta depois do INSERT`);
  }
});

test('a revogacao da identidade vem DEPOIS da guarda, na recuperacao', () => {
  // Ordem com consequencia real: revogar antes de conferir a janela deixaria o
  // titular sem credencial E sem autorizacao nova se a guarda recusasse. O
  // rollback do bloco cobre isso hoje; a ordem o torna independente do rollback.
  const { rec } = sqlDasDuasFinalidades();
  assert.ok(rec.indexOf(GUARDA_DE_JANELA_UNICA) < rec.indexOf('DELETE FROM "PlatformWebAuthnCredential"'),
    'a revogacao acontece antes de saber se a janela pode abrir');
});

// ------------------------------------------------- ator da trilha (A1 adjunto)

test('a trilha registra ator SISTEMICO, reconhecido pelo predicado compartilhado', () => {
  // Defeito medido em 26/11: o default era `sistema-operacional`, que nao casa
  // o prefixo `sistema:`. `ehAtorSistemico` devolvia false, e o relatorio de
  // auditoria classificava a abertura de janela como acao de PESSOA — quando
  // nenhuma pessoa agiu pela aplicacao.
  assert.equal(ehAtorSistemico(ATOR_DA_INSCRICAO), true,
    'o ator desta operacao nao e reconhecido como sistemico');
  const { boot, rec } = sqlDasDuasFinalidades();
  for (const [qual, sql] of Object.entries({ boot, rec })) {
    assert.ok(sql.includes(`'${ATOR_DA_INSCRICAO}'`), `${qual}: o ator sistemico nao chegou ao SQL`);
    assert.ok(!sql.includes('sistema-operacional'), `${qual}: sobrou a literal antiga`);
  }
});

test('o ator da trilha nao pode ser o titular', () => {
  // Registrar o titular como ator afirmaria que ele se autoconcedeu a janela
  // pela aplicacao. Quem autorizou esta em `reason`, como na #690.
  const sql = montarSql({ ...base(), segredo: SEGREDO });
  const trilha = sql.slice(sql.indexOf('INSERT INTO "PlatformAuditLog"'));
  assert.ok(trilha.includes(`'${ATOR_DA_INSCRICAO}'`));
  assert.ok(!trilha.includes('alvo_id,\n     ' + `'${ATOR_DA_INSCRICAO}'`), 'ator e alvo trocados');
});
