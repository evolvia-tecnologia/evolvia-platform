import { expect, test } from '@playwright/test';
import { anexarJson, temAutenticacao } from '../support/ambiente';
import {
  abrirPainel, eventos, ficticio, painel, pdfFicticio,
  reabrirComNovaSessao, temEventoOnline, temEventoPresencial,
} from '../support/organizador';

/**
 * Jornadas do organizador — issue #628, itens 1, 3, 4 e 5.
 * O organizador age como de verdade: configura, salva, recarrega e volta a
 * entrar. Nada de pagamento real nem impressao fisica.
 */

test.describe('Jornada 1 — fundacao, categoria e termos @autenticado @jornada', () => {
  test.skip(!temAutenticacao || !temEventoPresencial,
    'Defina EVOLVIA_E2E_EMAIL, EVOLVIA_E2E_SENHA e EVOLVIA_E2E_EVENTO_PRESENCIAL_ID.');

  test('jornada-1: evento presencial Corrida persiste apos reload e novo login', async ({ page }, testInfo) => {
    const id = eventos.presencial;
    const nomeCategoria = ficticio('Corrida 5km');

    await abrirPainel(page, painel.categoriasLotes(id));
    const adicionar = page.getByRole('button', { name: /adicionar categoria/iu });
    await expect(adicionar, 'a tela de categorias precisa oferecer "Adicionar categoria"').toBeVisible();
    await adicionar.click();

    const campoNome = page.getByLabel(/nome da categoria/iu).last();
    await campoNome.fill(nomeCategoria);

    const adicionarLote = page.getByRole('button', { name: /adicionar lote/iu }).last();
    if (await adicionarLote.count()) await adicionarLote.click();
    const nomeLote = page.getByLabel(/nome do lote/iu).last();
    if (await nomeLote.count()) await nomeLote.fill(ficticio('Lote unico'));

    await page.getByRole('button', { name: /^salvar/iu }).last().click();
    await expect(page.getByRole('alert').filter({ hasText: /erro|n(ã|a)o foi poss(í|i)vel/iu })).toHaveCount(0);

    // Persistencia real: sessao limpa, login de novo, o dado tem de voltar do servidor.
    await reabrirComNovaSessao(page, painel.categoriasLotes(id));
    await expect(page.getByText(nomeCategoria, { exact: false }),
      'a categoria precisa sobreviver a um novo login').toBeVisible({ timeout: 20_000 });
    await anexarJson(testInfo, 'jornada-1.json', { eventoId: id, nomeCategoria });
  });

  test('jornada-1b: PDF de termos e anexado e fica disponivel', async ({ page }, testInfo) => {
    const id = eventos.presencial;
    await abrirPainel(page, painel.ficha(id));

    const entrada = page.locator('input[type="file"]').first();
    if (await entrada.count() === 0) {
      test.skip(true, 'A tela da ficha nao expoe campo de arquivo para os termos neste release.');
    }
    await entrada.setInputFiles({
      name: 'termos-teste.pdf',
      mimeType: 'application/pdf',
      buffer: pdfFicticio('Termos de teste Evolvia'),
    });
    const salvar = page.getByRole('button', { name: /salvar|publicar termos/iu }).last();
    if (await salvar.count()) await salvar.click();

    await reabrirComNovaSessao(page, painel.ficha(id));
    const vinculo = page.getByRole('link', { name: /termos|\.pdf/iu }).first();
    await expect(vinculo, 'o PDF de termos precisa continuar acessivel apos recarregar').toBeVisible({ timeout: 20_000 });
    await anexarJson(testInfo, 'jornada-1b.json', { eventoId: id, anexado: true });
  });
});

/**
 * Jornadas 3 e 4 — o formato do evento deve governar a Transmissao.
 * ATENCAO: na analise estatica de develop@8231d359 a Transmissao e renderizada
 * incondicionalmente em event-workspace.tsx, e transmission-policy.ts nao olha
 * o formato. Estes dois gates devem FALHAR ate que o gating exista; a falha e
 * a evidencia do requisito ausente, nao um defeito do teste.
 */
test.describe('Jornada 3 — evento presencial nao oferece Transmissao @autenticado @jornada', () => {
  test.skip(!temAutenticacao || !temEventoPresencial, 'Defina o evento presencial de teste.');

  test('jornada-3: evento presencial nao oferece Transmissao na sidebar', async ({ page }) => {
    await abrirPainel(page, painel.visaoGeral(eventos.presencial));
    const navegacao = page.getByRole('navigation', { name: /navega(ç|c)(ã|a)o do evento/iu });
    await expect(navegacao.getByRole('link', { name: /transmiss(ã|a)o/iu }),
      'evento presencial nao deve oferecer Transmissao no menu').toHaveCount(0);
  });

  test('jornada-3: acesso direto a Transmissao e recusado em evento presencial', async ({ page }) => {
    await abrirPainel(page, painel.visaoGeral(eventos.presencial));
    const resposta = await page.goto(painel.transmissao(eventos.presencial));
    const status = resposta?.status() ?? 0;
    const recusaVisivel = await page.getByRole('alert').filter({
      hasText: /indispon(í|i)vel|n(ã|a)o dispon(í|i)vel|somente.*online|h(í|i)brido/iu,
    }).count();
    expect(status >= 400 || recusaVisivel > 0,
      `acesso direto deveria ser recusado; status=${status}, aviso=${recusaVisivel}`).toBe(true);
  });

  test('jornada-3: Totens aparece dentro de Credenciamento', async ({ page }) => {
    await abrirPainel(page, painel.visaoGeral(eventos.presencial));
    const grupo = page.getByRole('group', { name: /secretaria e credenciamento/iu });
    await expect(grupo.getByRole('link', { name: /totens/iu })).toBeVisible();
    const totens = grupo.getByRole('link', { name: /totens/iu });
    await expect(totens).toHaveAttribute('href', /\/painel\/check-in#totens$/u);
  });
});

test.describe('Jornada 4 — evento online oferece Transmissao @autenticado @jornada', () => {
  test.skip(!temAutenticacao || !temEventoOnline,
    'Defina EVOLVIA_E2E_EVENTO_ONLINE_ID com um evento Online ou Hibrido.');

  test('jornada-4: evento online oferece Transmissao', async ({ page }) => {
    await abrirPainel(page, painel.visaoGeral(eventos.online));
    const navegacao = page.getByRole('navigation', { name: /navega(ç|c)(ã|a)o do evento/iu });
    await expect(navegacao.getByRole('link', { name: /transmiss(ã|a)o/iu })).toBeVisible();
    await abrirPainel(page, painel.transmissao(eventos.online));
    await expect(page.getByRole('heading', { name: /transmiss(ã|a)o/iu }).first()).toBeVisible();
  });
});

test.describe('Jornada 5 — responsavel financeiro @autenticado @jornada', () => {
  test.skip(!temAutenticacao || !temEventoPresencial, 'Defina o evento presencial de teste.');

  test('jornada-5: responsavel financeiro permite corrigir dados PF/PJ', async ({ page }, testInfo) => {
    await abrirPainel(page, painel.financeiro(eventos.presencial));
    const acao = page.getByRole('button', { name: /corrigir|alterar dados|editar/iu }).first();
    await expect(acao, 'o organizador precisa poder corrigir os dados do responsavel').toBeVisible();
    await expect(acao).toBeEnabled();
    await acao.click();
    const formulario = page.getByRole('textbox').first();
    await expect(formulario, 'ao corrigir, algum campo deve ficar editavel').toBeVisible();
    await anexarJson(testInfo, 'jornada-5.json', { eventoId: eventos.presencial, acaoVisivel: true });
  });
});
