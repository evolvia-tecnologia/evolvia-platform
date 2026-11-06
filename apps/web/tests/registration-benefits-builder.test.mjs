import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('rota monta editor autenticado, usa revisão e aparece no painel', async () => {
  const [page, builder, dashboard] = await Promise.all([
    read('../app/eventos/[id]/painel/inscricoes/beneficios/page.tsx'),
    read('../components/registration-benefits-builder.tsx'),
    read('../components/event-admin-dashboard.tsx'),
  ]);
  assert.match(page, /RegistrationBenefitsBuilder eventId=\{id\}/u);
  assert.match(builder, /if \(!getToken\(\)\) \{ router\.replace\('\/login'\); return; \}/u);
  assert.match(builder, /`\/events\/\$\{eventId\}\/registration-benefits`/u);
  assert.match(builder, /method: 'PUT'/u);
  assert.match(builder, /expectedRevision: payload\.revision/u);
  assert.match(builder, /<form className=\{styles\.builder\}/u);
  assert.match(builder, /type="submit"/u);
  assert.match(dashboard, /function registrationBenefitsHref\(eventId: string\)/u);
  assert.match(dashboard, /\/painel\/inscricoes\/beneficios/u);
  assert.match(dashboard, /Cupons e convites/u);
});

test('tela cobre cupom, convite e cortesia sem antecipar resgate', async () => {
  const builder = await read('../components/registration-benefits-builder.tsx');
  for (const value of ['COUPON', 'INVITATION', 'COURTESY', 'discountPercent', 'maxUses', 'usedCount', 'validFrom', 'validUntil']) {
    assert.match(builder, new RegExp(value, 'u'));
  }
  assert.match(builder, /publicRedemptionEnabled: false/u);
  assert.match(builder, /salvar códigos não abre inscrições, não cria reservas e não realiza cobranças/u);
  assert.doesNotMatch(builder, /Asaas|webhook|checkoutUrl|pixKey/iu);
});

test('protege identidade persistida, exclusão usada e concorrência de carga', async () => {
  const builder = await read('../components/registration-benefits-builder.tsx');
  assert.match(builder, /disabled=\{Boolean\(benefit\.id\)\}/u);
  assert.match(builder, /disabled=\{benefit\.usedCount > 0\}/u);
  assert.match(builder, /key=\{benefit\.id \?\? `benefit-\$\{index\}`\}/u);
  assert.match(builder, /let active = true/u);
  assert.match(builder, /return \(\) => \{ active = false; \}/u);
});

test('interface preserva semântica, foco, reflow e modos assistivos', async () => {
  const [builder, css] = await Promise.all([
    read('../components/registration-benefits-builder.tsx'),
    read('../components/registration-benefits-builder.module.css'),
  ]);
  assert.match(builder, /<main/u);
  assert.match(builder, /<h1 id="benefits-title">/u);
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


test('cada cupom convite e cortesia oferece salvar imediatamente abaixo dos campos', async () => {
  const [builder, css] = await Promise.all([
    read('../components/registration-benefits-builder.tsx'),
    read('../components/registration-benefits-builder.module.css'),
  ]);
  const cardStart = builder.indexOf('<fieldset className={styles.card}');
  const formEnd = builder.indexOf('</fieldset>', cardStart);
  assert.ok(cardStart >= 0 && formEnd > cardStart);
  const card = builder.slice(cardStart, formEnd);
  assert.ok(card.indexOf('className={styles.grid}') < card.indexOf('className={styles.cardActions}'));
  assert.match(card, /className=\{styles\.primary\} type="submit"/u);
  assert.match(card, /Salvar alterações/u);
  assert.match(card, /kindLabels\[benefit\.kind\]/u);
  assert.match(css, /\.cardActions\s*\{/u);
  assert.doesNotMatch(builder.slice(formEnd), /Concluiu as alterações\? Salve os benefícios/u);
  const heading = builder.slice(builder.indexOf('styles.sectionHeading'), builder.indexOf('aria-label="Adicionar benefício"'));
  assert.doesNotMatch(heading, /type="submit"/u);
  const footer = builder.slice(builder.lastIndexOf('styles.cards'), builder.indexOf('</form>'));
  assert.match(footer, /Salvar benefícios/u);
  assert.ok(footer.lastIndexOf('Salvar alterações') < footer.lastIndexOf('Salvar benefícios'));
});
