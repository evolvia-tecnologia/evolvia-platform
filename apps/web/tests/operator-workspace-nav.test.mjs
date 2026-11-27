import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const url = (source) => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const compile = (path) => ts.transpileModule(
  readFileSync(new URL(path, import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;

const journey = url(compile('../lib/operator-journey.ts'));
const nav = url(
  compile('../lib/operator-workspace-nav.ts').replace(
    /from ['"]\.\/operator-journey['"]/u,
    `from ${JSON.stringify(journey)}`,
  ),
);

const {
  isPapelOperadorRestrito,
  isPapelOrganizador,
  linksDoOperadorRestrito,
  secaoPermitidaAoOperador,
} = await import(nav);

test('só OPERATOR é papel restrito; organizadores usam painel completo', () => {
  assert.equal(isPapelOperadorRestrito('OPERATOR'), true);
  assert.equal(isPapelOperadorRestrito('OWNER'), false);
  assert.equal(isPapelOrganizador('OWNER'), true);
  assert.equal(isPapelOrganizador('ADMIN'), true);
  assert.equal(isPapelOrganizador('MANAGER'), true);
  assert.equal(isPapelOrganizador('OPERATOR'), false);
  assert.equal(isPapelOrganizador('VIEWER'), false);
});

test('operador sem ações ainda vê Minhas permissões e não vê financeiro/config', () => {
  const links = linksDoOperadorRestrito('evt-1', { escopado: true, papel: 'OPERATOR', acoes: [] });
  assert.equal(links.length, 1);
  assert.equal(links[0].href, '/eventos/evt-1/painel/minhas-permissoes');
  assert.ok(!links.some((l) => l.href.includes('financeiro')));
  assert.ok(!links.some((l) => l.href.includes('configuracao')));
  assert.ok(!links.some((l) => l.href.includes('expositores')));
});

test('qualquer area do posto abre UM destino: o posto, e nenhum outro', () => {
  // Antes eram tres destinos. Dois eram vazamento e sairam — ver a nota no
  // helper. O posto passou a cobrir material e relatorios tambem.
  for (const acao of ['checkin', 'presenca_dia', 'kit_ler', 'kit_relatorio', 'relatorio', 'inscricao_ler', 'inscricao_criar']) {
    const links = linksDoOperadorRestrito('evt-2', {
      escopado: true, papel: 'OPERATOR',
      acoes: [{ acao, capacidade: 'X', sensivel: false }],
    });
    const hrefs = links.map((l) => l.href);
    assert.deepEqual(hrefs, ['/eventos/evt-2/painel/minhas-permissoes', '/eventos/evt-2/painel/check-in'], acao);
  }
});

test('o shell do operador nunca oferece inscricoes, show, financeiro nem configuracao', () => {
  // `/painel/inscricoes` expunha valores, pagamentos e Trocar categoria — e os
  // endpoints autorizam por papel, sem concessao por acao. `/painel/show`
  // oferecia Divulgacao e Categorias e lotes.
  const links = linksDoOperadorRestrito('evt-9', {
    escopado: true, papel: 'OPERATOR',
    acoes: [
      { acao: 'checkin', capacidade: 'CREDENTIAL_CHECKIN', sensivel: false },
      { acao: 'inscricao_ler', capacidade: 'REGISTRATION_READ', sensivel: false },
      { acao: 'presenca_dia', capacidade: 'ACCESS_DAY', sensivel: false },
      { acao: 'kit_ler', capacidade: 'KIT_READ', sensivel: false },
      { acao: 'relatorio', capacidade: 'REPORT', sensivel: false },
    ],
  });
  const hrefs = links.map((l) => l.href);
  assert.deepEqual(hrefs, ['/eventos/evt-9/painel/minhas-permissoes', '/eventos/evt-9/painel/check-in']);
  for (const proibido of ['/painel/inscricoes', '/painel/show', 'financeiro', 'configuracao', 'expositores', 'comunicacao', 'divulgacao', 'caex']) {
    assert.equal(hrefs.some((h) => h.includes(proibido)), false, proibido);
  }
});

test('a rota permitida vem do PATHNAME, e /painel/permissoes e recusada', () => {
  // O bypass: `/painel/permissoes` tambem roda com section="check-in" e monta
  // `OperatorCapabilities`, a tela de gestao do organizador. Pela versao
  // anterior, operador com atalho de check-in passava e montava aquela tela.
  const links = linksDoOperadorRestrito('evt-3', {
    escopado: true, papel: 'OPERATOR',
    acoes: [{ acao: 'checkin', capacidade: 'CREDENTIAL_CHECKIN', sensivel: false }],
  });
  assert.equal(secaoPermitidaAoOperador('/eventos/evt-3/painel/check-in', links), true);
  assert.equal(secaoPermitidaAoOperador('/eventos/evt-3/painel/minhas-permissoes', links), true);
  assert.equal(secaoPermitidaAoOperador('/eventos/evt-3/painel/permissoes', links), false,
    'tela de gestao de permissoes do organizador ficou alcancavel');
  for (const rota of [
    '/eventos/evt-3/painel/financeiro', '/eventos/evt-3/painel/inscricoes',
    '/eventos/evt-3/painel/show', '/eventos/evt-3/painel/expositores',
    '/eventos/evt-3/painel/divulgacao', '/eventos/evt-3/configuracao',
    '/eventos/evt-3/painel', '/eventos/OUTRO/painel/check-in',
  ]) {
    assert.equal(secaoPermitidaAoOperador(rota, links), false, rota);
  }
});

test('prefixo so casa em fronteira de segmento, e sufixo nao casa', () => {
  const links = linksDoOperadorRestrito('evt-4', {
    escopado: true, papel: 'OPERATOR',
    acoes: [{ acao: 'checkin', capacidade: 'CREDENTIAL_CHECKIN', sensivel: false }],
  });
  // Rota filha do atalho passa.
  assert.equal(secaoPermitidaAoOperador('/eventos/evt-4/painel/check-in/fila', links), true);
  // Barra final e query nao mudam a decisao.
  assert.equal(secaoPermitidaAoOperador('/eventos/evt-4/painel/check-in/', links), true);
  assert.equal(secaoPermitidaAoOperador('/eventos/evt-4/painel/check-in?busca=x', links), true);
  // Irmao com o atalho como PREFIXO de texto, mas nao de segmento, e recusado.
  assert.equal(secaoPermitidaAoOperador('/eventos/evt-4/painel/check-interno', links), false);
  // Vazio e nao-string nao autorizam.
  assert.equal(secaoPermitidaAoOperador('', links), false);
  assert.equal(secaoPermitidaAoOperador('/', links), false);
  assert.equal(secaoPermitidaAoOperador(undefined, links), false);
});

test('operador sem acao nenhuma nao abre rota operacional alguma', () => {
  const links = linksDoOperadorRestrito('evt-5', { escopado: true, papel: 'OPERATOR', acoes: [] });
  assert.equal(secaoPermitidaAoOperador('/eventos/evt-5/painel/check-in', links), false);
  assert.equal(secaoPermitidaAoOperador('/eventos/evt-5/painel/minhas-permissoes', links), true);
});
