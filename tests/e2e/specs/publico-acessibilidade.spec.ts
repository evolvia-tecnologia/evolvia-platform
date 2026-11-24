import { expect, test } from '@playwright/test';
import {
  ambiente, anexarJson, culpadosDeTransbordo, semRolagemHorizontal, temEventoPublico,
} from '../support/ambiente';
import { varrerAcessibilidade } from '../support/acessibilidade';

// Superficies publicas do Gate 1, onde o aceite humano de WCAG segue pendente.
const paginas: Array<{ nome: string; caminho: () => string; exige?: () => boolean }> = [
  { nome: 'home', caminho: () => '/' },
  { nome: 'catalogo', caminho: () => '/eventos' },
  { nome: 'login', caminho: () => '/login' },
  { nome: 'acessibilidade', caminho: () => '/acessibilidade' },
  { nome: 'evento', caminho: () => `/evento/${encodeURIComponent(ambiente.eventoSlug)}`, exige: () => temEventoPublico },
];

test.describe('Acessibilidade das superficies publicas @publico @a11y', () => {
  for (const pagina of paginas) {
    test(`axe em ${pagina.nome}`, async ({ page }, testInfo) => {
      test.skip(Boolean(pagina.exige) && !pagina.exige!(), 'Defina EVOLVIA_E2E_EVENTO_SLUG.');
      await page.goto(pagina.caminho());
      await varrerAcessibilidade(page, testInfo, pagina.nome);
    });
  }

  test('o link de pular para o conteudo funciona', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const pular = page.getByRole('link', { name: /pular para/iu }).first();
    if (await pular.count() === 0) test.skip(true, 'Pagina sem skip-link.');
    await expect(pular).toBeFocused();
  });
});

test.describe('Reflow das superficies publicas @publico @responsivo', () => {
  for (const pagina of paginas) {
    for (const largura of [320, 390]) {
      test(`${pagina.nome} sem rolagem horizontal em ${largura}px`, async ({ page }, testInfo) => {
        test.skip(Boolean(pagina.exige) && !pagina.exige!(), 'Defina EVOLVIA_E2E_EVENTO_SLUG.');
        await page.setViewportSize({ width: largura, height: 740 });
        await page.goto(pagina.caminho());
        const { scrollWidth, innerWidth } = await semRolagemHorizontal(page);
        const culpados = await culpadosDeTransbordo(page);
        await anexarJson(testInfo, `transbordo-${pagina.nome}-${largura}px.json`, { scrollWidth, innerWidth, culpados });
        expect(scrollWidth, `Transbordo em ${largura}px: ${culpados.join(', ')}`).toBeLessThanOrEqual(innerWidth + 1);
      });
    }
  }
});
