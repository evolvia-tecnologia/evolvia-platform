import { expect, test, type Page } from '@playwright/test';
import { anexarJson, temAutenticacao } from '../support/ambiente';
import { abrirPainel, eventos, painel, temEventoPresencial } from '../support/organizador';

/**
 * Dados legais da organizacao: /organizacoes/{id}/dados-fiscais
 *
 * Esta spec substitui a `jornada-5b`, que ficou marcada `test.fixme` em
 * jornada-organizador.spec.ts porque eu nao tinha conferido a tela. Conferida
 * em 03/11/2026 contra:
 *   apps/web/app/organizacoes/[id]/dados-fiscais/page.tsx
 *   apps/api/src/organization-legal-policy.ts
 *
 * Nao escrevi antes justamente para nao repetir o erro das seis primeiras
 * telas: inventar rotulo plausivel. Os rotulos reais sao abaixo, e dois deles
 * eu teria errado.
 *
 * Duas armadilhas que a leitura revelou
 * -------------------------------------
 * 1. OS ROTULOS TROCAM com o tipo de responsavel:
 *
 *      {profile.kind === 'COMPANY' ? 'Razao social' : 'Nome completo'}
 *      {profile.kind === 'COMPANY' ? 'CNPJ' : 'CPF'}
 *
 *    E `Nome fantasia (opcional)` so existe em COMPANY. Um teste que fixasse
 *    'CNPJ' falharia em PF, e vice-versa -- vermelho falso contra um
 *    comportamento correto. Por isso o helper `campos(kind)` abaixo.
 *
 * 2. HA DOIS `role=status` na tela, e eles significam coisas opostas:
 *
 *      {loading ? <p role="status">Carregando dados...</p> : ...}
 *      {saved && <div role="status">Dados salvos. ...</div>}
 *
 *    Um `getByRole('status')` ingenuo casa o de carregamento e passaria sem
 *    nada ter sido salvo -- o mesmo falso-verde de "ausencia de erro" que
 *    corrigi nas outras jornadas. Aqui o status vai sempre filtrado por texto.
 *
 * Por que esta spec NAO salva por padrao
 * --------------------------------------
 * Salvar aqui sobrescreve o perfil legal da organizacao inteira -- razao
 * social, documento, endereco, carteira de repasse. E mais invasivo que criar
 * uma categoria de teste: afeta uma entidade, nao um evento.
 *
 * Entao o caminho positivo fica atras de EVOLVIA_E2E_PERMITIR_ESCRITA_LEGAL=1,
 * um opt-in explicito. O que roda sempre e o caminho NEGATIVO, que o servidor
 * recusa em normalizeLegalProfile ANTES de qualquer escrita -- logo nao muda
 * dado nenhum e ainda assim prova um controle real.
 *
 * Observacao sobre privacidade, para quem revisar
 * ----------------------------------------------
 * Esta tela mostra o documento COMPLETO, em input de texto:
 *   <input ... value={profile.taxId} ... />
 * Isso esta CORRETO e nao deve ser "corrigido" com mascara: e a tela de
 * edicao, e ninguem edita o que nao ve. O contraste e com
 * apps/web/app/eventos/[id]/painel/financeiro/page.tsx, que apenas CONFIRMA e
 * por isso mascara com maskTaxId ("terminado em XX"). A jornada-5 assere a
 * mascara la; aqui asserir mascara seria pedir defeito.
 */

/** Dados ficticios, conferidos contra cpfValid/cnpjValid da propria API. */
const DOCUMENTOS = {
  /** CPF de teste classico. Valido pelo algoritmo, nao pertence a ninguem. */
  PERSON: '52998224725',
  /** CNPJ ficticio padrao 11.222.333/0001-81. Digitos recalculados e conferidos. */
  COMPANY: '11222333000181',
} as const;

/** UUID no formato que organizerWallet() exige. Nao e carteira real. */
const CARTEIRA_VALIDA = '8f2c1d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

/**
 * Formato de chave de API do Asaas. O proprio rotulo do campo pede para NAO
 * colar isto; o teste prova que o servidor tambem recusa, e nao so pede.
 * Valor inventado, com o prefixo que o Asaas usa -- nenhuma credencial real.
 */
const CHAVE_DE_API_FALSA = '$aact_NAO_E_CREDENCIAL_REAL_apenas_formato';

type Kind = 'PERSON' | 'COMPANY';

/** Os rotulos trocam com o tipo. Ver armadilha 1 no cabecalho. */
function campos(kind: Kind) {
  return {
    nome: kind === 'COMPANY' ? 'Razão social' : 'Nome completo',
    documento: kind === 'COMPANY' ? 'CNPJ' : 'CPF',
  };
}

const salvar = (page: Page) => page.getByRole('button', { name: 'Salvar dados da organização' });
const sucesso = (page: Page) => page.getByRole('status').filter({ hasText: /dados salvos/iu });
const permitirEscrita = process.env.EVOLVIA_E2E_PERMITIR_ESCRITA_LEGAL === '1';

/** Chega pela tela financeira, pelo link conferido -- sem adivinhar o id da organizacao. */
async function abrirDadosFiscais(page: Page): Promise<void> {
  await abrirPainel(page, painel.financeiro(eventos.presencial));
  const link = page.getByRole('link', { name: /dados PF\/PJ da organiza(ç|c)(ã|a)o/iu });
  await expect(link,
    'o link para os dados legais vem de financeiro/page.tsx e e o caminho que o '
    + 'organizador usa; sem ele seria preciso adivinhar o id da organizacao.')
    .toBeVisible();
  await link.click();
  await expect(page.getByRole('heading', { level: 1, name: /quem responde pela organiza(ç|c)(ã|a)o/iu })).toBeVisible();
  // Espera o carregamento sair: o <p role=status>Carregando dados</p> desaparece.
  await expect(page.getByRole('status').filter({ hasText: /carregando dados/iu })).toHaveCount(0);
}

test.describe('Dados legais da organizacao @autenticado', () => {
  test.skip(!temAutenticacao, 'Defina as credenciais de homologacao.');
  test.skip(!temEventoPresencial, 'Defina EVOLVIA_E2E_EVENTO_PRESENCIAL_ID ou EVOLVIA_E2E_EVENTO_ID.');

  test('jornada-5b: a tela edita PF e PJ, trocando os rotulos @gate-financeiro', async ({ page }, testInfo) => {
    await abrirDadosFiscais(page);

    const tipo = page.getByRole('group', { name: 'Tipo de responsável' });
    await expect(tipo, 'o <fieldset> com <legend>Tipo de responsável</legend>').toBeVisible();

    // PJ: razao social, CNPJ e nome fantasia.
    await tipo.getByLabel('Pessoa jurídica').check();
    const pj = campos('COMPANY');
    await expect(page.getByLabel(pj.nome, { exact: true })).toBeVisible();
    await expect(page.getByLabel(pj.documento, { exact: true })).toBeVisible();
    await expect(page.getByLabel('Nome fantasia (opcional)', { exact: true }),
      'nome fantasia existe apenas em pessoa juridica').toBeVisible();

    // PF: os rotulos trocam e o nome fantasia desaparece.
    await tipo.getByLabel('Pessoa física').check();
    const pf = campos('PERSON');
    await expect(page.getByLabel(pf.nome, { exact: true }),
      `em pessoa fisica o rotulo vira "${pf.nome}"`).toBeVisible();
    await expect(page.getByLabel(pf.documento, { exact: true }),
      `em pessoa fisica o rotulo vira "${pf.documento}"`).toBeVisible();
    await expect(page.getByLabel('Nome fantasia (opcional)', { exact: true }),
      'nome fantasia nao se aplica a pessoa fisica e precisa sair da tela').toHaveCount(0);
    await expect(page.getByLabel(pj.nome, { exact: true }),
      'os rotulos de PJ nao podem sobrar na tela em modo PF').toHaveCount(0);

    // Endereco: a secao e os campos obrigatorios existem.
    await expect(page.getByRole('heading', { level: 2, name: /endere(ç|c)o da entidade/iu })).toBeVisible();
    for (const rotulo of ['CEP', 'Logradouro', 'Número', 'Bairro', 'Cidade', 'UF']) {
      await expect(page.getByLabel(rotulo, { exact: true }), `campo "${rotulo}"`).toBeVisible();
    }

    await anexarJson(testInfo, 'dados-fiscais-rotulos.json', { pj, pf });
  });

  test('a carteira de repasse recusa chave de API, nao so avisa @gate-financeiro', async ({ page }, testInfo) => {
    /**
     * O rotulo do campo diz "Nao cole chave de API, token nem senha". Aviso em
     * texto nao e controle. Este teste prova que organizerWallet() no servidor
     * tambem recusa:
     *
     *   if (!/^[0-9a-f]{8}-[0-9a-f]{4}-...-[0-9a-f]{12}$/iu.test(value.trim()))
     *     throw new LegalProfileError('Informe o identificador da carteira
     *       Asaas. Nao use chave de API, token nem senha.');
     *
     * Nao destrutivo de proposito: normalizeLegalProfile lanca ANTES de
     * escrever, entao o perfil da organizacao nao muda. Por isso este caso roda
     * sempre, sem opt-in.
     *
     * Se um dia esse controle cair, uma credencial de pagamento passaria a ser
     * gravada em texto no banco. E o tipo de regressao que ninguem percebe
     * olhando a tela.
     */
    await abrirDadosFiscais(page);

    const requisicoes: number[] = [];
    page.on('response', (resposta) => {
      if (resposta.url().includes('/legal-profile') && resposta.request().method() === 'PUT') {
        requisicoes.push(resposta.status());
      }
    });

    const tipo = page.getByRole('group', { name: 'Tipo de responsável' });
    await tipo.getByLabel('Pessoa jurídica').check();
    const { nome, documento } = campos('COMPANY');

    await page.getByLabel(nome, { exact: true }).fill('EVOLVIA TESTES HOMOLOGACAO LTDA');
    await page.getByLabel(documento, { exact: true }).fill(DOCUMENTOS.COMPANY);
    await page.getByLabel('E-mail de contato', { exact: true }).fill('homologacao@exemplo.invalid');
    await page.getByLabel('CEP', { exact: true }).fill('01001000');
    await page.getByLabel('Logradouro', { exact: true }).fill('Praca da Se');
    await page.getByLabel('Número', { exact: true }).fill('1');
    await page.getByLabel('Bairro', { exact: true }).fill('Centro');
    await page.getByLabel('Cidade', { exact: true }).fill('Sao Paulo');
    await page.getByLabel('UF', { exact: true }).fill('SP');

    const carteira = page.getByLabel('Carteira Asaas para repasse', { exact: true });
    await carteira.fill(CHAVE_DE_API_FALSA);
    await salvar(page).click();

    const erro = page.getByRole('alert');
    await expect(erro,
      'uma chave de API no campo da carteira precisa ser RECUSADA pelo servidor. '
      + 'O aviso no rotulo pede; organizerWallet() em '
      + 'apps/api/src/organization-legal-policy.ts exige UUID. Se este caso '
      + 'passar a salvar, uma credencial de pagamento vai para o banco em texto.')
      .toBeVisible();
    await expect(erro).toContainText(/carteira|chave de API|token/iu);

    await expect(sucesso(page),
      'nao pode haver confirmacao de salvamento com a carteira recusada')
      .toHaveCount(0);

    await anexarJson(testInfo, 'carteira-recusada.json', {
      statusDoPut: requisicoes,
      observacao: 'normalizeLegalProfile lanca antes de escrever; nada foi gravado',
    });
    expect(requisicoes.every((status) => status >= 400),
      `todo PUT precisa ter sido recusado; vi ${JSON.stringify(requisicoes)}`).toBe(true);
  });

  test('a carteira em formato UUID e aceita @gate-financeiro', async ({ page }, testInfo) => {
    /**
     * Contraprova do caso acima. Sem ela, um servidor que recusasse QUALQUER
     * carteira passaria no teste anterior.
     *
     * Este caso salva, entao exige opt-in: sobrescreve o perfil legal da
     * organizacao. O SKIP e declarado, com a variavel nomeada -- nao e
     * capacidade ausente do produto.
     */
    test.skip(!permitirEscrita,
      'Este caso SOBRESCREVE o perfil legal da organizacao (razao social, '
      + 'documento, endereco, carteira de repasse). Para rodar, defina '
      + 'EVOLVIA_E2E_PERMITIR_ESCRITA_LEGAL=1 e use uma organizacao ficticia. '
      + 'SKIP declarado por seguranca de dados, nao por falta de capacidade.');

    await abrirDadosFiscais(page);

    const tipo = page.getByRole('group', { name: 'Tipo de responsável' });
    await tipo.getByLabel('Pessoa jurídica').check();
    const { nome, documento } = campos('COMPANY');

    await page.getByLabel(nome, { exact: true }).fill('EVOLVIA TESTES HOMOLOGACAO LTDA');
    await page.getByLabel(documento, { exact: true }).fill(DOCUMENTOS.COMPANY);
    await page.getByLabel('E-mail de contato', { exact: true }).fill('homologacao@exemplo.invalid');
    await page.getByLabel('CEP', { exact: true }).fill('01001000');
    await page.getByLabel('Logradouro', { exact: true }).fill('Praca da Se');
    await page.getByLabel('Número', { exact: true }).fill('1');
    await page.getByLabel('Bairro', { exact: true }).fill('Centro');
    await page.getByLabel('Cidade', { exact: true }).fill('Sao Paulo');
    await page.getByLabel('UF', { exact: true }).fill('SP');
    await page.getByLabel('Carteira Asaas para repasse', { exact: true }).fill(CARTEIRA_VALIDA);

    await salvar(page).click();

    /**
     * Confirmacao POSITIVA, filtrada por texto. `getByRole('status')` sozinho
     * casaria o <p role=status>Carregando dados</p> e passaria sem salvar.
     */
    await expect(sucesso(page),
      'o salvamento precisa confirmar com role=status contendo "Dados salvos". '
      + 'Checar apenas ausencia de role=alert passaria sem ter salvo.')
      .toBeVisible();

    /**
     * A propria mensagem de sucesso diz que a entidade NAO foi verificada para
     * emissao fiscal. Isso e importante para o percentual: salvar dados legais
     * nao e aceite de homologacao fiscal.
     */
    await expect(sucesso(page)).toContainText(/n(ã|a)o foi verificada/iu);
    await anexarJson(testInfo, 'dados-fiscais-salvos.json', { carteiraAceita: true, verificada: false });
  });
});
