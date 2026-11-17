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
 *   apps/web/components/registration-form-builder.tsx
 *   apps/web/components/event-workspace.tsx
 *   apps/web/app/eventos/[id]/painel/financeiro/page.tsx
 * Ver tests/e2e/SELETORES.md. Sete defeitos foram corrigidos aqui; estao
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

  /**
   * jornada-1b: anexar o PDF dos termos.
   *
   * Conferido em 03/11/2026 contra
   * apps/web/components/registration-form-builder.tsx. A versao anterior tinha
   * DOIS defeitos, os dois produzindo vermelho falso.
   *
   * 1. O BOTAO ERRADO. Eu usava:
   *
   *      page.getByRole('button', { name: /salvar|publicar termos/iu }).last()
   *
   *    Nao existe botao assim para os termos. O botao e `Anexar PDF` -- ou
   *    `Substituir PDF` quando ja ha um anexado, ou `Anexando...` enquanto
   *    envia. O que /salvar/ casava era `Salvar rascunho`, que salva os CAMPOS
   *    da ficha: outra acao, outro endpoint. E ele e
   *    `disabled={!dirty || Boolean(saving)}`, entao sem alteracao pendente o
   *    clique estouraria o timeout; com alteracao, salvaria o rascunho e NAO
   *    anexaria o PDF. Nos dois caminhos, vermelho falso.
   *
   * 2. UM LINK QUE NAO EXISTE. Eu afirmava:
   *
   *      page.getByRole('link', { name: /termos|\.pdf/iu })
   *
   *    Depois de anexar, a tela nao mostra link. Mostra
   *      <p>Anexado: {fileName} - versao {version}</p>
   *    e um BOTAO `Abrir PDF anexado`. Procurar link ali nunca acha nada.
   *
   * Tres armadilhas a mais que a leitura revelou:
   *
   * - HA DOIS input[type=file] na tela. O dos termos e o da previa do campo
   *   PHOTO (`<input disabled type="file" accept="image/*">`). O `.first()`
   *   acertava por ordem no DOM, nao por intencao: uma reordenacao da previa
   *   passaria a preencher o campo de foto. Agora vai pelo rotulo real,
   *   `PDF dos termos`.
   *
   * - `Anexar PDF` e `disabled={!termsFile || termsBusy}`: ele so habilita
   *   DEPOIS de escolher o arquivo. Clicar antes nao faz nada.
   *
   * - HA DOIS role=status possiveis: o aviso de "crie primeiro as categorias"
   *   (quando registrationCategories esta vazio) e o `notice` de sucesso. Um
   *   getByRole('status') sem filtro casaria o primeiro e passaria sem ter
   *   anexado nada. Por isso o status vai filtrado por texto.
   *
   * O limite de 5 MB e a exigencia de extensao .pdf sao checados no cliente
   * (attachTerms), antes de qualquer envio.
   */
  test('jornada-1b: PDF de termos e anexado e fica disponivel', async ({ page }, testInfo) => {
    const id = eventos.presencial;
    await abrirPainel(page, painel.ficha(id));

    // Pelo rotulo, nao por input[type=file]: ha dois na tela.
    const entrada = page.getByLabel('PDF dos termos');
    await expect(entrada,
      'a caixa de termos da previa expoe <label>PDF dos termos<input type="file">. '
      + 'Se este rotulo mudou, confira registration-form-builder.tsx antes de '
      + 'ajustar o seletor.').toHaveCount(1);

    // O nome cabe no limite real de 75 caracteres de registrationTermsFileName;
    // ver tests/e2e/specs/consentimento-pdf.spec.ts.
    await entrada.setInputFiles({
      name: 'termos-teste.pdf',
      mimeType: 'application/pdf',
      buffer: pdfFicticio('Termos de teste Evolvia'),
    });

    // `Anexar PDF` quando nao ha anexo; `Substituir PDF` quando ja ha.
    const anexar = page.getByRole('button', { name: /^(anexar|substituir) PDF$/iu });
    await expect(anexar,
      'o botao dos termos e "Anexar PDF" ou "Substituir PDF". Nao e '
      + '"Salvar rascunho", que salva os campos da ficha e nao o PDF.')
      .toHaveCount(1);
    await expect(anexar,
      'o botao e disabled={!termsFile || termsBusy}; escolher o arquivo deveria '
      + 'habilita-lo').toBeEnabled();
    await anexar.click();

    // Confirmacao POSITIVA, filtrada: ha outro role=status na tela.
    await expect(page.getByRole('status').filter({ hasText: /PDF dos termos anexado/iu }),
      'o anexo precisa confirmar com o aviso "PDF dos termos anexado: ...". '
      + 'Checar apenas ausencia de role=alert passaria sem ter anexado.')
      .toBeVisible({ timeout: 20_000 });

    // Persistencia real: sessao limpa, login de novo, o anexo volta do servidor.
    await reabrirComNovaSessao(page, painel.ficha(id));
    /**
     * Ancorado em `^Anexado:`. Sem a ancora, o regex casa TAMBEM o aviso de
     * sucesso "PDF dos termos anexado: termos-teste.pdf." -- dois elementos,
     * strict mode violation. Eu cometi esse erro aqui e a fixture pegou: e a
     * mesma causa-raiz 2 do SELETORES.md, ignorar multiplicidade, repetida
     * dentro da correcao dela.
     */
    await expect(page.getByText(/^Anexado:\s*termos-teste\.pdf/u),
      'o nome do arquivo precisa reaparecer apos novo login, vindo do servidor')
      .toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Abrir PDF anexado' }),
      'com o PDF anexado a tela oferece o botao "Abrir PDF anexado" -- e botao, '
      + 'nao link: ele busca o arquivo com Authorization e abre por blob URL.')
      .toBeVisible();

    await anexarJson(testInfo, 'jornada-1b.json', { eventoId: id, anexado: true, arquivo: 'termos-teste.pdf' });
  });

  /**
   * Contraprova do controle de versionamento: sem PDF de termos, a tela nao
   * deixa preservar versao.
   *
   *   disabled={dirty || payload.form.revision < 1 || Boolean(saving)
   *             || !payload.termsDocument}
   *
   * Isto e um controle de consentimento, nao conveniencia: versionar uma ficha
   * sem o PDF que o participante aceita deixaria o aceite sem documento. O
   * botao e "Preservar versao para testes" -- nao "Publicar".
   */
  test('jornada-1c: sem PDF de termos nao da para preservar versao', async ({ page }, testInfo) => {
    await abrirPainel(page, painel.ficha(eventos.presencial));

    const preservar = page.getByRole('button', { name: /preservar vers(ã|a)o para testes/iu });
    await expect(preservar,
      'o botao de versionamento e "Preservar versao para testes"').toHaveCount(1);

    // Ancorado: sem `^`, contaria tambem o aviso de sucesso.
    const temAnexo = await page.getByText(/^Anexado:/u).count();
    const avisoDeTermos = await page.getByText(/anexe o PDF dos termos antes de preservar/iu).count();

    await anexarJson(testInfo, 'jornada-1c.json', { temAnexo, avisoDeTermos });

    if (temAnexo === 0) {
      await expect(preservar,
        'sem PDF de termos o versionamento precisa ficar bloqueado: versionar '
        + 'uma ficha sem o documento deixaria o aceite do participante sem '
        + 'termo.').toBeDisabled();
      expect(avisoDeTermos,
        'a tela precisa explicar por que o botao esta bloqueado').toBeGreaterThan(0);
    } else {
      // Com anexo presente, o bloqueio por termos nao se aplica -- o aviso
      // especifico de termos nao deve aparecer.
      expect(avisoDeTermos,
        'com o PDF anexado, o aviso de "anexe o PDF dos termos" nao faz sentido')
        .toBe(0);
    }
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

/**
 * Jornada 5 — responsavel financeiro.
 *
 * A versao anterior desta jornada estava mal modelada, nao apenas com seletor
 * errado. Ela procurava um botao /corrigir|alterar dados|editar/ e, depois de
 * clicar, um textbox editavel. Conferido contra
 * apps/web/app/eventos/[id]/painel/financeiro/page.tsx:
 *
 *   - nao existe botao de corrigir: o unico botao e "Confirmar responsavel
 *     financeiro" (ou "Confirmar novamente", quando ja confirmado);
 *   - a tela NAO edita dados PF/PJ. Ela confirma. A edicao mora em outra tela,
 *     alcancada por um <Link> para /organizacoes/{orgId}/dados-fiscais;
 *   - a tela nao tem textbox nenhum. Os unicos campos sao dois radio de
 *     "Quem paga a comissao".
 *
 * Entao a jornada passa a testar o que a tela faz de fato, e a edicao de PF/PJ
 * virou spec propria: tests/e2e/specs/dados-fiscais.spec.ts, escrita depois de
 * conferir /organizacoes/{id}/dados-fiscais. O test.fixme que ficava aqui foi
 * removido por isso -- deixa-lo seria sinal falso de pendencia.
 */
test.describe('Jornada 5 — responsavel financeiro @autenticado @jornada', () => {
  test.skip(!temAutenticacao || !temEventoPresencial, 'Defina o evento presencial de teste.');

  test('jornada-5: a tela confirma o responsavel e mascara o documento', async ({ page }, testInfo) => {
    await abrirPainel(page, painel.financeiro(eventos.presencial));
    await expect(page.getByRole('heading', { name: 'Responsável financeiro', level: 1 })).toBeVisible();

    const semCadastro = page.getByText(/cadastre primeiro os dados PF\/PJ/iu);
    if (await semCadastro.count()) {
      test.skip(true,
        'A organizacao ainda nao tem dados PF/PJ cadastrados, entao a tela mostra '
        + 'apenas a orientacao de cadastro. Cadastre para exercitar a confirmacao.');
    }

    // Privacidade: o documento aparece mascarado por maskTaxId ("terminado em XX"),
    // nunca completo. Isto e assercao de verdade, nao enfeite — um CPF inteiro
    // vazando na tela do organizador seria achado de seguranca.
    const documento = page.getByRole('definition').filter({ hasText: /terminado em \w{2}|documento protegido/iu });
    await expect(documento,
      'o CPF/CNPJ precisa aparecer mascarado; maskTaxId devolve "terminado em XX"').toHaveCount(1);
    await expect(page.getByText(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/u),
      'nenhum CPF completo pode aparecer nesta tela').toHaveCount(0);

    // O botao e de confirmacao, e so habilita nos status editaveis
    // (DRAFT, SETUP, HOMOLOGATION).
    const confirmar = page.getByRole('button', { name: /confirmar (responsável financeiro|novamente)/iu });
    await expect(confirmar).toHaveCount(1);

    // A correcao dos dados sai desta tela por link, para a organizacao.
    const paraOrganizacao = page.getByRole('link', { name: /dados PF\/PJ da organiza(ç|c)(ã|a)o/iu });
    await expect(paraOrganizacao,
      'a tela precisa oferecer o caminho para revisar os dados PF/PJ').toBeVisible();
    await expect(paraOrganizacao).toHaveAttribute('href', /\/organizacoes\/[^/]+\/dados-fiscais$/u);

    // Quem paga a comissao: dois radio, no fieldset com esse legend.
    const comissao = page.getByRole('group', { name: /quem paga a comiss(ã|a)o/iu });
    await expect(comissao.getByRole('radio')).toHaveCount(2);

    await anexarJson(testInfo, 'jornada-5.json', {
      eventoId: eventos.presencial,
      documentoMascarado: true,
      confirmacaoPresente: true,
    });
  });
});
