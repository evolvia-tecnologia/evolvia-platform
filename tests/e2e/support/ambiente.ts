import type { Locator, Page, TestInfo } from '@playwright/test';

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

type Linha = { descricao: string; largura: number; altura: number; direita: number };

/**
 * Coleta geometrica compartilhada por culpadosDeTransbordo e alvosDeToque.
 *
 * Por que uma funcao so
 * ---------------------
 * As duas funcoes tinham, cada uma, a sua propria nocao de "visivel", e as
 * duas estavam erradas do mesmo jeito: `r.width > 0 && r.height > 0`. Isso
 * descarta `display:none` (que zera o retangulo) mas ACEITA
 * `visibility:hidden` e `opacity:0`, que preservam o retangulo. Medido em
 * Chromium em 03/11/2026: um botao 10x10 dentro de `visibility:hidden` e
 * outro dentro de `opacity:0` entravam na lista de alvos pequenos. Como o
 * spec refiltra em `< 24`, isso e vermelho falso -- reprova um controle que
 * o usuario nao alcanca.
 *
 * Com o predicado num lugar so, as duas nao podem divergir de novo.
 *
 * O predicado, e por que cada parte dele
 * --------------------------------------
 * - tamanho zero: pega `display:none` em qualquer ancestral, porque o
 *   retangulo vem todo zerado. Nao precisa de passo extra.
 * - `visibility`: lida NO PROPRIO ELEMENTO, nao nos ancestrais. A
 *   propriedade e herdada, entao o valor computado do elemento ja reflete um
 *   ancestral escondido -- E respeita um filho que re-declara
 *   `visibility:visible` dentro de um pai `hidden`, que o CSS permite e que
 *   fica visivel de verdade. Andar pelos ancestrais reprovaria esse filho:
 *   seria um segundo vermelho falso, trocado por outro. Medido.
 * - `opacity`: NAO e herdada, ela compoe. Entao aqui o passeio pelos
 *   ancestrais e obrigatorio, multiplicando. Medido: 0.3 dentro de 0.3 da
 *   0.09, e nenhum dos dois valores isolados denuncia isso.
 *
 * O corte e `> 0`, estrito. Um elemento com opacidade 0.09 continua ocupando
 * espaco e continua clicavel, e o criterio 2.5.8 nao fala de opacidade: eu
 * nao invento um limiar que a norma nao tem.
 */
async function inspecionar(
  page: Page,
  raiz: string,
  consulta: string,
  modo: 'transbordo' | 'alvos',
  limite: number,
): Promise<Linha[]> {
  return page.evaluate(({ raiz, consulta, modo, limite }) => {
    const visivel = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const propria = getComputedStyle(el).visibility;
      if (propria === 'hidden' || propria === 'collapse') return false;
      let opacidade = 1;
      for (let a: Element | null = el; a; a = a.parentElement) {
        opacidade *= Number.parseFloat(getComputedStyle(a).opacity || '1');
      }
      return opacidade > 0;
    };

    const descrever = (el: Element): string => {
      if (modo === 'alvos') {
        // O <label> que embrulha o controle, porque um <select> ou <input> nao
        // tem texto proprio: sem ele a evidencia viraria "input, input, select".
        const rotulo = el.getAttribute('aria-label')
          || el.closest('label')?.textContent?.trim()
          || el.textContent?.trim();
        return rotulo?.replace(/\s+/gu, ' ').slice(0, 40) || el.tagName.toLowerCase();
      }
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof (el as HTMLElement).className === 'string' && (el as HTMLElement).className
        ? `.${(el as HTMLElement).className.trim().split(/\s+/u).slice(0, 2).join('.')}`
        : '';
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    };

    const base = document.querySelector(raiz) ?? document.body;
    const limiteDireito = window.innerWidth + 1;
    const saida: Linha[] = [];
    for (const el of Array.from(base.querySelectorAll(consulta))) {
      if (!visivel(el)) continue;
      const r = el.getBoundingClientRect();
      const largura = Math.round(r.width);
      const altura = Math.round(r.height);
      const direita = Math.round(r.right);
      const interessa = modo === 'transbordo'
        ? r.right > limiteDireito
        : largura < 44 || altura < 44;
      if (!interessa) continue;
      saida.push({ descricao: descrever(el), largura, altura, direita });
      // limite 0 = sem teto. O teto existe para o transbordo, onde 10 culpados
      // ja bastam para apontar o dedo; em alvos truncar esconderia achados.
      if (limite > 0 && saida.length >= limite) break;
    }
    return saida;
  }, { raiz, consulta, modo, limite });
}

/** Elementos que de fato transbordam, para a falha apontar o culpado. */
export async function culpadosDeTransbordo(page: Page): Promise<string[]> {
  const linhas = await inspecionar(page, 'body', '*', 'transbordo', 10);
  return linhas.map((l) => `${l.descricao} (right=${l.direita}px)`);
}

/**
 * Criterio 2.5.8 (AA): alvo minimo de 24x24 CSS px. 44px e a meta do projeto.
 *
 * Devolve tudo abaixo de 44px -- a meta -- mas MARCA cada linha com os dois
 * limiares. Antes a funcao devolvia so a medida crua, e o anexo
 * `alvos-abaixo-de-44px.json` registrava como achado um controle de 24x24,
 * que esta conforme com 2.5.8. Evidencia que chama de falha o que passa gasta
 * o tempo de quem revisa e, pior, ensina a ignorar o anexo.
 *
 * Nao ha campo `visivel` nem `abaixoDe44` no retorno: os dois seriam
 * tautologia. Estar na lista ja significa "visivel de verdade E abaixo da meta
 * de 44px". O unico campo que carrega decisao e `abaixoDe24`, que separa a
 * REPROVACAO de norma do simples nao-atingimento da meta do projeto.
 */
export async function alvosDeToque(page: Page, escopo: string): Promise<Array<{
  nome: string; largura: number; altura: number; abaixoDe24: boolean;
}>> {
  const linhas = await inspecionar(
    page,
    escopo,
    'button, select, input, a[href], [role="button"]',
    'alvos',
    0,
  );
  return linhas.map((l) => ({
    nome: l.descricao,
    largura: l.largura,
    altura: l.altura,
    abaixoDe24: l.largura < 24 || l.altura < 24,
  }));
}

/**
 * Indicador de foco visivel (WCAG 2.2, criterios 2.4.7 e 2.4.11).
 *
 * Substitui uma assercao que nao podia reprovar. A versao anterior era:
 *
 *     getComputedStyle(el, ':focus-visible').outlineStyle   // nunca falha
 *
 * O segundo argumento de getComputedStyle e um pseudo-ELEMENTO (`::before`,
 * `::marker`). `:focus-visible` e um pseudo-CLASSE, e pseudo-classe nao e
 * enderecavel por ali. Medido em Chromium em 03/11/2026: o retorno e um
 * CSSStyleDeclaration VAZIO (`length === 0`), logo `.outlineStyle` e `''`.
 * Como `'' !== 'none'`, a assercao `.not.toBe('none')` passava sempre --
 * inclusive num botao sem anel de foco nenhum. Verde falso puro.
 *
 * Tres coisas que a medicao ensinou, e que esta funcao respeita:
 *
 * 1. `:focus-visible` depende da MODALIDADE da ultima interacao. Depois de um
 *    clique de mouse -- que e exatamente o que `entrar()` faz no botao de
 *    login -- um `.focus()` programatico NAO casa `:focus-visible`, e o
 *    contorno computado volta `none`. Ler o estilo real depois de `.focus()`
 *    criaria um vermelho falso num botao conforme. Por isso a manobra
 *    `focus()` -> `Shift+Tab` -> `Tab`: ela devolve a modalidade para teclado
 *    sem precisar contar tabulacoes desde o topo da pagina. Medida tambem no
 *    caso de borda em que o alvo e o primeiro tabulavel.
 *
 * 2. `outline-width` sozinho nao serve: com `outline-style: none` o valor
 *    computado continua `3px`. Seria um segundo verde falso.
 *
 * 3. O anel pode nao ser `outline`. Um projeto que desenha o foco com
 *    `box-shadow` passaria a reprovar se a assercao olhasse so o contorno.
 *    Por isso a comparacao e por DIFERENCA entre o estado sem foco e com
 *    foco: se NADA muda visualmente, nao ha indicador. Isso afere o efeito,
 *    nao o elemento -- a causa-raiz 4 do SELETORES.md.
 *
 * Devolve o material para o spec decidir e para anexar como evidencia.
 */
export async function indicadorDeFoco(page: Page, alvo: Locator): Promise<{
  focado: boolean; focusVisible: boolean; diferencas: string[];
  antes: Record<string, string>; depois: Record<string, string>;
}> {
  const sondar = (): Promise<Record<string, string>> => alvo.evaluate((el) => {
    const e = getComputedStyle(el as Element);
    return {
      outlineStyle: e.outlineStyle,
      outlineWidth: e.outlineWidth,
      outlineColor: e.outlineColor,
      outlineOffset: e.outlineOffset,
      boxShadow: e.boxShadow,
      borderColor: e.borderColor,
      borderWidth: e.borderWidth,
      backgroundColor: e.backgroundColor,
      color: e.color,
      textDecorationLine: e.textDecorationLine,
    };
  });

  const antes = await sondar();

  // Teclado real: devolve a modalidade, que um .focus() sozinho nao devolve.
  await alvo.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');

  const estado = await alvo.evaluate((el) => ({
    focado: el === document.activeElement,
    focusVisible: (el as Element).matches(':focus-visible'),
  }));
  const depois = await sondar();

  const diferencas = Object.keys(antes).filter((k) => antes[k] !== depois[k]);
  return { ...estado, diferencas, antes, depois };
}

export async function anexarJson(testInfo: TestInfo, nome: string, dados: unknown): Promise<void> {
  await testInfo.attach(nome, { body: JSON.stringify(dados, null, 2), contentType: 'application/json' });
}
