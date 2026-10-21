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
  assert.match(dashboard, /Categorias e lotes/u);
});

test('editor cobre categorias, lotes e regras do modo de inscrição', async () => {
  const builder = await read('../components/registration-commercial-builder.tsx');
  for (const field of ['capacity', 'proofRequirement', 'startsAt', 'endsAt', 'quantity', 'priceCents', 'active', 'sortOrder']) {
    assert.match(builder, new RegExp(field, 'u'));
  }
  assert.match(builder, /payload\.event\.registrationMode === 'FREE' \? 0 : priceInCents/u);
  assert.match(builder, /registrationMode === 'PAID' \|\| category\.proofRequirement !== 'REQUIRED_BEFORE_PAYMENT'/u);
  assert.match(builder, /Solicitar, envio opcional/u);
  assert.match(builder, /date\.toISOString\(\)/u);
  assert.match(builder, /function priceInCents\(value: string\)/u);
  assert.match(builder, /Math\.round\(Number\(normalized\) \* 100\)/u);
  assert.match(builder, /disabled=\{Boolean\(category\.id\)\}/u);
  assert.match(builder, /disabled=\{Boolean\(lot\.id\)\}/u);
  assert.match(builder, /key=\{category\.id \?\? `category-\$\{categoryIndex\}`\}/u);
  assert.match(builder, /key=\{lot\.id \?\? `lot-\$\{lotIndex\}`\}/u);
});

test('corte não antecipa inscrição pública nem integração financeira', async () => {
  const builder = await read('../components/registration-commercial-builder.tsx');
  assert.match(builder, /salvar aqui não abre inscrições, não reserva vagas e não inicia cobranças/u);
  assert.match(builder, /publicRegistrationEnabled: false/u);
  assert.doesNotMatch(builder, /Asaas|webhook|checkoutUrl|pixKey|cupom/iu);
});

test('ações de categoria, lote e salvar ficam no fluxo da tela', async () => {
  const [builder, css] = await Promise.all([
    read('../components/registration-commercial-builder.tsx'),
    read('../components/registration-commercial-builder.module.css'),
  ]);
  const lotsHeading = builder.indexOf('lotHeading}><h3>Lotes</h3></div>');
  const addLot = builder.indexOf('Adicionar lote');
  assert.match(builder, /headingActions\}>\{addCategoryButton\}\{saveButton\}/u);
  assert.match(builder, /styles\.lotActions/u);
  assert.notEqual(lotsHeading, -1);
  assert.notEqual(addLot, -1);
  assert.ok(addLot > lotsHeading, 'Adicionar lote precisa ficar depois do título e da lista de lotes.');
  assert.doesNotMatch(builder, /lotHeading\}><h3>Lotes<\/h3><button/u);
  assert.match(builder, /footerActions\}>\{addCategoryButton\}\{saveButton\}/u);
  assert.equal((builder.match(/\{addCategoryButton\}/g) || []).length, 2);
  assert.equal((builder.match(/\{saveButton\}/g) || []).length, 2);
  assert.match(css, /\.footerActions \{[\s\S]*position: sticky;[\s\S]*bottom: 0;/u);
  assert.doesNotMatch(css, /\.addCategory \{/u);
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
