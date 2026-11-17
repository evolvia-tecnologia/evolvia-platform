import { expect, test, type Locator, type Page } from '@playwright/test';
import { anexarJson, temAutenticacao } from '../support/ambiente';
import { abrirPainel, eventos, ficticio, painel, reabrirComNovaSessao, temEventoPresencial } from '../support/organizador';

/**
 * Jornada 2 — cupom, convite e cortesia (issue #628, item 2).
 *
 * Seletores conferidos contra apps/web/components/registration-benefits-builder.tsx
 * em 03/11/2026. Tres defeitos corrigidos; ver tests/e2e/SELETORES.md.
 *
 * O gate obrigatorio e a PERSISTENCIA: salvar, reabrir em sessao limpa e
 * encontrar o beneficio de volta. A aplicacao no checkout fica em teste
 * separado, sem gate, porque depende de evento pago publicado.
 */

/** Tipos de beneficio, como os botoes aparecem de fato na tela. */
const TIPOS = [
  { rotulo: '+ Convite', nome: 'Convite', aceitaDesconto: false },
  { rotulo: '+ Cupom', nome: 'Cupom', aceitaDesconto: true },
  { rotulo: '+ Cortesia', nome: 'Cortesia', aceitaDesconto: false },
] as const;

/**
 * Adiciona o primeiro tipo de beneficio que a tela realmente permite.
 *
 * Por que nao ha um botao fixo: "+ Cupom" e "+ Cortesia" sao
 * `disabled={!paid}`, e num evento gratuito so "+ Convite" fica clicavel. Um
 * spec que insista em cupom reprova um evento gratuito por uma regra que o
 * produto aplica de proposito.
 *
 * E o rotulo nao e "Adicionar cupom": "Adicionar beneficio" e o aria-label de
 * um <div> container, nao de botao algum.
 */
async function adicionarBeneficioDisponivel(page: Page): Promise<{ nome: string; aceitaDesconto: boolean }> {
  for (const tipo of TIPOS) {
    const botao = page.getByRole('button', { name: tipo.rotulo, exact: true });
    if (await botao.count() && await botao.first().isEnabled()) {
      await botao.first().click();
      return { nome: tipo.nome, aceitaDesconto: tipo.aceitaDesconto };
    }
  }
  throw new Error(
    'Nenhum tipo de beneficio esta habilitado nesta tela. Esperava ao menos '
    + '"+ Convite", que o componente nao condiciona ao modo pago. '
    + 'Se nem ele aparece, a tela nao carregou ou mudou de desenho.',
  );
}

/** Fieldset do beneficio: <legend> e "<Tipo> <indice>", ex. "Convite 1". */
function grupoBeneficio(page: Page, nome: string, indice: number): Locator {
  return page.getByRole('group', { name: new RegExp(`^${nome} ${indice}$`, 'u') });
}

test.describe('Jornada 2 — cupons e convites @autenticado @jornada', () => {
  test.skip(!temAutenticacao || !temEventoPresencial,
    'Defina as credenciais e EVOLVIA_E2E_EVENTO_PRESENCIAL_ID.');

  test('jornada-2: beneficio salvo sobrevive a novo login @gate-compra', async ({ page }, testInfo) => {
    const id = eventos.presencial;
    const codigo = ficticio('CUPOM').toUpperCase().replace(/[^A-Z0-9-]/gu, '');

    await abrirPainel(page, painel.beneficios(id));
    const tipo = await adicionarBeneficioDisponivel(page);
    const indice = await page.getByRole('group', { name: new RegExp(`^${tipo.nome} \\d+$`, 'u') }).count();
    const grupo = grupoBeneficio(page, tipo.nome, indice);
    await expect(grupo).toBeVisible();

    // "Codigo" exato: /codigo/i casaria tambem com a caixa "Codigo ativo".
    const campoCodigo = grupo.getByLabel('Código', { exact: true });
    await expect(campoCodigo,
      'o campo Codigo fica disabled depois do primeiro salvamento; '
      + 'este caso espera um beneficio novo').toBeEnabled();
    await campoCodigo.fill(codigo);

    // Desconto so e editavel em CUPOM; em convite e cortesia vem disabled.
    if (tipo.aceitaDesconto) {
      await grupo.getByLabel(/desconto/iu).fill('10');
    }

    // Unico "Salvar beneficios" da tela, type=submit dentro do <form>.
    const salvar = page.getByRole('button', { name: 'Salvar benefícios' });
    await expect(salvar, 'editar o codigo deveria habilitar o salvamento').toBeEnabled();
    await salvar.click();

    // Confirmacao positiva: o componente usa role=status no sucesso.
    await expect(page.getByRole('status').filter({ hasText: /salvos/iu })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('alert')).toHaveCount(0);

    await reabrirComNovaSessao(page, painel.beneficios(id));
    await expect(page.getByText(codigo, { exact: false }),
      'o beneficio precisa voltar do servidor apos novo login').toBeVisible({ timeout: 20_000 });
    await anexarJson(testInfo, 'jornada-2.json', { eventoId: id, codigo, tipo: tipo.nome });
  });

  test('jornada-2b: inscricao publica do evento pago aceita codigo de beneficio', async ({ page }) => {
    const slug = process.env.EVOLVIA_E2E_EVENTO_SLUG_PAGO ?? '';
    if (!slug) test.skip(true, 'Defina EVOLVIA_E2E_EVENTO_SLUG_PAGO para checar a aplicacao do cupom.');
    await page.goto(`/evento/${encodeURIComponent(slug)}/inscricao`);
    const campo = page.getByLabel(/c(ó|o)digo de benef(í|i)cio|cupom|convite/iu).first();
    await expect(campo, 'a inscricao publica precisa aceitar codigo de beneficio').toBeVisible();
    // Deliberado: nao concluimos pagamento nem consumimos o cupom.
  });

  /**
   * PERGUNTA DE PRODUTO, nao defeito declarado.
   *
   * A CL-04 pede "botao Salvar rodape em beneficios". Neste componente o unico
   * "Salvar beneficios" esta no sectionHeading, no TOPO da tela, dentro do
   * <form>. Nao existe barra de rodape aqui. Ou o requisito nao foi
   * implementado, ou o PR #582 mudou o desenho e a CL-04 ficou desatualizada.
   *
   * Este teste fixa o comportamento ATUAL. Se a barra de rodape chegar, ele
   * falha e obriga a atualizar a expectativa de forma consciente.
   */
  test('jornada-2c: onde esta o botao de salvar beneficios, hoje', async ({ page }, testInfo) => {
    await abrirPainel(page, painel.beneficios(eventos.presencial));
    const salvar = page.getByRole('button', { name: 'Salvar benefícios' });
    await expect(salvar, 'a tela precisa ter "Salvar benefícios"').toHaveCount(1);
    testInfo.annotations.push({
      type: 'pergunta-de-produto',
      description: 'A CL-04 fala de "botao Salvar rodape em beneficios". Hoje o botao '
        + 'esta no cabecalho da secao, nao em barra de rodape, e ha apenas um. '
        + 'Decidir se o requisito vale (e falta implementar) ou se a CL-04 esta '
        + 'desatualizada em relacao ao PR #582.',
    });
  });
});
