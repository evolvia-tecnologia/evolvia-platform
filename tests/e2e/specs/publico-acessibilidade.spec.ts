import { expect, test, type Page } from '@playwright/test';
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
  /**
   * Endereco CANONICO do evento: /{slug}, nao /evento/{slug}.
   *
   * app/[slug]/page.tsx reexporta app/evento/[slug]/page e diz, em comentario,
   * que o curto e o publico e que /evento/{slug} "permanece para links
   * anteriores". A canonical, o JSON-LD e o href do cartao do catalogo apontam
   * todos para /{slug}. Testar o legado aqui media a rota que ninguem recebe.
   *
   * O legado continua coberto, de proposito, em endereco-curto.spec.ts.
   */
  { nome: 'evento', caminho: () => `/${encodeURIComponent(ambiente.eventoSlug)}`, exige: () => temEventoPublico },
];

test.describe('Acessibilidade das superficies publicas @publico @a11y', () => {
  for (const pagina of paginas) {
    test(`axe em ${pagina.nome}`, async ({ page }, testInfo) => {
      test.skip(Boolean(pagina.exige) && !pagina.exige!(), 'Defina EVOLVIA_E2E_EVENTO_SLUG.');
      await page.goto(pagina.caminho());
      await varrerAcessibilidade(page, testInfo, pagina.nome);
    });
  }
});

/**
 * WCAG 2.2, criterio 2.4.1 (Bypass Blocks), nivel A.
 *
 * O que havia aqui antes, e por que estava errado
 * -----------------------------------------------
 * A versao anterior fazia:
 *
 *     const pular = page.getByRole('link', { name: /pular para/iu }).first();
 *     if (await pular.count() === 0) test.skip(true, 'Pagina sem skip-link.');
 *     await expect(pular).toBeFocused();
 *
 * Dois defeitos, de tipos diferentes dos que eu vinha encontrando:
 *
 * 1. SKIP FALSO. Ausencia de skip-link virava SKIP, como se fosse um fato
 *    neutro do ambiente. Nao e: o padrao EXISTE no produto (confirmado em
 *    app/login/page.tsx, app/page.tsx, app/eventos/page.tsx e
 *    components/public-help-article.tsx). Ausencia e desvio do padrao, e
 *    reprova. Um SKIP ali escondia justamente o achado.
 *
 * 2. ASSERCAO FRACA. Verificar que o link recebe foco nao verifica que ele
 *    PULA algo. Conferindo o codigo em 03/11/2026, tres das cinco paginas
 *    publicas tem o <main id="main-content"> ENVOLVENDO o <header> com a
 *    navegacao:
 *
 *      app/page.tsx         -> <main id="main-content"> <PublicSiteHeader/> ...
 *      app/eventos/page.tsx -> <main id="main-content"> <PublicSiteHeader/> ...
 *      app/evento/[slug]/page.tsx -> idem (e por reexport, tambem /{slug})
 *
 *    Logo o skip-link leva o foco para um ponto ANTES da navegacao: o usuario
 *    de teclado ainda percorre marca, busca e todos os itens do menu. O teste
 *    antigo passava nessas paginas.
 *
 *    A estrutura correta ja existe no proprio repositorio:
 *
 *      app/login/page.tsx            -> skip-link, <PublicSiteHeader/>, <main>
 *      components/public-help-article.tsx -> idem
 *
 * Efeito colateral da mesma causa: <header> aninhado em <main> perde o papel
 * `banner`, e <footer> aninhado perde `contentinfo` (ambos so valem no topo).
 * Por isso a checagem de landmark vem junto, com mensagem propria.
 */
const NOME_DO_SKIP = /pular para o conte(ú|u)do/iu;
const NOME_DA_NAVEGACAO = /navega(ç|c)(ã|a)o principal/iu;

async function verificarBypass(page: Page): Promise<string> {
  const pular = page.getByRole('link', { name: NOME_DO_SKIP });
  await expect(pular,
    'skip-link ausente nesta pagina. O padrao existe no produto '
    + '(app/login/page.tsx, components/public-help-article.tsx), portanto a '
    + 'ausencia aqui e desvio, nao capacidade ainda nao construida. '
    + 'WCAG 2.2 criterio 2.4.1, nivel A.').toHaveCount(1);

  await page.keyboard.press('Tab');
  await expect(pular,
    'o skip-link precisa ser o primeiro elemento focavel da pagina; '
    + 'se algo o precede na ordem de tabulacao, ele deixa de servir.').toBeFocused();

  const destino = (await pular.getAttribute('href')) ?? '';
  expect(destino, 'o skip-link precisa apontar para um fragmento (#algo)').toMatch(/^#.+/u);

  const alvo = page.locator(destino);
  await expect(alvo, `o destino ${destino} do skip-link nao existe na pagina`).toHaveCount(1);

  // A assercao que detecta o defeito de hoje.
  await expect(alvo.getByRole('navigation', { name: NOME_DA_NAVEGACAO }),
    `a navegacao principal esta DENTRO de ${destino}. O skip-link leva o foco `
    + 'para um ponto anterior a ela, entao nao pula nada: o usuario de teclado '
    + 'percorre marca, busca e o menu inteiro antes de chegar ao conteudo. '
    + 'Estrutura correta em app/login/page.tsx: header fora do <main>. '
    + 'A navegacao de paginacao do catalogo pode ficar dentro do main -- esta '
    + 'assercao mira a navegacao principal pelo nome acessivel.').toHaveCount(0);

  return destino;
}

test.describe('Bypass de blocos repetidos @publico @a11y', () => {
  for (const pagina of paginas) {
    test(`o skip-link de ${pagina.nome} pula a navegacao repetida`, async ({ page }, testInfo) => {
      test.skip(Boolean(pagina.exige) && !pagina.exige!(), 'Defina EVOLVIA_E2E_EVENTO_SLUG.');
      await page.goto(pagina.caminho());
      const destino = await verificarBypass(page);
      await anexarJson(testInfo, `bypass-${pagina.nome}.json`, { pagina: pagina.nome, destino });
    });

    test(`landmarks de ${pagina.nome} no topo`, async ({ page }, testInfo) => {
      test.skip(Boolean(pagina.exige) && !pagina.exige!(), 'Defina EVOLVIA_E2E_EVENTO_SLUG.');
      await page.goto(pagina.caminho());

      const principal = page.locator('main');
      await expect(principal, 'a pagina precisa ter exatamente um <main>').toHaveCount(1);

      /**
       * `banner` e `contentinfo` so existem quando <header>/<footer> estao no
       * topo do documento. Aninhados em <main>, viram generic e desaparecem da
       * lista de landmarks que o leitor de tela oferece para navegar.
       *
       * A contagem precisa ser fiel a especificacao, nao so ao codigo de hoje:
       * um <footer> dentro de <article>, <section>, <aside> ou <nav> JA nao e
       * contentinfo, mesmo no topo -- acusar isso seria culpar o produto por
       * marcacao correta. Hoje o public-event-card usa <div class=footer>, e
       * passaria; amanha pode usar <footer> dentro do <article>, e continuaria
       * correto. Por isso so conta o que esta diretamente sob <main>, sem
       * elemento de secionamento no caminho.
       */
      const { cabecalhoAninhado, rodapeAninhado } = await page.evaluate(() => {
        const principalDom = document.querySelector('main');
        if (!principalDom) return { cabecalhoAninhado: 0, rodapeAninhado: 0 };
        const secionadores = new Set(['ARTICLE', 'SECTION', 'ASIDE', 'NAV']);
        const contar = (seletor: string) => Array.from(principalDom.querySelectorAll(seletor))
          .filter((elemento) => {
            for (let pai = elemento.parentElement; pai && pai !== principalDom; pai = pai.parentElement) {
              if (secionadores.has(pai.tagName)) return false;
            }
            return true;
          }).length;
        return { cabecalhoAninhado: contar('header'), rodapeAninhado: contar('footer') };
      });
      await anexarJson(testInfo, `landmarks-${pagina.nome}.json`, { cabecalhoAninhado, rodapeAninhado });

      expect(cabecalhoAninhado,
        'o <header> esta aninhado em <main> e perde o papel banner: ele sai da '
        + 'lista de landmarks do leitor de tela. Mesma causa do skip-link que '
        + 'nao pula nada.').toBe(0);
      expect(rodapeAninhado,
        'o <footer> esta aninhado em <main> e perde o papel contentinfo.').toBe(0);
    });
  }
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
