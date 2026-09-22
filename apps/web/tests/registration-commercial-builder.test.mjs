import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('rota autenticada monta o organizador comercial', async () => {
  const [page, builder, dashboard] = await Promise.all([
    read('../app/eventos/[id]/painel/inscricoes/categorias-lotes/page.tsx'),
    read('../components/registration-commercial-builder.tsx'),
    read('../components/event-admin-dashboard.tsx'),
  ]);
  assert.match(page, /RegistrationCommercialBuilder eventId=\{id\}/u);
  assert.match(builder, /if \(!getToken\(\)\) \{ router\.replace\('\/login'\); return; \}/u);
  assert.match(builder, /`\/events\/\$\{eventId\}\/registration-commercial`/u);
  assert.match(builder, /method: 'PUT'/u);
  assert.match(builder, /expectedRevision: payload\.revision/u);
  assert.match(dashboard, /function registrationCommercialHref\(eventId: string\)/u);
  assert.match(dashboard, /\/painel\/inscricoes\/categorias-lotes/u);
  assert.match(dashboard, /Configurar categorias e lotes/u);
});

test('editor cobre categorias, lotes e regras do modo de inscrição', async () => {
  const builder = await read('../components/registration-commercial-builder.tsx');
  for (const field of ['capacity', 'proofRequirement', 'startsAt', 'endsAt', 'quantity', 'priceCents', 'active', 'sortOrder']) {
    assert.match(builder, new RegExp(field, 'u'));
  }
  assert.match(builder, /registrationMode === 'FREE' \? 0 : lot\.priceCents/u);
  assert.match(builder, /registrationMode === 'PAID' \? category\.proofRequirement : 'NONE'/u);
  assert.match(builder, /date\.toISOString\(\)/u);
  assert.match(builder, /Math\.round\(Number\(event\.target\.value \|\| 0\) \* 100\)/u);
});

test('corte não antecipa inscrição pública nem integração financeira', async () => {
  const builder = await read('../components/registration-commercial-builder.tsx');
  assert.match(builder, /salvar aqui não abre inscrições, não reserva vagas e não inicia cobranças/u);
  assert.match(builder, /publicRegistrationEnabled: false/u);
  assert.doesNotMatch(builder, /Asaas|webhook|checkoutUrl|pixKey|cupom/iu);
});

test('interface mantém semântica, foco e reflow móvel', async () => {
  const [builder, css] = await Promise.all([
    read('../components/registration-commercial-builder.tsx'),
    read('../components/registration-commercial-builder.module.css'),
  ]);
  assert.match(builder, /<main/u);
  assert.match(builder, /<h1 id="commercial-title">/u);
  assert.match(builder, /<fieldset/u);
  assert.match(builder, /<legend>/u);
  assert.match(builder, /role="alert"/u);
  assert.match(builder, /role="status"/u);
  assert.match(css, /:focus-visible/u);
  assert.match(css, /@media \(max-width: 700px\)/u);
  assert.match(css, /grid-template-columns: 1fr/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /@media \(forced-colors: active\)/u);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/iu);
});
