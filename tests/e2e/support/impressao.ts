import { expect, type Page } from '@playwright/test';

/**
 * Aferção do bloqueio de impressão de etiqueta ilegível.
 *
 * Decisão do PO, 04/11/2026: impressão de etiqueta ilegível é **FAIL
 * funcional, não SKIP**. Então este módulo não tem detecção de capacidade: se
 * a proteção não existir no ambiente, o teste reprova e a falha é a evidência.
 *
 * Conferido em 04/11/2026 contra a branch do PR #614
 * (`codex/credential-label-format-20261028`, HEAD `46859dd0`), em
 * `credential-label.tsx` e `event-desk.tsx`. A proteção tem QUATRO camadas, e
 * verificar só uma deixaria três sem cobertura:
 *
 *   1. a impressão automática aborta:
 *        if (badge && credentialLabelLayout(badge).fitWarning) return;
 *   2. Ctrl/Cmd+P recebe preventDefault, em fase de captura
 *   3. um <style data-evolvia-invalid-label-print-guard> instala
 *        @media print { body, body * { visibility: hidden !important } }
 *   4. o botão `Imprimir etiqueta` fica disabled, o onClick revalida, e o
 *      <CredentialLabel> sem `preview` não é renderizado -- logo
 *      `Etiqueta para impressão` não existe no DOM
 *
 * Na `develop` nenhuma das quatro existe: o componente encolhe o texto até 45%
 * (`Math.max(.45, …)`) e `window.print()` é chamado dois frames depois de o
 * crachá ser selecionado, sem portão algum. No #614 o piso é `.24` e o portão
 * corta em `estimatedFitRatio < .65`.
 *
 * Contraprova em fixture/impressao.cjs, variante `sem-guarda`, que reproduz a
 * develop: aviso presente e nada bloqueado. Sem ela não há como mostrar que
 * este teste reprova quando a proteção falta.
 */

export type Camadas = {
  fitWarning: boolean;
  avisoVisivel: boolean;
  botaoDesabilitado: boolean;
  superficieMontada: number;
  guardaDeMidia: number;
  atalhoBloqueado: boolean;
  chamadasDePrint: number;
};

/**
 * Instala o espião de `window.print` ANTES de qualquer navegação.
 *
 * Tem de ser chamado antes do `goto`: `addInitScript` roda em documento novo, e
 * `page.setContent` não dispara navegação. Eu perdi uma medição por isso --
 * a sonda dizia "não chamou" porque o substituto nunca havia sido instalado, e
 * só a contraprova (a própria página chamando `print()`) revelou o furo.
 * Por isso `verificarEspiao` existe e é chamado pelo spec.
 */
export async function espiarImpressao(page: Page): Promise<{ chamadas: string[] }> {
  const chamadas: string[] = [];
  await page.exposeFunction('registrarPrint', () => { chamadas.push('print'); });
  await page.addInitScript(() => {
    window.print = function substituto() {
      (window as unknown as { registrarPrint: () => void }).registrarPrint();
    };
  });
  return { chamadas };
}

/** Confere que o espião está instalado. Sem isto, "não imprimiu" não vale nada. */
export async function verificarEspiao(page: Page, chamadas: string[]): Promise<void> {
  const antes = chamadas.length;
  await page.evaluate(() => window.print());
  expect(chamadas.length,
    'o espiao de window.print nao esta instalado: chamei print() diretamente e '
    + 'nada foi registrado. Sem o espiao, "nao imprimiu" e indistinguivel de '
    + '"nao mediu". Confira se espiarImpressao() foi chamado ANTES do goto.')
    .toBe(antes + 1);
  chamadas.length = antes;
}

const PREVIA = 'Prévia da etiqueta';
const SUPERFICIE = 'Etiqueta para impressão';
const BOTAO = /^imprimir etiqueta$/iu;

/** Mede as quatro camadas no estado atual da tela. */
export async function medirCamadas(page: Page, chamadas: string[]): Promise<Camadas> {
  const previa = page.getByLabel(PREVIA).first();
  await expect(previa,
    `a tela precisa mostrar "${PREVIA}" para que este teste tenha o que medir. `
    + 'Se nao mostra, o crachá nao foi selecionado e a verificacao do gate nao '
    + 'aconteceu -- nao e aprovacao.').toBeVisible({ timeout: 20_000 });

  const fit = await previa.getAttribute('data-fit-warning');
  expect(fit,
    'a previa precisa expor data-fit-warning. Na develop o atributo nao existe, '
    + 'e isso e exatamente o defeito que este gate cobre: sem o marcador nao ha '
    + 'portao de legibilidade nenhum.').not.toBeNull();

  // Ctrl+P sintetico, em captura: observa se alguem chamou preventDefault.
  // Este e o mecanismo que o #614 implementa, e foi o que o Gemini apontou na
  // thread r4441723159. O atalho real do navegador nao chega a window.print,
  // entao espionar print() sozinho nao cobriria esta camada.
  const atalhoBloqueado = await page.evaluate(() => {
    const ev = new KeyboardEvent('keydown', {
      key: 'p', ctrlKey: true, cancelable: true, bubbles: true,
    });
    window.dispatchEvent(ev);
    return ev.defaultPrevented;
  });

  return {
    fitWarning: fit === 'true',
    avisoVisivel: await page.getByRole('alert')
      .filter({ hasText: /pode n(ã|a)o caber|n(ã|a)o est(á|a) dispon(í|i)vel|sem campos preenchidos/iu })
      .first().isVisible().catch(() => false),
    botaoDesabilitado: await page.getByRole('button', { name: BOTAO }).first().isDisabled(),
    superficieMontada: await page.getByLabel(SUPERFICIE).count(),
    guardaDeMidia: await page.locator('style[data-evolvia-invalid-label-print-guard]').count(),
    atalhoBloqueado,
    chamadasDePrint: chamadas.length,
  };
}

/** Aciona o botão de impressão, mesmo desabilitado, para provar que nada sai. */
export async function tentarImprimir(page: Page): Promise<void> {
  const botao = page.getByRole('button', { name: BOTAO }).first();
  // `force` de propósito: um botao desabilitado nao recebe clique real, e o que
  // se quer provar e que nem forcando sai impressao.
  await botao.click({ force: true }).catch(() => { /* desabilitado: esperado */ });
  await page.waitForTimeout(200);
}
