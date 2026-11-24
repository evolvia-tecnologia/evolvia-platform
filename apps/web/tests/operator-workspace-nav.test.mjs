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

test('ações de credenciamento abrem o posto; inscrição abre lista; acesso abre show', () => {
  const links = linksDoOperadorRestrito('evt-2', {
    escopado: true,
    papel: 'OPERATOR',
    acoes: [
      { acao: 'checkin', capacidade: 'CREDENTIAL_CHECKIN', sensivel: false },
      { acao: 'inscricao_ler', capacidade: 'REGISTRATION_READ', sensivel: false },
      { acao: 'presenca_dia', capacidade: 'ACCESS_DAY', sensivel: false },
    ],
  });
  const hrefs = links.map((l) => l.href);
  assert.ok(hrefs.includes('/eventos/evt-2/painel/minhas-permissoes'));
  assert.ok(hrefs.includes('/eventos/evt-2/painel/check-in'));
  assert.ok(hrefs.includes('/eventos/evt-2/painel/inscricoes'));
  assert.ok(hrefs.includes('/eventos/evt-2/painel/show'));
  assert.ok(!hrefs.some((h) => h.includes('financeiro')));
  assert.ok(!hrefs.some((h) => h.includes('comunicacao')));
});

test('seção de organizador não é permitida ao operador mesmo com links de balcão', () => {
  const links = linksDoOperadorRestrito('evt-3', {
    escopado: true,
    papel: 'OPERATOR',
    acoes: [{ acao: 'checkin', capacidade: 'CREDENTIAL_CHECKIN', sensivel: false }],
  });
  assert.equal(secaoPermitidaAoOperador('check-in', links), true);
  assert.equal(secaoPermitidaAoOperador('overview', links), false);
  assert.equal(secaoPermitidaAoOperador('financial', links), false);
  assert.equal(secaoPermitidaAoOperador('exhibitors', links), false);
  assert.equal(secaoPermitidaAoOperador('publication', links), false);
});
