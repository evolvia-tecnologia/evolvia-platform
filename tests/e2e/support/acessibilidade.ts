import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type TestInfo } from '@playwright/test';

const PADROES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Varredura axe. Falha somente em violacao serious/critical para o gate inicial;
 * as demais ficam anexadas ao relatorio para triagem, sem mascarar nada.
 */
export async function varrerAcessibilidade(page: Page, testInfo: TestInfo, contexto: string) {
  const resultado = await new AxeBuilder({ page }).withTags(PADROES).analyze();
  await testInfo.attach(`axe-${contexto}.json`, {
    body: JSON.stringify(resultado.violations, null, 2),
    contentType: 'application/json',
  });
  const bloqueantes = resultado.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const resumo = bloqueantes
    .map((v) => `${v.id} (${v.impact}, ${v.nodes.length}x): ${v.help}\n    ${v.nodes[0]?.target?.join(' ')}`)
    .join('\n  ');
  expect(bloqueantes, `Violacoes serious/critical em ${contexto}:\n  ${resumo}`).toEqual([]);
  return resultado.violations;
}
