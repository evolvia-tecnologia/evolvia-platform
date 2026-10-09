import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const area = readFileSync(new URL('../components/exhibitor-company-area.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/evento/[slug]/expositor/page.tsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../components/event-exhibitors.tsx', import.meta.url), 'utf8');

test('a área da empresa traz os menus do expositor sem senha e sem boleto', () => {
  for (const label of ['Dados cadastrais', 'Representantes', 'Formulários', 'Pagamentos', 'Downloads']) {
    assert.match(area, new RegExp(label, 'u'));
  }
  assert.match(area, /Acessado/u);
  assert.match(area, /Acesso pendente/u);
  assert.match(area, /Vencido/u);
  assert.match(area, /não emite boleto/u);
  assert.match(area, /conta Evolvia/u);
  assert.doesNotMatch(area, /type="password"|name="password"|strSenha/u);
  assert.match(page, /Área do expositor/u);
  assert.match(page, /index: false/u);
  assert.match(admin, /conta Evolvia do e-mail de acesso/u);
  assert.match(admin, /Não há senha de expositor nem boleto/u);
  const caex = readFileSync(new URL('../components/exhibitor-caex.tsx', import.meta.url), 'utf8');
  for (const label of ['Início', 'Expositores', 'Credenciais de expositores', 'Prestadores', 'Credenciais de prestadores', 'Imprimir credencial', 'Credenciar']) {
    assert.match(caex, new RegExp(label, 'u'));
  }
  assert.match(caex, /Não há senha compartilhada do evento/u);
  assert.doesNotMatch(caex, /type="password"|opeSenha/u);
});
