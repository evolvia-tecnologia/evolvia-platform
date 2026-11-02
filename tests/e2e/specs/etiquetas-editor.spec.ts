import { expect, test } from '@playwright/test';
import {
  abrirEtiquetas, alvosDeToque, anexarJson, culpadosDeTransbordo,
  entrar, semRolagemHorizontal, temAutenticacao,
} from '../support/ambiente';
import { varrerAcessibilidade } from '../support/acessibilidade';

// Cobre o PR #614. Exercita a interface real, nao o texto do codigo-fonte.
test.describe('Editor de etiquetas por categoria @autenticado', () => {
  test.skip(!temAutenticacao, 'Defina EVOLVIA_E2E_EMAIL, EVOLVIA_E2E_SENHA e EVOLVIA_E2E_EVENTO_ID.');

  test.beforeEach(async ({ page }) => {
    await entrar(page);
    await abrirEtiquetas(page);
  });

  test('controles de formatacao existem e persistem apos recarregar @a11y', async ({ page }) => {
    const primeiro = page.locator('ol li').first();
    const alinhamento = primeiro.getByLabel(/alinhamento de/iu);
    const negrito = primeiro.getByRole('checkbox', { name: /negrito/iu });
    const cor = primeiro.getByLabel(/cor de/iu);
    const fonte = primeiro.getByLabel(/tipo de fonte de/iu);
    const tamanho = primeiro.getByLabel(/tamanho da fonte de/iu);

    for (const controle of [alinhamento, negrito, cor, fonte, tamanho]) {
      await expect(controle).toBeVisible();
    }

    await alinhamento.selectOption('center');
    await negrito.check();
    await cor.selectOption('#1d4ed8');
    await fonte.selectOption('serif');
    await tamanho.selectOption('3.5');
    await page.getByRole('button', { name: /salvar modelo da categoria/iu }).click();
    await expect(page.getByRole('status').filter({ hasText: /modelo de etiqueta salvo/iu })).toBeVisible();

    // Persistencia real: so o servidor confirma. Recarregar prova a gravacao.
    await page.reload();
    await abrirEtiquetas(page);
    const recarregado = page.locator('ol li').first();
    await expect(recarregado.getByLabel(/alinhamento de/iu)).toHaveValue('center');
    await expect(recarregado.getByRole('checkbox', { name: /negrito/iu })).toBeChecked();
    await expect(recarregado.getByLabel(/cor de/iu)).toHaveValue('#1d4ed8');
    await expect(recarregado.getByLabel(/tipo de fonte de/iu)).toHaveValue('serif');
    await expect(recarregado.getByLabel(/tamanho da fonte de/iu)).toHaveValue('3.5');
  });

  test('a previa reflete o estilo escolhido @a11y', async ({ page }) => {
    const primeiro = page.locator('ol li').first();
    await primeiro.getByLabel(/alinhamento de/iu).selectOption('right');
    await primeiro.getByRole('checkbox', { name: /negrito/iu }).check();
    await primeiro.getByLabel(/cor de/iu).selectOption('#be123c');

    const previa = page.getByLabel('Prévia da etiqueta');
    const linha = previa.locator('p').first();
    await expect(linha).toHaveCSS('text-align', 'right');
    await expect(linha).toHaveCSS('font-weight', '700');
    await expect(linha).toHaveCSS('color', 'rgb(190, 18, 60)');
  });

  test('ordem dos campos e navegavel por teclado @a11y', async ({ page }) => {
    const subir = page.getByRole('button', { name: /^subir /iu }).nth(1);
    await subir.focus();
    await expect(subir).toBeFocused();
    const contorno = await subir.evaluate((el) => getComputedStyle(el, ':focus-visible').outlineStyle);
    expect(contorno, 'o foco precisa ter contorno visivel').not.toBe('none');
    await page.keyboard.press('Enter');
    await expect(page.locator('ol li').first()).toBeVisible();
  });

  test('varredura axe do editor @a11y', async ({ page }, testInfo) => {
    await varrerAcessibilidade(page, testInfo, 'editor-etiquetas');
  });

  test('alvos de toque atendem ao minimo @a11y', async ({ page }, testInfo) => {
    const pequenos = await alvosDeToque(page, 'ol');
    await anexarJson(testInfo, 'alvos-abaixo-de-44px.json', pequenos);
    // Criterio 2.5.8 (AA) exige 24px; 44px e a meta declarada do projeto.
    const abaixoDoMinimoWcag = pequenos.filter((c) => c.largura < 24 || c.altura < 24);
    expect(abaixoDoMinimoWcag, `Controles abaixo de 24x24px: ${JSON.stringify(abaixoDoMinimoWcag)}`).toEqual([]);
  });
});

test.describe('Editor de etiquetas em telas estreitas @autenticado @responsivo', () => {
  test.skip(!temAutenticacao, 'Defina as credenciais de homologacao.');

  for (const largura of [320, 390]) {
    test(`sem rolagem horizontal em ${largura}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: largura, height: 740 });
      await entrar(page);
      await abrirEtiquetas(page);
      const { scrollWidth, innerWidth } = await semRolagemHorizontal(page);
      const culpados = await culpadosDeTransbordo(page);
      await anexarJson(testInfo, `transbordo-${largura}px.json`, { scrollWidth, innerWidth, culpados });
      expect(scrollWidth, `Transbordo em ${largura}px. Elementos: ${culpados.join(', ')}`)
        .toBeLessThanOrEqual(innerWidth + 1);
    });
  }
});
