import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIMITE_DA_NOTA, MOTIVOS, decidirEntrada, hostDoBanco, literal, montarSql,
} from './provisionar-proprietario-master.policy.mjs';

const URL_OK = 'postgresql://evolvia:senha@db.homologacao.interno:5432/evolvia?schema=public';
const HOST_OK = 'db.homologacao.interno';

const base = (over = {}) => ({
  nodeEnv: 'development',
  databaseUrl: URL_OK,
  hostConfirmado: HOST_OK,
  email: 'rosberg@exemplo.com',
  nota: 'Autorizado pelo proprietário do CNPJ em 18/11/2026.',
  ...over,
});

test('o caminho autorizado é exatamente um, e normaliza o que devolve', () => {
  const d = decidirEntrada(base({ email: '  ROSBERG@Exemplo.COM  ', nota: '  nota com espaços  ' }));
  assert.equal(d.permitido, true);
  assert.equal(d.email, 'rosberg@exemplo.com', 'a consulta usa lower(email)');
  assert.equal(d.nota, 'nota com espaços');
  assert.equal(d.host, HOST_OK);
  assert.equal(d.motivo, null);
});

test('produção é recusada antes de qualquer outra coisa', () => {
  for (const env of ['production', 'PRODUCTION', ' production ']) {
    const d = decidirEntrada(base({ nodeEnv: env, email: '', nota: '', databaseUrl: 'x' }));
    assert.equal(d.motivo, 'ambiente_de_producao', 'a recusa de produção vem primeiro');
  }
});

test('host confirmado tem de bater exatamente com o host do DATABASE_URL', () => {
  for (const c of ['', 'outro.host', 'db.homologacao.intern', 'DB.HOMOLOGACAO.INTERNO', undefined, null, 42]) {
    assert.equal(decidirEntrada(base({ hostConfirmado: c })).motivo, 'host_nao_confirmado', `aceitou ${String(c)}`);
  }
  assert.equal(decidirEntrada(base()).permitido, true);
});

test('DATABASE_URL ilegível é recusado, não assumido', () => {
  for (const url of ['', 'nao-e-url', undefined, null, 'postgresql://', 42]) {
    assert.equal(decidirEntrada(base({ databaseUrl: url })).motivo, 'host_ausente', `url ${String(url)}`);
  }
});

test('hostDoBanco lê o host e nunca lança', () => {
  assert.equal(hostDoBanco(URL_OK), HOST_OK);
  assert.equal(hostDoBanco('postgresql://u:p@localhost:5432/db'), 'localhost');
  for (const ruim of ['', 'x', undefined, null, {}, 42, 'postgresql://']) assert.equal(hostDoBanco(ruim), null);
});

test('e-mail é obrigatório e o conjunto aceito é conservador', () => {
  const ruins = ['', '   ', undefined, null, 42, 'sem-arroba', 'a@b', 'a b@c.com',
    'a\n@c.com', 'a@c\u0000.com', 'x@b.com; DROP TABLE', '<a@b.com>'];
  for (const email of ruins) {
    assert.equal(decidirEntrada(base({ email })).motivo, 'email_invalido', `aceitou ${JSON.stringify(email)}`);
  }
  assert.equal(decidirEntrada(base({ email: 'a.b+c@sub.dominio.com.br' })).permitido, true);
  // Espaço em branco nas BORDAS é aparado, e aparar é o certo: o operador cola
  // o endereço e a quebra do terminal vem junto. Controle no MEIO é recusado,
  // porque ali não há como ser acidente benigno.
  assert.equal(decidirEntrada(base({ email: 'a@c.com\n' })).email, 'a@c.com');
  assert.equal(decidirEntrada(base({ email: ' a@c.com\t' })).permitido, true);
});

test('nota é obrigatória, limitada à coluna e sem caractere de controle', () => {
  for (const nota of ['', '   ', undefined, null, 42]) {
    assert.equal(decidirEntrada(base({ nota })).motivo, 'nota_obrigatoria');
  }
  assert.equal(decidirEntrada(base({ nota: 'a'.repeat(LIMITE_DA_NOTA) })).permitido, true);
  assert.equal(decidirEntrada(base({ nota: 'a'.repeat(LIMITE_DA_NOTA + 1) })).motivo, 'nota_muito_longa');
  for (const nota of ['linha1\nlinha2', 'com\ttab', 'com\u0000nulo', 'com​zero']) {
    assert.equal(decidirEntrada(base({ nota })).motivo, 'nota_com_controle', `aceitou ${JSON.stringify(nota)}`);
  }
});

test('entrada ausente nega, em vez de estourar', () => {
  for (const entrada of [undefined, null, {}]) {
    const d = decidirEntrada(entrada);
    assert.equal(d.permitido, false);
    assert.equal(typeof d.mensagem, 'string');
  }
});

test('toda mensagem de recusa existe e não vaza credencial', () => {
  for (const [motivo, mensagem] of Object.entries(MOTIVOS)) {
    assert.ok(mensagem.length > 0, `motivo ${motivo} sem mensagem`);
    assert.doesNotMatch(mensagem, /senha|password|postgresql:/iu, `mensagem de ${motivo} vaza credencial`);
  }
});

// ---------- SQL gerado ----------

const sqlBase = (over = {}) => montarSql({
  email: 'rosberg@exemplo.com',
  nota: 'Autorizado pelo proprietário do CNPJ.',
  correlacao: 'bootstrap-20261118',
  ...over,
});

test('o SQL é uma transação só', () => {
  const sql = sqlBase();
  assert.equal((sql.match(/^BEGIN;$/gmu) ?? []).length, 1);
  assert.equal((sql.match(/^COMMIT;$/gmu) ?? []).length, 1);
  assert.ok(sql.indexOf('BEGIN;') < sql.indexOf('COMMIT;'));
  assert.doesNotMatch(sql, /ROLLBACK/u, 'ON_ERROR_STOP já cuida; rollback explícito mascararia erro');
});

test('as três condições de dados são verificadas dentro da transação', () => {
  const sql = sqlBase();
  for (const guarda of [/Nao existe usuario com esse e-mail/u, /nao tem e-mail verificado/u, /Ja existe proprietario Master ativo/u]) {
    assert.match(sql, guarda);
  }
  assert.equal((sql.match(/RAISE EXCEPTION/gu) ?? []).length, 3,
    'cada condição precisa de exceção própria, não de INSERT que simplesmente não casa');
});

test('reexecução informa e não altera: a idempotência está no próprio SQL', () => {
  const sql = sqlBase();
  assert.match(sql, /ja possui identidade Master/u);
  assert.match(sql, /RETURN;/u);
});

test('usa os nomes de coluna reais dos modelos aplicados', () => {
  const sql = sqlBase();
  for (const coluna of ['"userId"', '"provisionedByNote"', '"emailVerifiedAt"', '"actorUserId"',
    '"scopeKind"', '"targetUserId"', '"reason"', '"result"', '"correlationId"']) {
    assert.ok(sql.includes(coluna), `coluna ausente: ${coluna}`);
  }
  for (const inventada of ['"targetKind"', '"detail"']) {
    assert.ok(!sql.includes(inventada), `coluna inexistente: ${inventada}`);
  }
  assert.ok('platform.master_identity_provisioned'.length <= 60, 'action excede VarChar(60)');
});

test('apóstrofo é escapado, não interpolado cru', () => {
  const sql = montarSql({ email: 'a@b.com', nota: 'O' + "'" + 'Brien autorizou', correlacao: 'c-1' });
  assert.ok(sql.includes("'O''Brien autorizou'"), 'apóstrofe tem de ser duplicada');
  assert.equal(literal('a' + "'" + 'b'), "'a''b'");
  assert.equal(literal("'"), "''''");
});

test('a trilha não atribui o ato ao próprio novo proprietário', () => {
  const sql = sqlBase();
  assert.ok(sql.includes("'platform-bootstrap'"),
    'registrar o alvo como ator afirmaria autoconcessão pela aplicação, que não ocorreu');
  assert.match(sql, /INSERT INTO "PlatformAuditLog"/u);
  assert.ok(sql.indexOf('INSERT INTO "PlatformAuditLog"') < sql.indexOf('COMMIT;'),
    'a trilha tem de ser gravada na mesma transação');
});

test('o pedido explícito remove a guarda de proprietário, e só ela', () => {
  const sem = sqlBase({ permitirSegundoProprietario: true });
  assert.match(sqlBase(), /Ja existe proprietario Master ativo/u);
  assert.doesNotMatch(sem, /Ja existe proprietario Master ativo/u);
  assert.match(sem, /Segundo proprietario autorizado explicitamente/u);
  assert.equal((sem.match(/RAISE EXCEPTION/gu) ?? []).length, 2, 'as outras duas continuam');
});

test('o SQL não contém senha, hash nem desafio', () => {
  assert.doesNotMatch(sqlBase(), /passwordHash|tokenHash|pendingChallenge|publicKey/u);
});
