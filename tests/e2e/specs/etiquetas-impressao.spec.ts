import { expect, test } from '@playwright/test';
import { ambiente, anexarJson, entrar, temAutenticacao } from '../support/ambiente';
import {
  espiarImpressao, medirCamadas, tentarImprimir, verificarEspiao,
} from '../support/impressao';

/**
 * Regressao dos achados B1 e B2 da auditoria do PR #614.
 *
 * NAO HA DETECCAO DE CAPACIDADE AQUI, de proposito
 * ------------------------------------------------
 * Decisao do PO de 04/11/2026: impressao de etiqueta ilegivel e **FAIL
 * funcional, nao SKIP**. A versao anterior deste arquivo pulava quando
 * `data-fit-warning` nao existia, com a mensagem "a combinacao ainda coube; use
 * um papel menor" -- motivo ERRADO, que mandava a proxima pessoa mexer no papel
 * da fixture quando o que faltava era o mecanismo inteiro.
 *
 * O unico SKIP que sobra e o de credenciais: ambiente ausente nao e defeito do
 * produto. Capacidade ausente, aqui, e.
 *
 * O que mudou em relacao a versao anterior
 * ----------------------------------------
 * 1. Saiu do EDITOR para o CAMINHO DE IMPRESSAO. `DeskMode` tem `labels` e
 *    `print` como modos MUTUAMENTE EXCLUSIVOS (event-desk.tsx), e
 *    `abrirEtiquetas()` vai para `#etiquetas` = modo `labels`. Ou seja: a
 *    versao antiga afirmava a ausencia de `Etiqueta para impressao` numa secao
 *    onde o caminho de impressao nunca esta no DOM. Dava zero por construcao,
 *    e passaria igual se o produto imprimisse etiquetas ilegiveis.
 *
 * 2. Saiu `Control+KeyP` como gatilho. Medido em Chromium: o atalho e tratado
 *    no nivel do navegador e NAO chega ao `window.print` da pagina, logo
 *    `expect(chamadas).toEqual([])` depois dele passava sempre. O #614
 *    implementa `preventDefault` num keydown de captura, entao a camada e
 *    aferida por evento sintetico, como o Gemini sugeriu na thread
 *    r4441723159.
 *
 * 3. As quatro camadas sao aferidas, nao uma. Ver support/impressao.ts.
 *
 * 4. Ha CONTRAPROVA obrigatoria. Sem ela, "nao imprimiu" e indistinguivel de
 *    "nada funciona": um botao quebrado passaria no caso negativo.
 */
test.describe('Bloqueio de impressao de etiqueta ilegivel @autenticado', () => {
  test.skip(!temAutenticacao, 'Defina EVOLVIA_E2E_EMAIL, EVOLVIA_E2E_SENHA e EVOLVIA_E2E_EVENTO_ID.');

  test('as quatro camadas do bloqueio, e a contraprova @gate-etiqueta', async ({ page }, testInfo) => {
    // O espiao precisa existir ANTES da navegacao: addInitScript roda em
    // documento novo. Instalar depois do goto mede o nada.
    const { chamadas } = await espiarImpressao(page);

    await entrar(page);
    await page.goto(`/eventos/${encodeURIComponent(ambiente.eventoId)}/painel/check-in#impressao`);

    // Primeiro prova que o instrumento funciona. Sem isto, qualquer "0 chamadas"
    // seria inconclusivo -- foi o furo que me pegou na primeira medicao.
    await verificarEspiao(page, chamadas);

    const antes = await medirCamadas(page, chamadas);
    await tentarImprimir(page);
    const depois = await medirCamadas(page, chamadas);
    await anexarJson(testInfo, 'camadas-de-impressao.json', { antes, depois });

    if (antes.fitWarning) {
      // ETIQUETA ILEGIVEL: as quatro camadas sao obrigatorias.
      expect(depois.chamadasDePrint,
        'a etiqueta esta marcada como ilegivel (data-fit-warning="true") e '
        + 'window.print FOI chamado. Na develop isso acontece sozinho, dois '
        + 'frames depois de o crachá ser selecionado, sem portao algum: o '
        + 'participante recebe um crachá com texto encolhido a 45%. '
        + 'Camada 1 do #614: o efeito de auto-print precisa abortar quando '
        + 'fitWarning.').toBe(0);

      expect(depois.superficieMontada,
        'com a etiqueta ilegivel, "Etiqueta para impressao" nao pode existir no '
        + 'DOM. Camada 4 do #614: o <CredentialLabel> sem preview nao e '
        + 'renderizado.').toBe(0);

      expect(antes.botaoDesabilitado,
        'o botao "Imprimir etiqueta" precisa ficar desabilitado enquanto a '
        + 'etiqueta for ilegivel. Camada 4 do #614.').toBe(true);

      expect(antes.atalhoBloqueado,
        'Ctrl/Cmd+P precisa receber preventDefault enquanto a etiqueta for '
        + 'ilegivel: o atalho do navegador nao passa pelo botao desabilitado. '
        + 'Camada 2 do #614.').toBe(true);

      expect(antes.guardaDeMidia,
        'falta o <style data-evolvia-invalid-label-print-guard> com '
        + '@media print { visibility: hidden }. Camada 3 do #614: se o dialogo '
        + 'nativo abrir por outro caminho, a midia impressa tem de sair vazia.')
        .toBeGreaterThan(0);

      expect(antes.avisoVisivel,
        'o bloqueio precisa EXPLICAR o motivo ao operador, com role=alert. '
        + 'Bloquear em silencio faz o posto de credenciamento parar sem que '
        + 'ninguem saiba por que.').toBe(true);
    } else {
      // CONTRAPROVA: etiqueta legivel imprime. Sem este ramo, o ramo de cima
      // passaria num produto que simplesmente nunca imprime nada.
      expect(depois.chamadasDePrint,
        'a etiqueta esta legivel (data-fit-warning="false") e a impressao NAO '
        + 'aconteceu. O bloqueio nao pode pegar etiqueta boa: isso para o '
        + 'credenciamento. Esta assercao e a contraprova do ramo ilegivel.')
        .toBeGreaterThan(0);

      expect(depois.superficieMontada,
        'com a etiqueta legivel, "Etiqueta para impressao" precisa estar montada')
        .toBeGreaterThan(0);

      expect(antes.botaoDesabilitado,
        'com a etiqueta legivel, o botao de imprimir nao pode estar desabilitado')
        .toBe(false);

      expect(antes.atalhoBloqueado,
        'com a etiqueta legivel, Ctrl+P nao deve ser bloqueado').toBe(false);
    }
  });
});
