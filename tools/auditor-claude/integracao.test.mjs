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
 * Por que isto existe: os 9 testes de auditar-pr.test.mjs cobrem as DECISOES,
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
        return json(200, { title: cenario.titulo ?? 'PR de teste', head: { sha: cenario.headSha }, base: { ref: 'develop' } });
      }
      if (url.pathname.endsWith('/comments') && req.method === 'GET') {
        return json(200, cenario.comentariosExistentes ?? []);
      }
      if (url.pathname.endsWith('/comments') && req.method === 'POST') {
        const b = JSON.parse(corpo).body;
        registro.comentarios.push(b);
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
