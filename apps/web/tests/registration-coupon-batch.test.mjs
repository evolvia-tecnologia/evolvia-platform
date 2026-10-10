import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('a tela de benefícios gera o lote e mostra os códigos', async () => {
  const [page, panel, css] = await Promise.all([
    read('../app/eventos/[id]/painel/inscricoes/beneficios/page.tsx'),
    read('../components/registration-coupon-batch.tsx'),
    read('../components/registration-coupon-batch.module.css'),
  ]);
  assert.match(page, /RegistrationBenefitsBuilder/u);
  assert.match(page, /RegistrationCouponBatch eventId=\{id\}/u);
  assert.match(panel, /Gerar cupons em quantidade/u);
  assert.match(panel, /registration-coupon-batches/u);
  assert.match(panel, /Copiar códigos/u);
  assert.match(css, /min-height:\s*var\(--space-44\)/u);
  assert.doesNotMatch(panel, /organizationId/u);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}/iu);
});
