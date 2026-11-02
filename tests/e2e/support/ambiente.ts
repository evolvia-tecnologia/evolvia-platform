import type { Page, TestInfo } from '@playwright/test';

/** Credenciais e identificadores vem do ambiente; nunca ficam no repositorio. */
export const ambiente = {
  baseURL: process.env.EVOLVIA_E2E_BASE_URL ?? '',
  email: process.env.EVOLVIA_E2E_EMAIL ?? '',
  senha: process.env.EVOLVIA_E2E_SENHA ?? '',
  eventoId: process.env.EVOLVIA_E2E_EVENTO_ID ?? '',
  eventoSlug: process.env.EVOLVIA_E2E_EVENTO_SLUG ?? '',
  eventoSlugPago: process.env.EVOLVIA_E2E_EVENTO_SLUG_PAGO ?? '',
};

export const temAutenticacao = Boolean(ambiente.email && ambiente.senha && ambiente.eventoId);
export const temEventoPublico = Boolean(ambiente.eventoSlug);
export const temEventoPago = Boolean(ambiente.eventoSlugPago);

/** Login real pela interface. Falha ruidosamente: sessao ausente invalida o teste. */
export async function entrar(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/e-?mail/iu).fill(ambiente.email);
  await page.getByLabel(/senha/iu).fill(ambiente.senha);
  await page.getByRole('button', { name: /entrar|acessar/iu }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
}

export async function abrirEtiquetas(page: Page): Promise<void> {
  await page.goto(`/eventos/${encodeURIComponent(ambiente.eventoId)}/painel/check-in#etiquetas`);
  await page.getByRole('heading', { name: /configura(ç|c)(ã|a)o de etiquetas/iu }).waitFor();
}

/**
 * Reflow (WCAG 2.2, criterio 1.4.10): nenhum conteudo pode exigir rolagem
 * horizontal. Tolerancia de 1px para arredondamento de layout.
 */
export async function semRolagemHorizontal(page: Page): Promise<{ scrollWidth: number; innerWidth: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
}

/** Elementos que de fato transbordam, para a falha apontar o culpado. */
export async function culpadosDeTransbordo(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const limite = window.innerWidth + 1;
    const saida: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > limite) {
        const id = el.id ? `#${el.id}` : '';
        const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/u).slice(0, 2).join('.')}` : '';
        saida.push(`${el.tagName.toLowerCase()}${id}${cls} (right=${Math.round(r.right)}px)`);
      }
      if (saida.length >= 10) break;
    }
    return saida;
  });
}

/** Criterio 2.5.8 (AA): alvo minimo de 24x24 CSS px. 44px e a meta do projeto. */
export async function alvosDeToque(page: Page, escopo: string) {
  return page.evaluate((sel) => {
    const raiz = document.querySelector(sel) ?? document.body;
    const controles = Array.from(raiz.querySelectorAll<HTMLElement>('button, select, input, a[href], [role="button"]'));
    return controles
      .map((el) => {
        const r = el.getBoundingClientRect();
        const nome = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 40) || el.tagName.toLowerCase();
        return { nome, largura: Math.round(r.width), altura: Math.round(r.height), visivel: r.width > 0 && r.height > 0 };
      })
      .filter((c) => c.visivel && (c.largura < 44 || c.altura < 44));
  }, escopo);
}

export async function anexarJson(testInfo: TestInfo, nome: string, dados: unknown): Promise<void> {
  await testInfo.attach(nome, { body: JSON.stringify(dados, null, 2), contentType: 'application/json' });
}
