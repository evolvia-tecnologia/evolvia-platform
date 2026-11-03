import { expect, test, type Locator, type Page } from '@playwright/test';
import { anexarJson, temAutenticacao } from '../support/ambiente';
import {
  abrirPainel, eventos, ficticio, painel, pdfFicticio,
  reabrirComNovaSessao, temEventoOnline, temEventoPresencial,
} from '../support/organizador';

/**
 * Jornadas do organizador — issue #628, itens 1, 3, 4 e 5.
 * O organizador age como de verdade: configura, salva, recarrega e volta a
 * entrar. Nada de pagamento real nem impressao fisica.
 *
 * Seletores conferidos contra o codigo real em 03/11/2026:
 *   apps/web/components/registration-commercial-builder.tsx
 *   apps/web/components/event-workspace.tsx
 * Ver tests/e2e/SELETORES.md. Quatro defeitos foram corrigidos aqui; estao
 * listados la, com o que cada um produziria se tivesse ido para homologacao.
 */

/**
 * Fieldset de uma categoria. <fieldset> expoe role=group e usa o <legend> como
 * nome acessivel, entao "Categoria 1" e um alvo estavel — ao contrario das
 * classes de CSS Module, que sao hasheadas no build e nao servem de seletor.
 */
function grupoCategoria(page: Page, indice = 1): Locator {
  return page.getByRole('group', { name: new RegExp(`^Categoria ${indice}$`, 'u') });
}

/**
 * Campo "Nome" de uma categoria.
 *
 * O rotulo e exatamente `Nome`, nao "Nome da categoria". E dentro do fieldset
 * da categoria existem DOIS campos `Nome`: o dela e o do lote aninhado. A
 * ordem no DOM resolve — o da categoria vem primeiro — mas a contagem fica
 * asserida, para que uma reordenacao futura falhe aqui em vez de preencher o
 * campo errado silenciosamente.
 */
async function nomeDaCategoria(page: Page, indice = 1): Promise<Locator> {
  const grupo = grupoCategoria(page, indice);
  const campos = grupo.getByLabel('Nome', { exact: true });
  expect(await campos.count(),
    'esperava 2 campos "Nome" no fieldset da categoria: o dela e o do lote aninhado. '
    + 'Se mudou, o escopo abaixo deixou de ser confiavel.').toBe(2);
  return campos.first();
}

/** Campo "Nome" de um lote, escopado ao fieldset do proprio lote. */
function nomeDoLote(page: Page, categoria = 1, lote = 1): Locator {
  return grupoCategoria(page, categoria)
    .getByRole('group', { name: new RegExp(`^Lote ${lote}$`, 'u') })
    .getByLabel('Nome', { exact: true });
}

/**
 * Abre a tela de categorias deixando pelo menos uma categoria em edicao.
 *
 * Num evento sem categoria nenhuma o componente mostra "Criar primeira
 * categoria"; com categorias, mostra "Adicionar categoria" — duas vezes, no
 * cabecalho e no rodape. Tratar os dois estados aqui evita que a jornada
 * reprove um evento novo por um botao que legitimamente nao existe ainda.
 */
async function garantirCategoriaEmEdicao(page: Page): Promise<void> {
  const primeira = page.getByRole('button', { name: 'Criar primeira categoria' });
  if (await primeira.count()) { await primeira.click(); return; }
  const adicionar = page.getByRole('button', { name: 'Adicionar categoria' }).first();
  await expect(adicionar, 'a tela precisa oferecer "Adicionar categoria" ou "Criar primeira categoria"')
    .toBeVisible();
  await adicionar.click();
}

/** "Salvar configuracao" tambem aparece duas vezes; o do rodape e o ultimo. */
function salvarConfiguracao(page: Page): Locator {
  return page.getByRole('button', { name: 'Salvar configuração' }).last();
}

test.describe('Jornada 1 — fundacao, categoria e termos @autenticado @jornada', () => {
  test.skip(!temAutenticacao || !temEventoPresencial,
    'Defina EVOLVIA_E2E_EMAIL, EVOLVIA_E2E_SENHA e EVOLVIA_E2E_EVENTO_PRESENCIAL_ID.');

  test('jornada-1: categoria e lote persistem apos novo login', async ({ page }, testInfo) => {
    const id = eventos.presencial;
    const nomeCategoria = ficticio('Corrida 5km');
    const nomeLote = ficticio('Lote unico');

    await abrirPainel(page, painel.categoriasLotes(id));
    await garantirCategoriaEmEdicao(page);

    const indice = await page.getByRole('group', { name: /^Categoria \d+$/u }).count();
    (await nomeDaCategoria(page, indice)).fill(nomeCategoria);
    await nomeDoLote(page, indice, 1).fill(nomeLote);

    // O botao so habilita quando ha mudanca pendente (canSave = dirty && ...).
    const salvar = salvarConfiguracao(page);
    await expect(salvar, 'editar o nome deveria habilitar o salvamento').toBeEnabled();
    await salvar.click();

    // O componente confirma por role=status; erro vem por role=alert.
    await expect(page.getByRole('status').filter({ hasText: /salvos/iu })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('alert')).toHaveCount(0);

    // Persistencia real: sessao limpa, login de novo, o dado tem de voltar do servidor.
    await reabrirComNovaSessao(page, painel.categoriasLotes(id));
    await expect(page.getByText(nomeCategoria, { exact: false }),
      'a categoria precisa sobreviver a um novo login').toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(nomeLote, { exact: false }),
      'o lote precisa sobreviver a um novo login').toBeVisible({ timeout: 20_000 });
    await anexarJson(testInfo, 'jornada-1.json', { eventoId: id, nomeCategoria, nomeLote });
  });

  test('jornada-1b: PDF de termos e anexado e fica disponivel', async ({ page }, testInfo) => {
    const id = eventos.presencial;
    await abrirPainel(page, painel.ficha(id));

    const entrada = page.locator('input[type="file"]').first();
    if (await entrada.count() === 0) {
      test.skip(true, 'A tela da ficha nao expoe campo de arquivo para os termos neste release.');
    }
    // O nome cabe no limite real de 75 caracteres de registrationTermsFileName;
    // ver tests/e2e/specs/consentimento-pdf.spec.ts.
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
 *
 * Confirmado em 03/11 contra event-workspace.tsx: a Transmissao e renderizada
 * SEM guarda, enquanto isShow, hasExhibitors e isScientific condicionam os
 * vizinhos. E event-flow.ts nao exporta nenhum predicado de formato, nem
 * WorkspacePayload carrega `format` — sao quatro camadas, nao tres. A API
 * tambem nao olha o formato (transmission-policy.ts valida kind, title e url).
 *
 * Estes gates devem FALHAR ate o #627 corrigir. A falha e a evidencia do
 * requisito ausente, nao defeito do teste. Nao conserte afrouxando.
 */
test.describe('Jornada 3 — evento presencial nao oferece Transmissao @autenticado @jornada', () => {
  test.skip(!temAutenticacao || !temEventoPresencial, 'Defina o evento presencial de teste.');

  test('jornada-3: evento presencial nao oferece Transmissao na sidebar @gate-permissao', async ({ page }) => {
    await abrirPainel(page, painel.visaoGeral(eventos.presencial));
    const navegacao = page.getByRole('navigation', { name: /navega(ç|c)(ã|a)o do evento/iu });
    await expect(navegacao.getByRole('link', { name: /transmiss(ã|a)o/iu }),
      'evento presencial nao deve oferecer Transmissao no menu').toHaveCount(0);
  });

  test('jornada-3: acesso direto a Transmissao e recusado em evento presencial @gate-permissao', async ({ page }) => {
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
    // Conferido: event-workspace.tsx tem role="group" aria-label="Secretaria e
    // credenciamento", com Credenciamento e Totens dentro.
    const grupo = page.getByRole('group', { name: /secretaria e credenciamento/iu });
    const totens = grupo.getByRole('link', { name: /totens/iu });
    await expect(totens).toBeVisible();
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

  // ATENCAO: os seletores desta jornada ainda NAO foram conferidos contra o
  // componente da tela financeira. Ver SELETORES.md, secao "pendente".
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
