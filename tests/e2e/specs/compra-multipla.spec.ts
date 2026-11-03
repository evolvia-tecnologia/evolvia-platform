import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  alvosDeToque, ambiente, anexarJson, culpadosDeTransbordo,
  semRolagemHorizontal, temEventoPago,
} from '../support/ambiente';
import { varrerAcessibilidade } from '../support/acessibilidade';
import { motivoDeSkip, temRotaDeCompraMultipla } from '../support/capacidades';

/**
 * Cobre o PR #471 (criterio G2.10). NENHUM teste conclui pagamento: a suite
 * para na previa e na conferencia do estado. Nao acionar gateway, nem sandbox,
 * sem autorizacao explicita e credenciais proprias.
 *
 * Seletores conferidos em 03/11/2026 contra o que o #471 constroi:
 *   apps/web/components/public-registration-group-form.tsx  (+373 linhas)
 *   apps/web/app/evento/[slug]/inscricao/grupo/page.tsx      (novo)
 * e contra apps/api/src/registration-category-fields.ts.
 *
 * A rota /evento/{slug}/inscricao/grupo e CRIADA pelo #471: ela nao existe em
 * develop. Sem a deteccao de capacidade abaixo, os sete casos deste arquivo
 * bateriam em 404 e reprovariam — sete vermelhos falsos culpando o produto por
 * uma tela que ainda nao foi integrada. G2.10 e um dos oito criterios NAO
 * integrados do GATES_STATUS.json, entao a ausencia e esperada.
 */
const rota = () => `/evento/${encodeURIComponent(ambiente.eventoSlugPago)}/inscricao/grupo`;

/** Fieldset de um participante: <legend>Participante N</legend>. */
function fichaDoParticipante(page: Page, indice: number): Locator {
  return page.getByRole('group', { name: new RegExp(`^Participante ${indice}$`, 'u') });
}

test.describe('Compra multipla @publico', () => {
  test.skip(!temEventoPago, 'Defina EVOLVIA_E2E_EVENTO_SLUG_PAGO com um evento publicado e pago.');

  test.beforeEach(async ({ page }) => {
    const capacidade = await temRotaDeCompraMultipla(page, rota());
    test.skip(!capacidade.presente, motivoDeSkip(capacidade));
  });

  test('a pagina exige de 2 a 10 participantes @gate-compra', async ({ page }) => {
    await page.goto(rota());
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(fichaDoParticipante(page, 1)).toBeVisible();
    await expect(fichaDoParticipante(page, 2)).toBeVisible();

    // disabled={entries.length <= 2}: com duas fichas, nao da para remover.
    const remover = page.getByRole('button', { name: 'Remover último' });
    await expect(remover).toBeDisabled();

    // disabled={entries.length >= 10}: oito cliques levam de 2 a 10.
    const adicionar = page.getByRole('button', { name: 'Adicionar participante' });
    for (let i = 2; i < 10; i += 1) await adicionar.click();
    await expect(fichaDoParticipante(page, 10)).toBeVisible();
    await expect(adicionar, 'o limite de 10 participantes precisa travar o botao').toBeDisabled();
    await expect(remover, 'com 10 fichas, remover precisa estar liberado').toBeEnabled();
  });

  test('documentos repetidos sao recusados antes de qualquer reserva @gate-compra', async ({ page }, testInfo) => {
    await page.goto(rota());
    const requisicoes: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/registration/orders')) requisicoes.push(req.url());
    });

    for (const indice of [1, 2]) {
      const ficha = fichaDoParticipante(page, indice);
      await ficha.getByLabel('Categoria', { exact: true }).selectOption({ index: 1 });
      await ficha.getByLabel('Lote', { exact: true }).selectOption({ index: 1 });

      /**
       * O campo tem codigo `identity_document` e rotulo
       * "CPF ou documento estrangeiro". Ele e ESSENCIAL em
       * registration-category-fields.ts: o Map de campos ja nasce semeado com
       * ESSENTIAL_FIELDS, entao `enabled: false` na configuracao do evento nao
       * o remove. Logo, exigir sua presenca e correto.
       *
       * A versao anterior deste teste preenchia o documento dentro de
       * `if (await documento.count())`. Isso abria um caminho de FALSO VERDE:
       * sem o campo, os dois participantes ficariam com documento vazio, e a
       * checagem do componente
       *     new Set(identities).size !== identities.length
       * dispararia igual — por colisao de strings VAZIAS, nao por documento
       * repetido. O teste passaria afirmando algo que nao testou.
       */
      const documento = ficha.getByLabel(/documento|cpf/iu).first();
      await expect(documento,
        'identity_document e campo essencial e nao pode faltar na ficha; '
        + 'sem ele este teste passaria por colisao de strings vazias, nao por '
        + 'documento repetido').toBeVisible();
      await documento.fill('52998224725');

      await ficha.getByRole('checkbox', { name: /aceito os termos/iu }).check();
    }

    await page.getByRole('button', { name: /calcular valor do pedido/iu }).click();
    await expect(page.getByRole('alert').filter({ hasText: /documento diferente/iu })).toBeVisible();
    expect(requisicoes, 'nenhuma reserva pode ser enviada com documentos repetidos').toEqual([]);
    await anexarJson(testInfo, 'compra-multipla-duplicidade.json', { reservasEnviadas: requisicoes.length });
  });

  test('documentos distintos passam da validacao local, sem reservar @gate-compra', async ({ page }, testInfo) => {
    // Contraprova do caso acima: com documentos diferentes, a mensagem de
    // duplicidade NAO deve aparecer. Sem esta contraprova, um componente que
    // recusasse qualquer compra multipla passaria no teste anterior.
    await page.goto(rota());
    const documentos = ['52998224725', '15350946056'];
    for (const indice of [1, 2]) {
      const ficha = fichaDoParticipante(page, indice);
      await ficha.getByLabel('Categoria', { exact: true }).selectOption({ index: 1 });
      await ficha.getByLabel('Lote', { exact: true }).selectOption({ index: 1 });
      await ficha.getByLabel(/documento|cpf/iu).first().fill(documentos[indice - 1]);
      await ficha.getByRole('checkbox', { name: /aceito os termos/iu }).check();
    }
    await page.getByRole('button', { name: /calcular valor do pedido/iu }).click();
    await expect(page.getByRole('alert').filter({ hasText: /documento diferente/iu })).toHaveCount(0);
    await anexarJson(testInfo, 'compra-multipla-distintos.json', { documentosDistintos: true });
    // Deliberado: paramos aqui. Nao clicamos em reservar nem em pagar.
  });

  test('varredura axe da compra multipla @a11y', async ({ page }, testInfo) => {
    await page.goto(rota());
    await varrerAcessibilidade(page, testInfo, 'compra-multipla');
  });

  test('alvos de toque na compra multipla @a11y', async ({ page }, testInfo) => {
    await page.goto(rota());
    const pequenos = await alvosDeToque(page, 'main');
    await anexarJson(testInfo, 'alvos-compra-multipla.json', pequenos);
    expect(pequenos.filter((c) => c.largura < 24 || c.altura < 24)).toEqual([]);
  });
});

test.describe('Compra multipla em telas estreitas @publico @responsivo', () => {
  test.skip(!temEventoPago, 'Defina EVOLVIA_E2E_EVENTO_SLUG_PAGO.');

  test.beforeEach(async ({ page }) => {
    const capacidade = await temRotaDeCompraMultipla(page, rota());
    test.skip(!capacidade.presente, motivoDeSkip(capacidade));
  });

  for (const largura of [320, 390]) {
    test(`sem rolagem horizontal em ${largura}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: largura, height: 740 });
      await page.goto(rota());
      const { scrollWidth, innerWidth } = await semRolagemHorizontal(page);
      const culpados = await culpadosDeTransbordo(page);
      await anexarJson(testInfo, `transbordo-grupo-${largura}px.json`, { scrollWidth, innerWidth, culpados });
      expect(scrollWidth, `Transbordo em ${largura}px: ${culpados.join(', ')}`).toBeLessThanOrEqual(innerWidth + 1);
    });
  }
});
