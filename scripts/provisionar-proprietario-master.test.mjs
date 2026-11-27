import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';
import {
  ATOR_DO_BOOTSTRAP, FORMA_DO_CUID, LIMITE_DA_NOTA, MOTIVOS, PREFIXO_DE_ATOR_SISTEMICO,
  TAMANHO_DO_CUID, decidirEntrada, ehAtorSistemico, ehUrlDeSocketUnix, hostDoBanco,
  idEstiloCuid, literal, montarSql,
} from './provisionar-proprietario-master.policy.mjs';
import { chamadoDiretamente, executar, lerArgumentos } from './provisionar-proprietario-master.mjs';

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
  // O último caso usa U+200B (espaço de largura zero) escrito por código, e não
  // como caractere literal nem como escape: caractere invisível no fonte é
  // armadilha para quem revisa. E o comentario que estava aqui CONTINHA um
  // U+200B literal, invisivel no fonte: a propria armadilha que ele descreve.
  // Removido, e escrito por nome. Caractere invisivel em codigo-fonte nao deve
  // existir nem dentro de um comentario que adverte contra ele.
  for (const nota of ['linha1\nlinha2', 'com\ttab', 'com\u0000nulo', 'com' + String.fromCharCode(0x200b) + 'zero']) {
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

test('as quatro condições de dados são verificadas dentro da transação', () => {
  const sql = sqlBase();
  for (const guarda of [
    /Nao existe usuario com esse e-mail/u,
    /nao tem e-mail verificado/u,
    /ja possui identidade Master/u,
    /Ja existe proprietario Master ativo/u,
  ]) {
    assert.match(sql, guarda);
  }
  // Eram três; a quarta nasceu do reparo de segurança da #690. Identidade
  // existente que NÃO seja OWNER ativa passou a recusar em vez de devolver
  // sucesso — ver o teste da fidelidade do replay, abaixo.
  assert.equal((sql.match(/RAISE EXCEPTION/gu) ?? []).length, 4,
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
  assert.ok(sql.includes(literal(ATOR_DO_BOOTSTRAP)),
    'registrar o alvo como ator afirmaria autoconcessão pela aplicação, que não ocorreu');
  assert.match(sql, /INSERT INTO "PlatformAuditLog"/u);
  assert.ok(sql.indexOf('INSERT INTO "PlatformAuditLog"') < sql.indexOf('COMMIT;'),
    'a trilha tem de ser gravada na mesma transação');
});

test('o relatório distingue ação sistêmica de ação humana por predicado', () => {
  assert.equal(ehAtorSistemico(ATOR_DO_BOOTSTRAP), true);
  assert.ok(ATOR_DO_BOOTSTRAP.startsWith(PREFIXO_DE_ATOR_SISTEMICO));
  // Ids de pessoa são cuid: alfanuméricos, sem dois-pontos. Nenhum deles pode
  // ser lido como sistêmico, nem o contrário.
  for (const humano of ['ckv9q8r2p0000abcd1234efgh', 'c', 'usr_1', '', 'Sistema:x', 'sistema', ' sistema:x']) {
    assert.equal(ehAtorSistemico(humano), false, `leu "${humano}" como sistêmico`);
  }
  for (const naoTexto of [undefined, null, 42, {}, ['sistema:x']]) {
    assert.equal(ehAtorSistemico(naoTexto), false, `aceitou ${String(naoTexto)}`);
  }
  assert.equal(PREFIXO_DE_ATOR_SISTEMICO.includes(':'), true,
    'o separador é o que garante não colidir com cuid, que não tem dois-pontos');
  assert.equal(/^[a-z0-9]+$/u.test('ckv9q8r2p0000abcd1234efgh'), true,
    'se cuid passar a aceitar dois-pontos, este namespace deixa de ser seguro');
});

test('o namespace sistêmico sobrevive ao escape para SQL', () => {
  assert.equal(literal(ATOR_DO_BOOTSTRAP), `'${ATOR_DO_BOOTSTRAP}'`,
    'dois-pontos não precisa de escape, e o literal não pode alterar o valor');
  assert.ok(sqlBase().includes(`'${ATOR_DO_BOOTSTRAP}'`));
});

test('não existe mais caminho para um segundo proprietário por script', () => {
  // ESTE TESTE SUBSTITUI UM ERRO MEU, e o erro merece ficar escrito.
  //
  // O teste que estava aqui se chamava "o pedido explícito remove a guarda de
  // proprietário, e só ela" e AFIRMAVA a vulnerabilidade como comportamento
  // desejado: exigia que `permitirSegundoProprietario: true` apagasse a guarda
  // e deixasse apenas duas exceções. Ou seja, a suíte guardava o buraco em vez
  // de guardar a proteção — e passava, 26 de 26.
  //
  // Medido em PostgreSQL 16.15 com o SQL que aquela flag gerava: dois OWNER
  // ATIVOS, que é exatamente o que este script existe para impedir. Nenhuma
  // guarda de dados restante impedia o segundo, porque a única que olhava
  // proprietário era a que a flag apagava.
  //
  // A guarda agora é incondicional, e a flag é recusada em TRÊS camadas, para
  // que nenhum caminho sobreviva: a leitura de argumentos, a política e o
  // gerador de SQL.
  assert.match(sqlBase(), /Ja existe proprietario Master ativo/u);
  assert.ok(!sqlBase().includes('Segundo proprietario autorizado explicitamente'),
    'o texto do atalho não pode mais existir em SQL nenhum');

  // Camada 1: a opção continua sendo LIDA, e só para poder ser recusada.
  // Ignorá-la em silêncio deixaria um runbook antigo obtendo um SQL diferente
  // do que o operador pensa estar pedindo.
  assert.equal(lerArgumentos(['--permitir-segundo-proprietario']).segundoProprietarioPedido, true);
  assert.equal(lerArgumentos([]).segundoProprietarioPedido, false);

  // Camada 2: a política recusa, com motivo próprio e mensagem que explica.
  const d = decidirEntrada(base({ segundoProprietarioPedido: true }));
  assert.equal(d.permitido, false);
  assert.equal(d.motivo, 'segundo_proprietario_por_script');
  assert.match(d.mensagem, /REMOVIDO/u);
  // E não vira exceção de conteúdo: o pedido é recusado mesmo com tudo válido.
  assert.equal(decidirEntrada(base()).permitido, true, 'a mesma entrada sem a flag continua passando');

  // Camada 3: quem chama o módulo por código também não consegue.
  assert.throws(
    () => sqlBase({ permitirSegundoProprietario: true }),
    /REMOVIDO/u,
    'passar a chave antiga tem de lançar, não ser ignorada em silêncio',
  );
});

test('a fidelidade do replay: idempotente só para a MESMA identidade OWNER ativa', () => {
  // Segundo reparo de segurança da #690. O SQL lia apenas o `id` de qualquer
  // identidade do alvo e dava RETURN — então um DELEGADO, ou um OWNER
  // suspenso, faziam o script sair com código 0 dizendo "nada a fazer", sem
  // criar proprietário e sem gravar trilha. Medido em PostgreSQL 16.15 nos
  // três casos: falso sucesso, zero proprietários, zero trilha.
  //
  // Falso sucesso é pior que erro: o operador lê 0 e conclui que a área tem
  // titular. Não tem, e ninguém é avisado.
  const sql = sqlBase();
  // Lê papel e situação, e não só o id.
  assert.match(sql, /SELECT id, role::text, status::text/u);
  assert.ok(sql.includes("papel_existente = 'OWNER' AND situacao_existente = 'ACTIVE'"),
    'a idempotência tem de ser condicionada à identidade OWNER ATIVA');
  // O caminho de sucesso silencioso existe SÓ dentro dessa condição.
  assert.ok(sql.indexOf("papel_existente = 'OWNER'") < sql.indexOf('RETURN;'),
    'o RETURN tem de estar dentro da condição, senão qualquer identidade volta a dar sucesso');
  // Qualquer outra situação recusa, e a mensagem diz o que encontrou.
  assert.match(sql, /RAISE EXCEPTION 'Este usuario ja possui identidade Master % \/ %/u);
  assert.ok(sql.includes('papel_existente, situacao_existente, ja_existe'),
    'a recusa tem de dizer papel e situação reais, para o operador saber o que fazer');
  // E diz explicitamente o que este script NÃO faz, porque promover e
  // reativar são atos do proprietário, com autoria registrada.
  assert.match(sql, /nao promove papel, nao reativa identidade suspensa/u);
  assert.equal((sql.match(/RETURN;/gu) ?? []).length, 1, 'um único caminho de saída silenciosa');
});

test('o SQL não contém senha, hash nem desafio', () => {
  assert.doesNotMatch(sqlBase(), /passwordHash|tokenHash|pendingChallenge|publicKey/u);
});

// ---------- Achados da revisão independente na #690 ----------
// Cada teste abaixo nasceu de um apontamento, e cada um falha contra o código
// anterior ao reparo. A mutação que mata cada um está registrada na PR.

test('o id tem a forma que a coluna exige: cuid, não UUID', () => {
  // `PlatformMasterIdentity.id` e `PlatformAuditLog.id` são @default(cuid()),
  // e em Prisma cuid() é gerado no cliente — a coluna não tem DEFAULT no
  // banco, então o INSERT precisa fornecer o id. Fornecer UUID punha na coluna
  // um valor com hífen, com 36 caracteres e sem o `c` inicial.
  for (let i = 0; i < 200; i += 1) {
    const id = idEstiloCuid();
    assert.match(id, FORMA_DO_CUID, `fora da forma de cuid: ${id}`);
    assert.equal(id.length, TAMANHO_DO_CUID);
    assert.ok(!id.includes('-'), 'cuid não tem hífen; UUID tem');
  }
  // O alfabeto tem de ser exercido de verdade, senão a "forma" passaria com
  // um id constante.
  const vistos = new Set();
  for (let i = 0; i < 300; i += 1) vistos.add(idEstiloCuid());
  assert.ok(vistos.size > 290, `ids repetem demais: ${vistos.size} distintos em 300`);
});

test('o SQL carrega o id gerado, e não delega ao gen_random_uuid do banco', () => {
  const sql = sqlBase({ identidadeId: 'c' + 'a'.repeat(24), auditoriaId: 'c' + 'b'.repeat(24) });
  assert.ok(!sql.includes('gen_random_uuid'),
    'gen_random_uuid devolve UUID, que não é a forma da coluna');
  assert.ok(sql.includes(`'c${'a'.repeat(24)}'`), 'o id da identidade tem de chegar ao INSERT');
  assert.ok(sql.includes(`'c${'b'.repeat(24)}'`), 'o id da trilha tem de chegar ao INSERT');
});

test('identidade e trilha recebem ids distintos', () => {
  // Reaproveitar um id entre as duas tabelas não quebra chave, porque são
  // tabelas diferentes, mas confunde quem correlaciona registro com trilha.
  const sql = sqlBase();
  const ids = [...sql.matchAll(/'(c[a-z0-9]{24})'/gu)].map((m) => m[1]);
  assert.equal(ids.length, 2, `esperava dois ids no SQL, achei ${ids.length}`);
  assert.notEqual(ids[0], ids[1]);
});

test('URL de socket Unix recebe motivo próprio, e não "não deu para ler"', () => {
  // O host vem vazio e hostDoBanco devolve null — o mesmo null de uma URL
  // ilegível, que é problema diferente. Mandar o operador conferir um
  // DATABASE_URL correto é o pior conselho possível aqui.
  for (const url of ['postgresql:///evolvia', 'postgres:///evolvia',
    'postgresql:///evolvia?host=/var/run/postgresql', 'postgresql://?host=/tmp']) {
    assert.equal(decidirEntrada(base({ databaseUrl: url })).motivo, 'host_de_socket_unix', `url ${url}`);
    assert.equal(ehUrlDeSocketUnix(url), true, `url ${url}`);
  }
  // URL incompleta não é socket: não nomeia banco nenhum.
  assert.equal(ehUrlDeSocketUnix('postgresql://'), false);
  assert.equal(decidirEntrada(base({ databaseUrl: 'postgresql://' })).motivo, 'host_ausente');
  // Nem esquema alheio, nem lixo, nem URL com host.
  for (const url of ['http:///x', 'mysql:///x', 'nao-e-url', '', undefined, null, 42, URL_OK]) {
    assert.equal(ehUrlDeSocketUnix(url), false, `url ${String(url)}`);
  }
  // A recusa permanece recusa: socket não tem host para confirmar, e
  // --confirmar-host é a única guarda contra o banco errado.
  assert.equal(decidirEntrada(base({ databaseUrl: 'postgresql:///evolvia' })).permitido, false);
});

test('a trava serializa o nascimento, porque o esquema não serializa', () => {
  // "PlatformMasterIdentity" tem @@index([role, status]), NÃO @@unique. Sob
  // READ COMMITTED, duas transações concorrentes para dois usuários DIFERENTES
  // passam as duas pelo IF EXISTS e inserem as duas: dois OWNER ativos.
  const sql = sqlBase();
  assert.match(sql, /PERFORM pg_advisory_xact_lock\(665, 1\);/u);
  // Ancorado no ENUNCIADO, não na frase: "IF EXISTS" aparece no comentário
  // acima da trava, e casar com a prosa faria o teste medir a si mesmo.
  assert.ok(sql.indexOf('pg_advisory_xact_lock') < sql.indexOf('SELECT id INTO alvo_id'),
    'travar depois de ler o estado não serializa nada');
  assert.ok(sql.indexOf('pg_advisory_xact_lock')
    < sql.indexOf('IF EXISTS (SELECT 1 FROM "PlatformMasterIdentity"'),
    'a guarda de proprietário só é confiável se a trava vier antes dela');
  assert.ok(sql.indexOf('BEGIN;') < sql.indexOf('pg_advisory_xact_lock'),
    'a trava tem de estar dentro da transação, senão é liberada antes do INSERT');
  assert.ok(sql.indexOf('pg_advisory_xact_lock') < sql.indexOf('INSERT INTO "PlatformMasterIdentity"'));
  // A asserção que havia aqui exercia o modo de segundo proprietário, que
  // deixou de existir no reparo da #690. A trava continua sendo medida de
  // verdade, contra banco, em
  // `apps/api/tests-postgres/platform-owner-provisioning.postgres.test.mjs`:
  // com trava nasce um proprietário, sem trava nascem dois.
  assert.ok(sql.indexOf('pg_advisory_xact_lock') < sql.indexOf('SELECT id, role::text'),
    'a trava tem de vir antes da leitura da identidade existente');
});

test('a linha de comando aceita as duas formas e não confia em valor ausente', () => {
  const a = lerArgumentos(['--email', 'a@b.com', '--nota', 'x y', '--confirmar-host', 'h']);
  assert.deepEqual(a, { email: 'a@b.com', nota: 'x y', hostConfirmado: 'h', segundoProprietarioPedido: false });
  const b = lerArgumentos(['--email=a@b.com', '--nota=x y', '--confirmar-host=h']);
  assert.deepEqual(b, a);
  // O campo mudou de nome no reparo da #690, e o nome passou a dizer a
  // verdade: é um PEDIDO lido para ser recusado, não uma permissão concedida.
  const c = lerArgumentos(['--email', 'a@b.com', '--permitir-segundo-proprietario']);
  assert.equal(c.segundoProprietarioPedido, true);
  assert.equal(lerArgumentos([]).segundoProprietarioPedido, false);
  // Opção sem valor devolve o BOOLEANO true no parser; booleano não pode
  // atravessar para onde o resto do módulo espera texto.
  for (const campo of ['email', 'nota', 'hostConfirmado']) {
    const r = lerArgumentos([`--${campo === 'hostConfirmado' ? 'confirmar-host' : campo}`]);
    assert.equal(r[campo], undefined, `${campo} virou ${JSON.stringify(r[campo])}`);
  }
  // Argumento desconhecido não derruba o processo: quem recusa é a política.
  const d = lerArgumentos(['--desconhecido', 'v', '--email', 'a@b.com']);
  assert.equal(d.email, 'a@b.com');
  assert.equal(lerArgumentos(['--email']).email, undefined);
});

test('a linha de comando recusa a flag antiga de ponta a ponta', () => {
  // ESTE CASO NASCEU DE UM MUTANTE QUE SOBREVIVEU à minha primeira versão da
  // suíte: fazer a CLI não repassar `segundoProprietarioPedido` à política.
  //
  // O resultado do mutante continuava SEGURO — o SQL saía com a guarda
  // incondicional, então nenhum segundo proprietário nasceria. Mas o operador
  // não recebia recusa nenhuma, e era exatamente esse o argumento do reparo:
  // um runbook antigo tem de falhar ALTO, e não obter em silêncio um SQL
  // diferente do que pensa estar pedindo.
  //
  // Nenhuma das camadas anteriores pegava isso, porque todas testavam as
  // funções isoladas. Faltava exercer a costura.
  const env = { NODE_ENV: 'development', DATABASE_URL: URL_OK };
  const comuns = ['--email', 'rosberg@exemplo.com', '--nota', 'Autorizado.', '--confirmar-host', HOST_OK];

  let saiu = '';
  let errou = '';
  const codigo = executar([...comuns, '--permitir-segundo-proprietario'],
    env, (t) => { saiu += t; }, (t) => { errou += t; });
  assert.equal(codigo, 1, 'a flag antiga tem de encerrar com código de erro');
  assert.equal(saiu, '', 'nenhum SQL pode ser emitido quando o pedido é recusado');
  assert.match(errou, /REMOVIDO/u, 'a recusa tem de explicar, não só falhar');

  // O mesmo comando SEM a flag continua funcionando — senão este teste provaria
  // apenas que eu quebrei a linha de comando.
  saiu = '';
  errou = '';
  const ok = executar(comuns, env, (t) => { saiu += t; }, (t) => { errou += t; });
  assert.equal(ok, 0);
  assert.match(saiu, /Ja existe proprietario Master ativo/u, 'o SQL sai com a guarda');
  assert.match(errou, /Alvo conferido/u);
});

test('a decisão de "fui executado diretamente" não depende de montar URL à mão', () => {
  const url = new URL('./provisionar-proprietario-master.mjs', import.meta.url).href;
  const caminho = fileURLToPath(url);
  assert.equal(chamadoDiretamente(url, caminho), true);
  // Caminho relativo é o caso em que comparar com `file://${argv[1]}` falha
  // mesmo no Linux: argv[1] não vem absoluto.
  const relativo = relative(process.cwd(), caminho);
  assert.notEqual(relativo, caminho, 'o teste precisa de um caminho de fato relativo');
  assert.equal(chamadoDiretamente(url, relativo), true);
  // Outro arquivo não é este.
  assert.equal(chamadoDiretamente(url, `${caminho}.outro`), false);
  // Entrada inválida nega, em vez de estourar.
  for (const ruim of [undefined, null, '', 42, {}]) {
    assert.equal(chamadoDiretamente(url, ruim), false, `aceitou ${String(ruim)}`);
  }
  assert.equal(chamadoDiretamente('nao-e-url', caminho), false);
});
