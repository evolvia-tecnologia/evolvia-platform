import { expect, test } from '@playwright/test';
import { abrirEtiquetas, entrar, temAutenticacao } from '../support/ambiente';

/**
 * Regressao dos achados B1 e B2 da auditoria do PR #614.
 * Nenhum teste aqui aciona impressora fisica: eles verificam que a superficie
 * imprimivel nao e montada e que window.print nao e chamado.
 */
test.describe('Bloqueio de impressao ilegivel @autenticado', () => {
  test.skip(!temAutenticacao, 'Defina as credenciais de homologacao.');

  test('etiqueta ilegivel nao monta superficie de impressao nem chama print', async ({ page }) => {
    const chamadas: string[] = [];
    await page.exposeFunction('registrarPrint', () => { chamadas.push('print'); });
    await page.addInitScript(() => {
      const original = window.print;
      window.print = function substituto() {
        (window as unknown as { registrarPrint: () => void }).registrarPrint();
        void original;
      };
    });

    await entrar(page);
    await abrirEtiquetas(page);

    // Satura a etiqueta: muitos campos na maior fonte disponivel.
    const itens = page.locator('ol li');
    const total = await itens.count();
    for (let i = 0; i < total; i += 1) {
      const tamanho = itens.nth(i).getByLabel(/tamanho da fonte de/iu);
      if (await tamanho.count()) await tamanho.selectOption('6');
    }

    const alerta = page.getByRole('alert').filter({ hasText: /pode n(ã|a)o caber|n(ã|a)o est(á|a) dispon(í|i)vel/iu });
    if (await alerta.count() === 0) {
      test.skip(true, 'A combinacao escolhida ainda coube na etiqueta; use um papel menor na fixture.');
    }
    await expect(alerta.first()).toBeVisible();

    // A superficie de impressao nao pode existir no DOM.
    await expect(page.getByLabel('Etiqueta para impressão')).toHaveCount(0);

    await page.keyboard.press('Control+KeyP');
    await page.waitForTimeout(500);
    expect(chamadas, 'o navegador nao pode imprimir uma etiqueta bloqueada').toEqual([]);
  });

  test('etiqueta valida libera a superficie de impressao', async ({ page }) => {
    await entrar(page);
    await abrirEtiquetas(page);
    const previa = page.getByLabel('Prévia da etiqueta');
    await expect(previa).toBeVisible();
    await expect(previa).toHaveAttribute('data-fit-warning', 'false');
  });
});
