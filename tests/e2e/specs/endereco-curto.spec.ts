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
 * Colisao com rota de topo: risco levantado e DESCARTADO por leitura do codigo
 * ---------------------------------------------------------------------------
 * Um `[slug]` dinamico na RAIZ compete com toda rota estatica de topo, e no Next
 * a estatica vence -- corretamente. Levantei a hipotese de que um evento cujo
 * slug coincidisse com uma rota de topo (`ajuda`, `eventos`, `login`...) ficaria
 * inacessivel no endereco curto, em silencio.
 *
 * Fui ler, antes de afirmar. A hipotese esta ERRADA, e o produto esta certo:
 *
 *   apps/api/src/slug.ts
 *     export function eventPublicSlug(name: string, code: string): string {
 *       if (!/^[a-f0-9]{12}$/u.test(code)) throw new Error('Codigo publico invalido.');
 *       ...
 *       return `${acronym || 'evt'}-${code}`;
 *     }
 *
 *   apps/api/src/events.service.ts
 *     const publicSlug = eventPublicSlug(dto.name, randomBytes(6).toString('hex'));
 *     // O identificador e criado uma vez; alteracoes editoriais nao mudam
 *     // links divulgados.
 *     ... slug: publicSlug
 *
 * randomBytes(6) da exatamente 12 hex, entao TODO slug de evento termina em
 * `-<12 hex>`. Um slug nunca pode ser igual a `ajuda` ou `eventos`: a colisao e
 * impossivel por construcao. O slug tambem e gravado uma unica vez na criacao, e
 * nenhum caminho deste servico o altera depois -- updateSubjectAreas nao toca
 * nele.
 *
 * Fica o teste de sanidade abaixo, barato, para o unico caso que sobra: alguem
 * configurar a fixture a mao com um slug como "ajuda". Isso seria erro de
 * configuracao do teste, nao defeito do produto, e a mensagem diz isso.
 *
 * Rotas de topo conferidas na develop em 03/11/2026:
 *   acessibilidade, acesso, ajuda, cadastro, certificado, convites, evento,
 *   eventos, login, organizacoes, painel, participante, privacidade,
 *   termos-de-uso, verificar-email
 * mais os arquivos robots.ts, sitemap.ts e icon.svg.
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
     * Sanidade da CONFIGURACAO do teste, nao do produto.
     *
     * A API nunca gera um slug colidente: eventPublicSlug sempre acrescenta
     * `-<12 hex>` (ver o cabecalho deste arquivo). O unico jeito de chegar aqui
     * e configurar EVOLVIA_E2E_EVENTO_SLUG a mao com algo como "ajuda". Nesse
     * caso a rota estatica vence, todos os testes do endereco curto falhariam, e
     * sem este caso a pessoa iria procurar defeito no produto. Falha aqui, com o
     * motivo certo e barato.
     *
     * Registra tambem se o slug segue o formato da API, como informacao -- sem
     * assertiva, porque homologacao pode ter evento legado de outro esquema e
     * reprovar isso seria inventar defeito.
     */
    const slug = ambiente.eventoSlug;
    const colide = ROTAS_DE_TOPO.includes(slug.toLowerCase());
    const segueFormatoDaApi = /-[a-f0-9]{12}$/u.test(slug);
    await anexarJson(testInfo, 'slug-da-fixture.json', { slug, colide, segueFormatoDaApi });
    expect(colide,
      `o slug "${slug}" coincide com uma rota estatica de topo. No Next a rota `
      + 'estatica vence o [slug] da raiz, entao o endereco curto deste evento e '
      + 'inalcancavel. Isto e erro de configuracao da fixture, nao do produto: a '
      + 'API nunca gera slug assim, porque eventPublicSlug sempre acrescenta '
      + `-<12 hex>. Escolha outro slug. Rotas de topo: ${ROTAS_DE_TOPO.join(', ')}.`)
      .toBe(false);
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
