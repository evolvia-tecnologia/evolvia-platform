import { expect, test } from '@playwright/test';
import {
  abrirEtiquetas, alvosDeToque, anexarJson, culpadosDeTransbordo,
  entrar, indicadorDeFoco, semRolagemHorizontal, temAutenticacao,
} from '../support/ambiente';
import { varrerAcessibilidade } from '../support/acessibilidade';
import { verificarWcagSemAxe } from '../support/wcag-proprio';
import { motivoDeSkip, temBarraDeFormatacao } from '../support/capacidades';

// Cobre o PR #614. Exercita a interface real, nao o texto do codigo-fonte.
//
// Seletores conferidos contra apps/web/components/credential-category-templates.tsx
// e apps/web/components/credential-label.tsx em 02/11/2026. Ver
// tests/e2e/SELETORES.md para a tabela completa de conferencia.
test.describe('Editor de etiquetas por categoria @autenticado', () => {
  test.skip(!temAutenticacao, 'Defina EVOLVIA_E2E_EMAIL, EVOLVIA_E2E_SENHA e EVOLVIA_E2E_EVENTO_ID.');

  test.beforeEach(async ({ page }) => {
    await entrar(page);
    await abrirEtiquetas(page);
  });

  // ---- presentes na base do #625 (develop): assercao integral ---------------

  test('campos, ordem e persistencia da selecao @gate-etiqueta', async ({ page }) => {
    const itens = page.locator('ol li');
    await expect(itens.first()).toBeVisible();
    const antes = await itens.allInnerTexts();
    expect(antes.length, 'o modelo inicial precisa trazer campos').toBeGreaterThan(1);

    // Descer o primeiro campo precisa trocar a ordem de verdade.
    await page.getByRole('button', { name: /^descer /iu }).first().click();
    const depois = await itens.allInnerTexts();
    expect(depois[0], 'descer o primeiro campo precisa alterar a ordem').not.toBe(antes[0]);

    await page.getByRole('button', { name: /salvar modelo da categoria/iu }).click();

    // Persistencia real: so o servidor confirma. Recarregar prova a gravacao.
    await page.reload();
    await abrirEtiquetas(page);
    const recarregado = await page.locator('ol li').allInnerTexts();
    expect(recarregado[0], 'a ordem salva precisa sobreviver ao recarregamento').toBe(depois[0]);
  });

  test('restaurar padrao devolve o modelo inicial', async ({ page }) => {
    await page.getByRole('button', { name: /^remover /iu }).first().click();
    const reduzido = await page.locator('ol li').count();
    await page.getByRole('button', { name: /restaurar padr(ã|a)o/iu }).click();
    expect(await page.locator('ol li').count(), 'restaurar precisa recompor os campos').toBeGreaterThan(reduzido);
  });

  test('a previa da etiqueta acompanha os campos escolhidos', async ({ page }) => {
    const previa = page.getByLabel('Prévia da etiqueta');
    await expect(previa).toBeVisible();
    const linhasAntes = await previa.locator('p').count();
    await page.getByRole('button', { name: /^remover /iu }).first().click();
    await expect(previa.locator('p')).toHaveCount(linhasAntes - 1);
  });

  /**
   * Corrigido em 03/11/2026. A versao anterior tinha DOIS defeitos.
   *
   * 1. VERDE FALSO na checagem de foco. Ela era:
   *
   *      getComputedStyle(el, ':focus-visible').outlineStyle
   *
   *    O segundo argumento de getComputedStyle e um pseudo-ELEMENTO
   *    (`::before`, `::marker`); `:focus-visible` e pseudo-CLASSE e nao e
   *    enderecavel por ali. Medido em Chromium: o retorno e um
   *    CSSStyleDeclaration vazio, entao `.outlineStyle` e `''`, e
   *    `'' !== 'none'` faz `.not.toBe('none')` passar SEMPRE -- inclusive num
   *    botao sem anel de foco nenhum. A assercao nao conseguia reprovar.
   *
   * 2. VERDE FALSO na parte de teclado. `press('Enter')` seguido de
   *    `expect(ol li).toBeVisible()` nao prova nada: a lista ja estava visivel
   *    antes da tecla. Um botao que ignorasse Enter passaria. Agora a
   *    assercao e sobre o EFEITO -- a ordem tem de mudar -- igual ao teste de
   *    clique logo acima.
   *
   * Ver support/ambiente.ts (indicadorDeFoco) para por que a manobra de
   * teclado e necessaria: depois do clique de mouse em entrar(), um .focus()
   * programatico nao casa :focus-visible, e ler o estilo real ali daria
   * vermelho falso num botao conforme.
   */
  test('ordem dos campos e operavel por teclado, com foco visivel', async ({ page }, testInfo) => {
    const descer = page.getByRole('button', { name: /^descer /iu }).first();

    const foco = await indicadorDeFoco(page, descer);
    await anexarJson(testInfo, 'indicador-de-foco.json', foco);

    expect(foco.focado,
      'a manobra focus -> Shift+Tab -> Tab precisa pousar no proprio botao; '
      + 'se pousou em outro, a ordem de tabulacao mudou e o seletor precisa '
      + 'ser reconferido').toBe(true);
    expect(foco.focusVisible,
      'alcancado por teclado, o botao precisa casar :focus-visible').toBe(true);
    expect(foco.diferencas,
      'nenhuma propriedade visual mudou ao focar por teclado: a tela nao tem '
      + 'indicador de foco (WCAG 2.2, criterios 2.4.7 e 2.4.11). Medido: '
      + JSON.stringify(foco.depois)).not.toEqual([]);

    // Operacao real: Enter precisa reordenar, nao so deixar a lista visivel.
    const antes = await page.locator('ol li').allInnerTexts();
    await page.keyboard.press('Enter');
    const depois = await page.locator('ol li').allInnerTexts();
    expect(depois[0],
      'Enter no botao "descer" precisa reordenar de verdade; conferir apenas '
      + 'que a lista continua visivel passaria sem o teclado operar nada')
      .not.toBe(antes[0]);
  });

  // ---- dependentes do PR #614: SKIP declarado se ausente --------------------

  test('controles de formatacao existem e persistem apos recarregar @gate-etiqueta', async ({ page }) => {
    const capacidade = await temBarraDeFormatacao(page);
    test.skip(!capacidade.presente, motivoDeSkip(capacidade));

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

    await page.reload();
    await abrirEtiquetas(page);
    const recarregado = page.locator('ol li').first();
    await expect(recarregado.getByLabel(/alinhamento de/iu)).toHaveValue('center');
    await expect(recarregado.getByRole('checkbox', { name: /negrito/iu })).toBeChecked();
    await expect(recarregado.getByLabel(/cor de/iu)).toHaveValue('#1d4ed8');
    await expect(recarregado.getByLabel(/tipo de fonte de/iu)).toHaveValue('serif');
    await expect(recarregado.getByLabel(/tamanho da fonte de/iu)).toHaveValue('3.5');
  });

  test('a previa reflete o estilo escolhido', async ({ page }) => {
    const capacidade = await temBarraDeFormatacao(page);
    test.skip(!capacidade.presente, motivoDeSkip(capacidade));

    const primeiro = page.locator('ol li').first();
    await primeiro.getByLabel(/alinhamento de/iu).selectOption('right');
    await primeiro.getByRole('checkbox', { name: /negrito/iu }).check();
    await primeiro.getByLabel(/cor de/iu).selectOption('#be123c');

    const linha = page.getByLabel('Prévia da etiqueta').locator('p').first();
    await expect(linha).toHaveCSS('text-align', 'right');
    await expect(linha).toHaveCSS('font-weight', '700');
    await expect(linha).toHaveCSS('color', 'rgb(190, 18, 60)');
  });

  // ---- acessibilidade ------------------------------------------------------

  test('verificacoes WCAG proprias do editor @a11y', async ({ page }, testInfo) => {
    // Independe de axe-core: roda sempre.
    await verificarWcagSemAxe(page, testInfo, 'editor-etiquetas');
  });

  test('varredura axe do editor @a11y', async ({ page }, testInfo) => {
    // SKIP declarado se axe-core nao estiver instalado. Ver INSTALACAO.md.
    await varrerAcessibilidade(page, testInfo, 'editor-etiquetas');
  });

  /**
   * O anexo antes se chamava achado e listava controles de 24x24 a 43x43, que
   * ESTAO conformes com 2.5.8 (AA) e so nao atingem a meta de 44px do
   * projeto. Evidencia que chama de falha o que passa ensina a ignorar o
   * anexo. Agora cada linha vem marcada e o anexo diz qual limiar e qual.
   */
  test('alvos de toque atendem ao minimo @a11y', async ({ page }, testInfo) => {
    const abaixoDaMeta = await alvosDeToque(page, 'ol');
    const reprovados = abaixoDaMeta.filter((c) => c.abaixoDe24);
    await anexarJson(testInfo, 'alvos-de-toque.json', {
      norma: '2.5.8 (AA): 24x24 CSS px -- reprova',
      meta: 'projeto: 44x44 CSS px -- nao reprova',
      reprovados,
      abaixoDaMetaSemReprovar: abaixoDaMeta.filter((c) => !c.abaixoDe24),
    });
    expect(reprovados,
      `Controles abaixo de 24x24px: ${JSON.stringify(reprovados)}`).toEqual([]);
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
