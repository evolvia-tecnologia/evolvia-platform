import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(AQUI, 'auditar-pr.mjs');

/**
 * Servidor que se passa pela API do GitHub E pela da Anthropic.
 *
 * Por que isto existe: os testes de auditar-pr.test.mjs cobrem as DECISOES,
 * sem rede. Mas o caminho de rede -- retentativa, tempo limite, conferencia de
 * SHA, idempotencia, recusa de publicacao -- so era exercitado contra os
 * servidores de verdade, com chave. Ou seja: nao era exercitado.
 *
 * `registro` guarda tudo o que o script enviou, para o teste poder afirmar o
 * que SAIU do processo -- em especial que segredo do diff nao chegou ao prompt.
 */
function servidorFalso(cenario) {
  const registro = { prompts: [], comentarios: [], chamadas: [] };
  let tentativasDeMensagem = 0;
  let tentativasDePost = 0;
  let leiturasDoPr = 0;

  const servidor = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => { corpo += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://localhost');
      registro.chamadas.push(`${req.method} ${url.pathname}`);
      const json = (status, dados) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(dados));
      };

      // --- GitHub ---
      if (url.pathname.match(/^\/repos\/[^/]+\/[^/]+\/pulls\/\d+$/u)) {
        leiturasDoPr += 1;
        // A PRIMEIRA leitura (conferirSha) passa; as seguintes falham. E a
        // janela real: a auditoria comeca verificada e a reconferencia morre.
        if (cenario.falhaNaReleitura && leiturasDoPr > 1) {
          return json(500, { message: 'upstream indisponivel' });
        }
        // `headShaDepois` simula alguem empurrando commit no meio da auditoria:
        // a primeira leitura devolve a SHA pedida, as seguintes devolvem outra.
        const sha = leiturasDoPr === 1 || !cenario.headShaDepois
          ? cenario.headSha
          : cenario.headShaDepois;
        return json(200, { title: cenario.titulo ?? 'PR de teste', head: { sha }, base: { ref: 'develop' } });
      }
      if (url.pathname.endsWith('/comments') && req.method === 'GET') {
        // Devolve os pre-existentes MAIS os que este servidor ja aceitou.
        // Sem isso nao da para exercitar a resposta perdida: a reconsulta do
        // laco de retentativa nunca encontraria o comentario que acabou de ser
        // criado, e o teste provaria o contrario do que se quer.
        return json(200, [
          ...(cenario.comentariosExistentes ?? []),
          ...registro.comentarios.map((body) => ({ body })),
        ]);
      }
      if (url.pathname.endsWith('/comments') && req.method === 'POST') {
        const b = JSON.parse(corpo).body;
        tentativasDePost += 1;
        // Queda ANTES de registrar: a criacao nao aconteceu. Repetir e correto.
        if (cenario.quedasNoPost && tentativasDePost <= cenario.quedasNoPost) {
          res.destroy();
          return undefined;
        }
        registro.comentarios.push(b);
        // Queda DEPOIS de registrar: o recurso foi criado e a resposta se
        // perdeu -- a resposta ambigua. Repetir aqui duplicaria o relatorio.
        if (cenario.perderRespostaDoPost && tentativasDePost <= cenario.perderRespostaDoPost) {
          res.destroy();
          return undefined;
        }
        return json(201, { html_url: 'https://exemplo.invalid/comentario/1' });
      }
      if (url.pathname.endsWith('/files')) {
        return json(200, url.searchParams.get('page') === '1' ? (cenario.arquivos ?? []) : []);
      }
      // --- Anthropic ---
      if (url.pathname.startsWith('/models/')) {
        if (cenario.modeloInvalido) return json(404, { error: { message: 'model not found' } });
        return json(200, { id: decodeURIComponent(url.pathname.slice('/models/'.length)) });
      }
      if (url.pathname === '/messages') {
        tentativasDeMensagem += 1;
        // Derruba o socket nas primeiras N tentativas: e assim que uma falha
        // de rede aparece para o `fetch` (ECONNRESET), e nao como status HTTP.
        if (cenario.quantasQuedas && tentativasDeMensagem <= cenario.quantasQuedas) {
          // `res.destroy()` e nao `req.destroy()`: derrubar o socket da
          // RESPOSTA faz o `fetch` do cliente falhar na hora com ECONNRESET.
          // Com `req.destroy()` o cliente fica esperando resposta que nunca
          // vem e so desiste no tempo limite -- a primeira versao deste teste
          // pendurou a suite por minutos exatamente assim.
          res.destroy();
          return undefined;
        }
        registro.prompts.push(JSON.parse(corpo).messages[0].content);
        if (cenario.quantos429 && tentativasDeMensagem <= cenario.quantos429) {
          return json(429, { error: { message: 'rate limited' } });
        }
        if (cenario.respostaVazia) return json(200, { content: [], usage: {} });
        return json(200, {
          content: [{ type: 'text', text: cenario.textoDoModelo ?? 'achado de teste' }],
          usage: { input_tokens: 11, output_tokens: 22 },
        });
      }
      return json(404, { error: 'rota nao mapeada no servidor falso: ' + url.pathname });
    });
  });
  return { servidor, registro };
}

function rodar({ cenario, args }) {
  return new Promise((resolvido) => {
    const { servidor, registro } = servidorFalso(cenario);
    servidor.listen(0, () => {
      const porta = servidor.address().port;
      execFile('node', [SCRIPT, ...args], {
        env: {
          ...process.env,
          AUDITOR_API_GITHUB: `http://127.0.0.1:${porta}`,
          AUDITOR_API_ANTHROPIC: `http://127.0.0.1:${porta}`,
          GITHUB_TOKEN: 'token-de-teste',
          ANTHROPIC_API_KEY: 'chave-de-teste',
          GITHUB_REPOSITORY: 'org/repo',
          AUDITOR_TENTATIVAS: '3',
          // Tempo limite curto no harness, de proposito. O padrao do script sao
          // 120s por requisicao; contra um servidor local isso nunca e
          // necessario, e se um teste pendurar o padrao prenderia a suite por
          // dois minutos POR CHAMADA antes de acusar. Falhar rapido e o que faz
          // o travamento aparecer como falha em vez de como lentidao.
          AUDITOR_TIMEOUT_MS: '4000',
        },
      }, (erro, saida, erroSaida) => {
        servidor.close(() => resolvido({
          codigo: erro?.code ?? 0, saida, erroSaida, registro,
        }));
      });
    });
  });
}

const ARGS = ['--pr', '614', '--sha', '46859dd0', '--issue', '570'];
const UM_ARQUIVO = [{ filename: 'apps/api/src/x.service.ts', status: 'modified', additions: 3, deletions: 1, patch: '@@ -1 +1 @@\n-antes\n+depois' }];

test('1. caminho feliz: publica e o relatorio tem o que precisa', async () => {
  const r = await rodar({ cenario: { headSha: '46859dd0abc', arquivos: UM_ARQUIVO }, args: ARGS });
  assert.equal(r.codigo, 0, r.erroSaida);
  assert.equal(r.registro.comentarios.length, 1);
  const c = r.registro.comentarios[0];
  assert.ok(c.includes('Não equivale a aprovação GitHub independente'));
  assert.ok(c.includes('<!-- auditor-claude sha=46859dd0abc'));
  assert.ok(c.includes('1 de 1 arquivos'));
  assert.ok(c.includes('Tokens: entrada 11, saída 22'));
  assert.ok(!c.includes('A HEAD do PR mudou'), 'sem mudanca de HEAD nao se avisa nada');
  assert.ok(r.saida.includes('relatorio publicado'));
});

test('2. 429 duas vezes: retenta e conclui', async () => {
  const r = await rodar({ cenario: { headSha: '46859dd0abc', arquivos: UM_ARQUIVO, quantos429: 2 }, args: ARGS });
  assert.equal(r.codigo, 0, r.erroSaida);
  assert.equal(r.registro.prompts.length, 3, 'deveria ter tentado 3 vezes');
  assert.ok(r.erroSaida.includes('429'), 'a retentativa precisa aparecer no log');
  assert.equal(r.registro.comentarios.length, 1);
});

test('3. 429 sempre: desiste sem publicar relatorio pela metade', async () => {
  const r = await rodar({ cenario: { headSha: '46859dd0abc', arquivos: UM_ARQUIVO, quantos429: 99 }, args: ARGS });
  assert.notEqual(r.codigo, 0);
  assert.equal(r.registro.comentarios.length, 0, 'nao pode publicar nada');
  assert.ok(r.erroSaida.includes('POST messages falhou com 429'));
});

test('4. SHA que nao e a HEAD: recusa antes de gastar token', async () => {
  const r = await rodar({ cenario: { headSha: 'outracoisa999', arquivos: UM_ARQUIVO }, args: ARGS });
  assert.notEqual(r.codigo, 0);
  assert.equal(r.registro.prompts.length, 0, 'nao pode nem chamar o modelo');
  assert.equal(r.registro.comentarios.length, 0);
  assert.ok(r.erroSaida.includes('nao e a HEAD'));
});

test('5. idempotencia: relatorio ja existe para a SHA, nao republica', async () => {
  const r = await rodar({
    cenario: {
      headSha: '46859dd0abc', arquivos: UM_ARQUIVO,
      comentariosExistentes: [{ body: 'bla <!-- auditor-claude sha=46859dd0abc tipo=auditoria-pr --> bla' }],
    },
    args: ARGS,
  });
  assert.equal(r.codigo, 0, r.erroSaida);
  assert.equal(r.registro.prompts.length, 0, 'nao pode gastar token de novo');
  assert.equal(r.registro.comentarios.length, 0);
  assert.ok(r.saida.includes('ja existe relatorio'));
});

test('6. recorte vazio e resposta sem texto: as duas recusam publicar', async () => {
  const soBinario = [{ filename: 'logo.png', status: 'added', additions: 1, deletions: 0, patch: 'x' }];
  const vazio = await rodar({ cenario: { headSha: '46859dd0abc', arquivos: soBinario }, args: ARGS });
  assert.notEqual(vazio.codigo, 0);
  assert.equal(vazio.registro.comentarios.length, 0);
  assert.ok(vazio.erroSaida.includes('recorte ficou vazio'));

  const semTexto = await rodar({ cenario: { headSha: '46859dd0abc', arquivos: UM_ARQUIVO, respostaVazia: true }, args: ARGS });
  assert.notEqual(semTexto.codigo, 0);
  assert.equal(semTexto.registro.comentarios.length, 0, 'comentario vazio pareceria auditoria feita');
  assert.ok(semTexto.erroSaida.includes('sem texto'));
});

test('7. segredo no diff NAO chega ao prompt nem ao comentario', async () => {
  const comSegredo = [{
    filename: 'apps/api/src/x.service.ts', status: 'modified', additions: 2, deletions: 0,
    patch: '@@ -1 +1 @@\n+const k = "sk-ant-api03-SEGREDO_DO_DIFF_123456";\n+const dono = "fulano@cliente.com.br";',
  }];
  const r = await rodar({
    cenario: {
      headSha: '46859dd0abc', arquivos: comSegredo,
      textoDoModelo: 'vi a chave sk-ant-api03-O_MODELO_REPETIU_9999 no diff',
    },
    args: ARGS,
  });
  assert.equal(r.codigo, 0, r.erroSaida);
  const prompt = r.registro.prompts[0];
  assert.ok(!prompt.includes('SEGREDO_DO_DIFF'), 'segredo do diff chegou ao prompt');
  assert.ok(!prompt.includes('fulano@cliente'), 'e-mail do diff chegou ao prompt');
  assert.ok(prompt.includes('[chave-anthropic-removida]'));
  const c = r.registro.comentarios[0];
  assert.ok(!c.includes('O_MODELO_REPETIU'), 'segredo repetido pelo modelo saiu no comentario');
  assert.ok(!c.includes('SEGREDO_DO_DIFF'));
});

test('8. modelo invalido: falha com mensagem clara, sem publicar', async () => {
  const r = await rodar({ cenario: { headSha: '46859dd0abc', arquivos: UM_ARQUIVO, modeloInvalido: true }, args: ARGS });
  assert.notEqual(r.codigo, 0);
  assert.equal(r.registro.comentarios.length, 0);
  assert.ok(r.erroSaida.includes('GET model falhou com 404'));
});

test('9. HEAD muda durante a auditoria: publica com aviso, nao em silencio', async () => {
  // A janela real: `conferirSha` passa, e entre ela e a publicacao passam a
  // leitura do diff e a chamada ao modelo, que levam minutos. Se alguem
  // empurrar commit nesse meio, o recorte lido ja e do codigo NOVO enquanto o
  // relatorio sai rotulado com a SHA VELHA -- rotulo e conteudo discordam.
  //
  // O servidor falso devolve a SHA pedida na primeira leitura do PR e outra
  // nas seguintes, que e exatamente esse cenario.
  const r = await rodar({
    cenario: { headSha: '46859dd0abc', headShaDepois: 'f0f0f0f0999', arquivos: UM_ARQUIVO },
    args: ARGS,
  });

  assert.equal(r.codigo, 0, r.erroSaida);
  assert.equal(r.registro.comentarios.length, 1, 'publica: os tokens ja foram gastos e o relatorio vale para a SHA vista');

  const c = r.registro.comentarios[0];
  assert.ok(c.includes('A HEAD do PR mudou durante esta auditoria'), 'o aviso tem de estar no corpo');
  assert.ok(c.includes('46859dd0abc'), 'a SHA auditada');
  assert.ok(c.includes('f0f0f0f0999'), 'a SHA nova');
  assert.ok(
    c.indexOf('A HEAD do PR mudou') < c.indexOf('Não equivale a aprovação'),
    'o aviso vem antes de tudo: quem le o topo precisa saber que o relatorio e velho',
  );
  // A idempotencia continua pela SHA auditada: um disparo novo na SHA nova publica.
  assert.ok(c.startsWith('<!-- auditor-claude sha=46859dd0abc'));
  // E o operador que disparou precisa ver no log, nao so no comentario.
  assert.ok(r.erroSaida.includes('a HEAD mudou de 46859dd0abc para f0f0f0f0999'), r.erroSaida);

  // Mais de uma leitura do PR: a reconferencia aconteceu de fato.
  const leituras = r.registro.chamadas.filter((c2) => /^GET \/repos\/org\/repo\/pulls\/614$/u.test(c2));
  assert.ok(leituras.length >= 2, `esperava reconferencia da HEAD, houve ${leituras.length} leitura(s)`);
});

test('10. conexao derrubada: retenta a falha de rede e conclui', async () => {
  // Defeito apontado na revisao: `chamarComRetentativa` so olhava
  // `resposta.status`, entao excecao de `fetch` escapava do laco e matava a
  // auditoria na primeira falha de rede -- justamente a falha mais comum e
  // mais transitoria num runner de CI.
  //
  // Aqui o servidor derruba o socket nas duas primeiras chamadas de
  // `/messages`. Antes da correcao isto abortava sem publicar nada.
  const r = await rodar({
    cenario: { headSha: '46859dd0abc', arquivos: UM_ARQUIVO, quantasQuedas: 2 },
    args: ARGS,
  });

  assert.equal(r.codigo, 0, r.erroSaida);
  assert.equal(r.registro.comentarios.length, 1, 'tem de publicar depois de recuperar');
  // Conto em `chamadas`, e nao em `prompts`: `chamadas` e gravado no topo do
  // handler, antes de qualquer ramo, enquanto `prompts` so e gravado na
  // tentativa que chega ao fim. Minha primeira versao afirmava
  // `prompts.length === 3` e falhou com 1 !== 3 -- a expectativa estava errada,
  // o codigo estava certo. `chamadas` e o sinal que de fato mede "a requisicao
  // chegou tres vezes".
  const tentativas = r.registro.chamadas.filter((c2) => c2 === 'POST /messages');
  assert.equal(tentativas.length, 3, `duas quedas mais a que deu certo, houve ${tentativas.length}`);
  assert.equal(r.registro.prompts.length, 1, 'so a tentativa concluida registra o prompt');
  assert.ok(/lancou/u.test(r.erroSaida), `a excecao precisa aparecer no log: ${r.erroSaida}`);
});

test('11. reconferencia da HEAD falha: o relatorio declara, nao finge que conferiu', async () => {
  // Achado do Work em 16/11. A versao anterior fazia
  //     headAtual = depois?.head?.sha ?? null
  // e, com `null`, NAO emitia aviso nenhum -- "nao consegui reconferir" saia
  // indistinguivel de "conferi e nao mudou". Publicacao silenciosa sobre
  // verificacao que falhou.
  //
  // Aqui a primeira leitura do PR passa (conferirSha aprova) e as seguintes
  // devolvem 500, que e exatamente a janela: a auditoria comeca verificada e a
  // reconferencia morre no fim.
  const r = await rodar({
    cenario: { headSha: '46859dd0abc', arquivos: UM_ARQUIVO, falhaNaReleitura: true },
    args: ARGS,
  });

  assert.equal(r.codigo, 0, r.erroSaida);
  assert.equal(r.registro.comentarios.length, 1, 'publica: os tokens ja foram gastos');

  const c = r.registro.comentarios[0];
  assert.ok(
    c.includes('Não foi possível reconferir a HEAD antes de publicar'),
    `o relatorio tem de declarar a falha da verificacao:\n${c.slice(0, 400)}`,
  );
  assert.ok(c.includes('não há como afirmar que ainda é a HEAD agora'));
  // E nao pode alegar que a HEAD mudou: ela pode nao ter mudado. O que se sabe
  // e que nao se sabe.
  assert.ok(!c.includes('A HEAD do PR mudou'), 'nao afirmar mudanca que nao foi observada');
  assert.ok(
    c.indexOf('Não foi possível reconferir') < c.indexOf('Não equivale a aprovação'),
    'o aviso vem antes de tudo',
  );
  assert.ok(r.erroSaida.includes('nao foi possivel reconferir a HEAD'), r.erroSaida);
});

test('12. resposta do POST se perde depois de criar: NAO duplica o relatorio', async () => {
  // Segundo achado do Work em 16/11, e ele nasceu da minha correcao do mesmo
  // dia: antes de a excecao ser retentada, uma conexao derrubada abortava a
  // auditoria. Depois dela, retenta -- e o POST de comentario CRIA recurso.
  //
  // Cenario: o GitHub grava o comentario e a resposta se perde. Sem guarda, a
  // tentativa seguinte publica o MESMO relatorio outra vez, na mesma issue.
  const r = await rodar({
    cenario: { headSha: '46859dd0abc', arquivos: UM_ARQUIVO, perderRespostaDoPost: 1 },
    args: ARGS,
  });

  assert.equal(r.codigo, 0, r.erroSaida);
  assert.equal(
    r.registro.comentarios.length, 1,
    `o relatorio foi publicado ${r.registro.comentarios.length}x; a guarda de idempotencia nao pegou`,
  );
  // Minha primeira versao deste caso exigia DOIS POSTs, e falhou com 1 !== 2.
  // A expectativa estava errada e o codigo certo: a guarda roda ANTES de a
  // segunda tentativa nascer, entao o segundo POST nunca sai. E o
  // comportamento melhor -- previne a duplicata em vez de deduplicar depois.
  const posts = r.registro.chamadas.filter((c2) => /^POST \/repos\/.*\/comments$/u.test(c2));
  assert.equal(posts.length, 1, `a guarda deve impedir o 2o POST; houve ${posts.length}`);

  // O que prova que a RETENTATIVA foi alcancada, e nao que o POST simplesmente
  // nunca e repetido: houve uma reconsulta de comentarios DEPOIS do POST.
  // Sem ela, o caso 13 e este seriam satisfeitos por "nao retentar POST".
  const indicePost = r.registro.chamadas.findIndex((c2) => /^POST \/repos\/.*\/comments$/u.test(c2));
  const reconsultou = r.registro.chamadas
    .slice(indicePost + 1)
    .some((c2) => /^GET \/repos\/.*\/comments$/u.test(c2));
  assert.ok(reconsultou, `esperava reconsulta de comentarios depois do POST: ${r.registro.chamadas.join(' | ')}`);
  assert.ok(
    r.erroSaida.includes('nao repito'),
    `o log tem de dizer que reconheceu a criacao anterior: ${r.erroSaida}`,
  );
  assert.ok(r.saida.includes('ja estava publicado'), r.saida);
});

test('13. contraprova: POST que falha SEM criar e repetido e publica', async () => {
  // Sem este caso, o 12 passaria numa implementacao que simplesmente deixasse
  // de retentar o POST -- e ai uma falha de rede transitoria no ultimo passo
  // jogaria no lixo uma auditoria ja paga. A guarda tem de distinguir
  // "criou e perdeu a resposta" de "nao criou".
  const r = await rodar({
    cenario: { headSha: '46859dd0abc', arquivos: UM_ARQUIVO, quedasNoPost: 2 },
    args: ARGS,
  });

  assert.equal(r.codigo, 0, r.erroSaida);
  assert.equal(r.registro.comentarios.length, 1, 'tem de publicar exatamente uma vez');
  const posts = r.registro.chamadas.filter((c2) => /^POST \/repos\/.*\/comments$/u.test(c2));
  assert.equal(posts.length, 3, `duas quedas mais a que deu certo, houve ${posts.length}`);
  assert.ok(!r.erroSaida.includes('nao repito'), 'nao criou nada: nao e caso de idempotencia');
  assert.ok(r.saida.includes('relatorio publicado'), r.saida);
});
