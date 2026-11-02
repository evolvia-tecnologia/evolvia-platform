import { expect, test } from '@playwright/test';
import { anexarJson, temAutenticacao } from '../support/ambiente';
import { abrirPainel, eventos, ficticio, painel, reabrirComNovaSessao, temEventoPresencial } from '../support/organizador';

/**
 * Jornada 2 — cupom, convite e cortesia (issue #628, item 2).
 * O gate obrigatorio e a PERSISTENCIA: salvar no rodape, recarregar em sessao
 * limpa e encontrar o beneficio de volta. A aplicacao no checkout fica em
 * teste separado, sem gate, porque depende de evento pago publicado.
 */
test.describe('Jornada 2 — cupons e convites @autenticado @jornada', () => {
  test.skip(!temAutenticacao || !temEventoPresencial,
    'Defina as credenciais e EVOLVIA_E2E_EVENTO_PRESENCIAL_ID.');

  test('jornada-2: cupom salvo no rodape sobrevive ao reload', async ({ page }, testInfo) => {
    const id = eventos.presencial;
    const codigo = ficticio('CUPOM').toUpperCase().replace(/[^A-Z0-9-]/gu, '');

    await abrirPainel(page, painel.beneficios(id));
    const adicionar = page.getByRole('button', { name: /adicionar (cupom|benef(í|i)cio|convite)/iu }).first();
    await expect(adicionar, 'a tela precisa oferecer a criacao de um beneficio').toBeVisible();
    await adicionar.click();

    const campoCodigo = page.getByLabel(/c(ó|o)digo/iu).last();
    await campoCodigo.fill(codigo);
    const desconto = page.getByLabel(/desconto|percentual/iu).last();
    if (await desconto.count()) await desconto.fill('10');

    // "Salvar no rodape": a barra fixa ao fim da tela, conforme o PR #582.
    await page.getByRole('button', { name: /^salvar/iu }).last().click();
    await expect(page.getByRole('alert').filter({ hasText: /erro|n(ã|a)o foi poss(í|i)vel/iu })).toHaveCount(0);

    await reabrirComNovaSessao(page, painel.beneficios(id));
    await expect(page.getByText(codigo, { exact: false }),
      'o cupom precisa voltar do servidor apos novo login').toBeVisible({ timeout: 20_000 });
    await anexarJson(testInfo, 'jornada-2.json', { eventoId: id, codigo });
  });

  test('jornada-2b: cupom aparece na oferta publica do evento pago', async ({ page }) => {
    const slug = process.env.EVOLVIA_E2E_EVENTO_SLUG_PAGO ?? '';
    if (!slug) test.skip(true, 'Defina EVOLVIA_E2E_EVENTO_SLUG_PAGO para checar a aplicacao do cupom.');
    await page.goto(`/evento/${encodeURIComponent(slug)}/inscricao`);
    const campo = page.getByLabel(/c(ó|o)digo de benef(í|i)cio|cupom|convite/iu).first();
    await expect(campo, 'a inscricao publica precisa aceitar codigo de beneficio').toBeVisible();
    // Deliberado: nao concluimos pagamento nem consumimos o cupom.
  });
});
