import { expect, test, type Page, type TestInfo } from '@playwright/test';

const PADROES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export type DisponibilidadeAxe =
  | { modo: 'pacote' }
  | { modo: 'injecao'; fonte: string }
  | { modo: 'ausente'; motivo: string };

const MOTIVO_AUSENTE = 'axe-core nao instalado. Rode `npm ci` em tests/e2e '
  + '(ou veja tests/e2e/INSTALACAO.md se o registro npm estiver inacessivel). '
  + 'As verificacoes de support/wcag-proprio.ts continuam valendo e sao independentes do axe.';

let cache: Promise<DisponibilidadeAxe> | null = null;

/**
 * axe-core e resolvido em tempo de execucao, nao por import estatico.
 *
 * Razao: o ambiente onde esta suite foi escrita nao alcanca o registro npm
 * (ver tests/e2e/INSTALACAO.md). Um import estatico derrubaria a suite inteira
 * na carga do modulo, transformando "dependencia ausente" em "tudo falhou", o
 * que e exatamente a confusao entre falha e bloqueio que queremos evitar.
 *
 * Com axe presente: a varredura roda e pode reprovar.
 * Sem axe: o teste e marcado SKIP com motivo explicito. Nunca passa vazio.
 *
 * Usa import() dinamico, nao createRequire(import.meta.url): o executor do
 * Playwright transpila estes arquivos para CommonJS, onde import.meta nao
 * existe e quebraria a carga do modulo.
 */
export function axeDisponivel(): Promise<DisponibilidadeAxe> {
  cache ??= (async (): Promise<DisponibilidadeAxe> => {
    try {
      await import('@axe-core/playwright');
      return { modo: 'pacote' };
    } catch { /* segue para a injecao manual */ }
    try {
      const axe = await import('axe-core');
      const fonte = (axe as unknown as { source?: string; default?: { source?: string } }).source
        ?? (axe as unknown as { default?: { source?: string } }).default?.source;
      if (fonte) return { modo: 'injecao', fonte };
    } catch { /* indisponivel */ }
    return { modo: 'ausente', motivo: MOTIVO_AUSENTE };
  })();
  return cache;
}

/**
 * Varredura axe. Falha somente em violacao serious/critical no gate inicial;
 * as demais ficam anexadas ao relatorio para triagem, sem mascarar nada.
 */
export async function varrerAcessibilidade(page: Page, testInfo: TestInfo, contexto: string) {
  const disponibilidade = await axeDisponivel();
  test.skip(disponibilidade.modo === 'ausente', disponibilidade.modo === 'ausente' ? disponibilidade.motivo : '');

  let violacoes: Array<{ id: string; impact?: string | null; help: string; nodes: Array<{ target?: string[] }> }>;

  if (disponibilidade.modo === 'pacote') {
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    const resultado = await new AxeBuilder({ page }).withTags(PADROES).analyze();
    violacoes = resultado.violations;
  } else {
    await page.addScriptTag({ content: (disponibilidade as { fonte: string }).fonte });
    violacoes = await page.evaluate(async (tags) => {
      const resultado = await (window as unknown as {
        axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: unknown[] }> };
      }).axe.run(document, { runOnly: { type: 'tag', values: tags } });
      return resultado.violations as never;
    }, PADROES);
  }

  await testInfo.attach(`axe-${contexto}.json`, {
    body: JSON.stringify({ modo: disponibilidade.modo, violacoes }, null, 2),
    contentType: 'application/json',
  });

  const bloqueantes = violacoes.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const resumo = bloqueantes
    .map((v) => `${v.id} (${v.impact}, ${v.nodes.length}x): ${v.help}\n    ${v.nodes[0]?.target?.join(' ') ?? ''}`)
    .join('\n  ');
  expect(bloqueantes, `Violacoes serious/critical em ${contexto} (axe via ${disponibilidade.modo}):\n  ${resumo}`)
    .toEqual([]);
  return violacoes;
}
