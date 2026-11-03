import { expect, test } from '@playwright/test';
import { abrirEtiquetas, entrar, temAutenticacao } from '../support/ambiente';
import { motivoDeSkip, temAvisoDeAjuste } from '../support/capacidades';

/**
 * Regressao dos achados B1 e B2 da auditoria do PR #614.
 * Nenhum teste aqui aciona impressora fisica: eles verificam que a superficie
 * imprimivel nao e montada e que window.print nao e chamado.
 *
 * Conferencia de 03/11/2026 contra apps/web/components/credential-label.tsx
 * na develop -- e o que ela mudou neste arquivo
 * -----------------------------------------------------------------------
 * Dois seletores CONFEREM:
 *
 *     aria-label={preview ? 'Previa da etiqueta' : 'Etiqueta para impressao'}
 *
 * Um NAO existe: `data-fit-warning`. Os atributos do componente hoje sao
 * `data-qr` e `data-barcode`. Nao ha aviso de ajuste, e nao ha bloqueio de
 * impressao: a develop **encolhe o texto em silencio** e imprime.
 *
 *     const scale = Math.min(1, Math.max(.45, availableHeight / textHeight));
 *
 * O piso de 0.45 e a prova: uma etiqueta sobrecarregada e reduzida a 45% e
 * segue para a impressora, sem avisar ninguem. A protecao que estes testes
 * verificam e justamente o que o PR #614 traz.
 *
 * Por isso os dois testes mudaram:
 *
 * 1. O primeiro saturava os campos com
 *        itens.nth(i).getByLabel(/tamanho da fonte de/iu)
 *    dentro de `if (await tamanho.count())`. Esse controle chega com o #614,
 *    entao o laco nao fazia nada, o alerta nunca aparecia e caia-se em
 *        test.skip(true, 'A combinacao ... ainda coube ...; use um papel menor')
 *    Mensagem ERRADA: a combinacao nao "coube", o mecanismo de aviso nao
 *    existe. Quem lesse esse SKIP iria mexer no tamanho do papel da fixture e
 *    nao chegaria a lugar nenhum. SKIP com motivo errado e pior que vermelho:
 *    manda a proxima pessoa para o caminho errado.
 *
 * 2. O segundo afirmava, sem condicao,
 *        await expect(previa).toHaveAttribute('data-fit-warning', 'false');
 *    Isso REPROVA na develop, culpando o produto por um atributo que o #614
 *    ainda vai introduzir.
 *
 * Agora os dois declaram SKIP com a dependencia nomeada (#614) e voltam a
 * valer integralmente quando a capacidade chegar. A assercao nao foi afrouxada
 * em nenhum ponto -- o que mudou foi de quem e a culpa quando falta capacidade.
 */
test.describe('Bloqueio de impressao ilegivel @autenticado', () => {
  test.skip(!temAutenticacao, 'Defina as credenciais de homologacao.');

  test.beforeEach(async ({ page }) => {
    await entrar(page);
    await abrirEtiquetas(page);
    const capacidade = await temAvisoDeAjuste(page);
    test.skip(!capacidade.presente, motivoDeSkip(capacidade));
  });

  test('etiqueta ilegivel nao monta superficie de impressao nem chama print @gate-etiqueta', async ({ page }) => {
    const chamadas: string[] = [];
    await page.exposeFunction('registrarPrint', () => { chamadas.push('print'); });
    await page.addInitScript(() => {
      const original = window.print;
      window.print = function substituto() {
        (window as unknown as { registrarPrint: () => void }).registrarPrint();
        void original;
      };
    });
    await page.reload();

    // Satura a etiqueta: todos os campos na maior fonte disponivel.
    const itens = page.locator('ol li');
    const total = await itens.count();
    expect(total, 'o editor precisa listar ao menos um campo da etiqueta').toBeGreaterThan(0);

    let saturados = 0;
    for (let i = 0; i < total; i += 1) {
      const tamanho = itens.nth(i).getByLabel(/tamanho da fonte de/iu);
      if (await tamanho.count()) { await tamanho.selectOption('6'); saturados += 1; }
    }
    /**
     * Sem esta contagem o teste seguia adiante tendo saturado ZERO campos e
     * concluia que "ainda coube". Se a barra de formatacao existe, ela precisa
     * expor o tamanho da fonte; se nao expoe, isso e defeito, nao ausencia.
     */
    expect(saturados,
      'nenhum campo ofereceu "tamanho da fonte": a barra de formatacao esta '
      + 'presente mas incompleta. Sem saturar a etiqueta este teste nao testa '
      + 'nada e daria verde por omissao.').toBeGreaterThan(0);

    const alerta = page.getByRole('alert').filter({ hasText: /pode n(ã|a)o caber|n(ã|a)o est(á|a) dispon(í|i)vel/iu });
    await expect(alerta.first(),
      `saturei ${saturados} campos na maior fonte e nenhum aviso apareceu. `
      + 'Com a capacidade presente, o aviso de etiqueta ilegivel e obrigatorio: '
      + 'a develop encolhe o texto a 45% (piso do `scale` em '
      + 'credential-label.tsx) e imprime sem avisar.').toBeVisible();

    // A superficie de impressao nao pode existir no DOM.
    await expect(page.getByLabel('Etiqueta para impressão'),
      'com a etiqueta ilegivel, a superficie de impressao nao pode ser montada')
      .toHaveCount(0);

    await page.keyboard.press('Control+KeyP');
    await page.waitForTimeout(500);
    expect(chamadas, 'o navegador nao pode imprimir uma etiqueta bloqueada').toEqual([]);
  });

  test('etiqueta valida libera a superficie de impressao @gate-etiqueta', async ({ page }) => {
    // 'Previa da etiqueta' e 'Etiqueta para impressao' sao os aria-label reais
    // de credential-label.tsx, conferidos na develop. `data-fit-warning` nao e:
    // ele chega com o #614, e o beforeEach acima ja pulou se faltar.
    const previa = page.getByLabel('Prévia da etiqueta');
    await expect(previa).toBeVisible();
    await expect(previa,
      'com a etiqueta dentro do limite, o aviso de ajuste precisa estar em '
      + 'false -- e o contraponto do teste acima; sem ele, um componente que '
      + 'avisasse sempre passaria no primeiro caso.')
      .toHaveAttribute('data-fit-warning', 'false');
  });
});
