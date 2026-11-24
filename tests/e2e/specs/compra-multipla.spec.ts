import { expect, test } from '@playwright/test';
import {
  alvosDeToque, ambiente, anexarJson, culpadosDeTransbordo,
  semRolagemHorizontal, temEventoPago,
} from '../support/ambiente';
import { varrerAcessibilidade } from '../support/acessibilidade';

/**
 * Cobre o PR #471 (G2.10). NENHUM teste conclui pagamento: a suite para na
 * reserva e na conferencia do estado. Nao acionar gateway, nem sandbox, sem
 * autorizacao explicita e credenciais proprias.
 */
const rota = () => `/evento/${encodeURIComponent(ambiente.eventoSlugPago)}/inscricao/grupo`;

test.describe('Compra multipla @publico', () => {
  test.skip(!temEventoPago, 'Defina EVOLVIA_E2E_EVENTO_SLUG_PAGO com um evento publicado e pago.');

  test('a pagina exige de 2 a 10 participantes', async ({ page }) => {
    await page.goto(rota());
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('fieldset legend').filter({ hasText: /participante 1/iu })).toBeVisible();
    await expect(page.locator('fieldset legend').filter({ hasText: /participante 2/iu })).toBeVisible();

    const remover = page.getByRole('button', { name: /remover (ú|u)ltimo/iu });
    await expect(remover).toBeDisabled();

    const adicionar = page.getByRole('button', { name: /adicionar participante/iu });
    for (let i = 2; i < 10; i += 1) await adicionar.click();
    await expect(page.locator('fieldset legend').filter({ hasText: /participante 10/iu })).toBeVisible();
    await expect(adicionar).toBeDisabled();
  });

  test('documentos repetidos sao recusados antes de qualquer reserva', async ({ page }) => {
    await page.goto(rota());
    const requisicoes: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/registration/orders')) requisicoes.push(req.url());
    });

    const fichas = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: /participante/iu }) });
    for (const indice of [0, 1]) {
      const ficha = fichas.nth(indice);
      const categoria = ficha.getByLabel(/^categoria$/iu);
      await categoria.selectOption({ index: 1 });
      await ficha.getByLabel(/^lote$/iu).selectOption({ index: 1 });
      const documento = ficha.getByLabel(/documento|cpf|passaporte/iu).first();
      if (await documento.count()) await documento.fill('52998224725');
      await ficha.getByRole('checkbox', { name: /aceito os termos/iu }).check();
    }
    await page.getByRole('button', { name: /calcular valor/iu }).click();
    await expect(page.getByRole('alert').filter({ hasText: /documento diferente/iu })).toBeVisible();
    expect(requisicoes, 'nenhuma reserva pode ser enviada com documentos repetidos').toEqual([]);
  });

  test('varredura axe da compra multipla @a11y', async ({ page }, testInfo) => {
    await page.goto(rota());
    await varrerAcessibilidade(page, testInfo, 'compra-multipla');
  });

  test('alvos de toque na compra multipla @a11y', async ({ page }, testInfo) => {
    await page.goto(rota());
    const pequenos = await alvosDeToque(page, 'main');
    await anexarJson(testInfo, 'alvos-compra-multipla.json', pequenos);
    expect(pequenos.filter((c) => c.largura < 24 || c.altura < 24)).toEqual([]);
  });
});

test.describe('Compra multipla em telas estreitas @publico @responsivo', () => {
  test.skip(!temEventoPago, 'Defina EVOLVIA_E2E_EVENTO_SLUG_PAGO.');
  for (const largura of [320, 390]) {
    test(`sem rolagem horizontal em ${largura}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: largura, height: 740 });
      await page.goto(rota());
      const { scrollWidth, innerWidth } = await semRolagemHorizontal(page);
      const culpados = await culpadosDeTransbordo(page);
      await anexarJson(testInfo, `transbordo-grupo-${largura}px.json`, { scrollWidth, innerWidth, culpados });
      expect(scrollWidth, `Transbordo em ${largura}px: ${culpados.join(', ')}`).toBeLessThanOrEqual(innerWidth + 1);
    });
  }
});
