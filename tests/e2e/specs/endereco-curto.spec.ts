import { expect, test } from '@playwright/test';
import { ambiente, anexarJson, temEventoPublico } from '../support/ambiente';

/**
 * Endereco publico curto do evento: /{slug}
 *
 * Por que esta spec existe
 * ------------------------
 * Conferindo em 03/11/2026, a rota canonica do evento NAO e /evento/{slug}:
 *
 *   apps/web/app/[slug]/page.tsx  (151 bytes, reexporta a outra)
 *     // Endereco publico curto; a rota /evento/[slug] permanece para links
 *     // anteriores.
 *     export { default, generateMetadata } from '../evento/[slug]/page';
 *
 *   apps/web/app/evento/[slug]/page.tsx
 *     function eventUrl(slug) { return `${PUBLIC_BASE_URL}/${slug}`; }
 *     ...
 *     alternates: { canonical: eventUrl(...) }   // -> /{slug}
 *     url: eventUrl(event.event.slug)            // JSON-LD  -> /{slug}
 *
 * E o cartao do catalogo tambem aponta para o curto:
 *   apps/web/components/public-event-card.tsx
 *     href={`/${encodeURIComponent(event.slug)}`}
 *
 * Ou seja: o endereco que o usuario realmente recebe -- do catalogo, da tag
 * canonical, do JSON-LD e de qualquer compartilhamento -- e /{slug}.
 * /evento/{slug} e explicitamente o endereco LEGADO.
 *
 * O resto da suite testava so o legado. Como as duas rotas servem o mesmo
 * componente, aquilo nao produzia vermelho falso; produzia uma LACUNA: nada
 * verificava que o endereco curto funciona. Se o `[slug]` da raiz quebrasse ou
 * fosse sombreado, nenhum teste notaria, e o catalogo inteiro levaria a 404.
 *
 * Risco estrutural registrado
 * ---------------------------
 * Um `[slug]` dinamico na RAIZ compete com toda rota estatica de topo. No Next,
 * rota estatica vence a dinamica -- corretamente. A consequencia e que um evento
 * cujo slug coincida com uma rota de topo fica inacessivel no endereco curto, em
 * silencio, e cai na pagina estatica.
 *
 * Rotas de topo conferidas na develop em 03/11/2026:
 *   acessibilidade, acesso, ajuda, cadastro, certificado, convites, evento,
 *   eventos, login, organizacoes, painel, participante, privacidade,
 *   termos-de-uso, verificar-email
 * mais os arquivos robots.ts, sitemap.ts e icon.svg.
 *
 * Isto NAO e asserido como defeito do produto: reservar nomes e uma decisao de
 * produto, e pode ja existir validacao no cadastro do slug que eu nao conferi.
 * O que a spec faz e (a) checar a sanidade da propria fixture e (b) deixar a
 * lista no repositorio, para quem decidir.
 */

/** Rotas estaticas de topo que vencem o `[slug]` da raiz. */
const ROTAS_DE_TOPO = [
  'acessibilidade', 'acesso', 'ajuda', 'cadastro', 'certificado', 'convites',
  'evento', 'eventos', 'login', 'organizacoes', 'painel', 'participante',
  'privacidade', 'termos-de-uso', 'verificar-email',
  'robots.txt', 'sitemap.xml', 'icon.svg',
];

const curto = () => `/${encodeURIComponent(ambiente.eventoSlug)}`;
const legado = () => `/evento/${encodeURIComponent(ambiente.eventoSlug)}`;

test.describe('Endereco publico curto do evento @publico', () => {
  test.skip(!temEventoPublico, 'Defina EVOLVIA_E2E_EVENTO_SLUG.');

  test('o slug da fixture nao colide com rota de topo', async ({}, testInfo) => {
    /**
     * Checagem de sanidade da configuracao, nao do produto. Se a fixture usar
     * um slug como "ajuda", a rota estatica vence e todos os testes do endereco
     * curto falhariam apontando defeito onde ha so escolha ruim de fixture.
     * Melhor falhar aqui, com o motivo certo.
     */
    const colide = ROTAS_DE_TOPO.includes(ambiente.eventoSlug.toLowerCase());
    await anexarJson(testInfo, 'slug-da-fixture.json', { slug: ambiente.eventoSlug, colide });
    expect(colide,
      `o slug "${ambiente.eventoSlug}" coincide com uma rota estatica de topo. `
      + 'No Next a rota estatica vence o [slug] da raiz, entao o endereco curto '
      + 'deste evento e inalcancavel. Escolha outro slug para a fixture. '
      + `Rotas de topo: ${ROTAS_DE_TOPO.join(', ')}.`).toBe(false);
  });

  test('o endereco curto serve o evento @gate-publico', async ({ page }) => {
    const resposta = await page.goto(curto());
    expect(resposta?.status() ?? 0,
      `o endereco curto ${curto()} e o canonico do evento: ele aparece na tag `
      + 'canonical, no JSON-LD e no href do cartao do catalogo. Se ele nao '
      + 'responde, o catalogo inteiro leva a lugar nenhum.').toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('a tag canonical aponta para o endereco curto, nao para o legado', async ({ page }, testInfo) => {
    await page.goto(curto());
    const canonical = await page.locator('link[rel=canonical]').first().getAttribute('href');
    await anexarJson(testInfo, 'canonical-do-evento.json', { canonical, curto: curto(), legado: legado() });

    expect(canonical, 'a pagina do evento precisa declarar uma canonical').toBeTruthy();
    const caminho = new URL(canonical!, 'http://base.invalid').pathname;
    expect(decodeURIComponent(caminho),
      'a canonical precisa apontar para o endereco curto. eventUrl() em '
      + 'app/evento/[slug]/page.tsx monta `${PUBLIC_BASE_URL}/${slug}`, entao '
      + 'uma canonical em /evento/... indicaria regressao ali.')
      .toBe(decodeURIComponent(curto()));
  });

  test('o endereco legado continua servindo o mesmo evento @gate-publico', async ({ page }) => {
    /**
     * O comentario em app/[slug]/page.tsx diz que /evento/[slug] "permanece
     * para links anteriores". Entao ele nao pode simplesmente parar de
     * funcionar: links ja compartilhados dependem dele.
     *
     * Compara o <h1> das duas rotas em vez do HTML inteiro: o HTML carrega
     * marcacao de hidratacao que muda entre requisicoes.
     */
    await page.goto(curto());
    const tituloCurto = (await page.getByRole('heading', { level: 1 }).first().textContent())?.trim();

    const resposta = await page.goto(legado());
    expect(resposta?.status() ?? 0,
      `${legado()} e mantido para links anteriores (ver o comentario em `
      + 'app/[slug]/page.tsx) e nao pode deixar de responder.').toBeLessThan(400);
    const tituloLegado = (await page.getByRole('heading', { level: 1 }).first().textContent())?.trim();

    expect(tituloLegado,
      'as duas rotas reexportam o mesmo componente, entao precisam mostrar o '
      + 'mesmo evento. Divergencia aqui significa que uma delas parou de '
      + 'resolver o slug.').toBe(tituloCurto);
  });
});
