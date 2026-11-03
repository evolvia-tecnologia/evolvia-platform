import type { Page } from '@playwright/test';

/**
 * Deteccao de capacidade da versao implantada.
 *
 * Por que existe: a suite e escrita contra o produto que esta chegando, mas
 * roda contra o que ja esta publicado. Quando um controle ainda nao existe no
 * ambiente, o resultado honesto e SKIP com a dependencia nomeada -- nao FAIL
 * (que culparia o produto por algo que nao prometeu) e nao um teste afrouxado
 * (que esconderia a regressao quando o controle chegar).
 *
 * Erro real que isto corrige: na primeira versao do PR #625 os testes do editor
 * de etiquetas afirmavam os controles de formatacao (alinhamento, negrito, cor,
 * fonte, tamanho). Conferindo o seletor contra
 * apps/web/components/credential-category-templates.tsx na base do #625,
 * esses controles NAO existem ali: eles chegam com o PR #614. Rodando contra
 * develop, aqueles testes falhariam apontando defeito inexistente.
 *
 * Regra: capacidade ausente => SKIP com motivo. Capacidade presente => assercao
 * integral, sem tolerancia.
 *
 * Regra complementar, aprendida em 03/11/2026: o detector tem de ser ESTREITO.
 * Um detector largo declara a capacidade presente quando ela nao esta, e ai as
 * assercoes integrais disparam contra a develop -- o vermelho falso que ele
 * deveria evitar. Ver temAvisoDeAjuste abaixo.
 */

export type Capacidade = {
  nome: string;
  presente: boolean;
  origem: string;
};

/** Barra de formatacao por campo da etiqueta. Chega com o PR #614. */
export async function temBarraDeFormatacao(page: Page): Promise<Capacidade> {
  const presente = await page
    .locator('ol li')
    .first()
    .getByLabel(/alinhamento de/iu)
    .count()
    .then((n) => n > 0)
    .catch(() => false);
  return {
    nome: 'barra de formatacao da etiqueta (alinhamento, negrito, cor, fonte, tamanho)',
    presente,
    origem: 'PR #614',
  };
}

/**
 * Aviso de etiqueta ilegivel e bloqueio da impressao. Chega com o PR #614.
 *
 * Este detector casava '[data-fit-warning], [role=alert]'. Isso estava errado:
 * a develop nao tem data-fit-warning, mas PODE ter um [role=alert] qualquer --
 * erro de rede, validacao de formulario, mensagem de salvamento. Qualquer um
 * deles declarava a capacidade PRESENTE e disparava as assercoes integrais do
 * #614 contra a develop, produzindo exatamente o vermelho falso que este
 * modulo existe para evitar.
 *
 * Conferido em apps/web/components/credential-label.tsx na develop: os
 * atributos sao `data-qr` e `data-barcode`; `data-fit-warning` nao existe, e
 * nao ha bloqueio -- o componente encolhe o texto ate 45% e imprime. Entao
 * `data-fit-warning` e o marcador exato da capacidade, e so ele serve.
 *
 * Contraprova em fixture/aviso.cjs, rota /sem-capacidade-com-alerta.
 */
export async function temAvisoDeAjuste(page: Page): Promise<Capacidade> {
  const presente = await page
    .locator('[data-fit-warning]')
    .count()
    .then((n) => n > 0)
    .catch(() => false);
  return {
    nome: 'aviso de etiqueta ilegivel (data-fit-warning) e impressao bloqueada',
    presente,
    origem: 'PR #614',
  };
}

export function motivoDeSkip(capacidade: Capacidade): string {
  return `Capacidade ausente no ambiente: ${capacidade.nome}. `
    + `Depende de ${capacidade.origem}. SKIP declarado — nao e aprovacao nem reprovacao. `
    + 'Quando a capacidade chegar, este teste volta a valer integralmente.';
}

/**
 * Rota de compra multipla, criada pelo PR #471.
 *
 * Em develop a pasta apps/web/app/evento/[slug]/inscricao/ tem apenas `fila` e
 * `page.tsx`: /inscricao/grupo nao existe. Sem esta deteccao, os sete casos de
 * compra-multipla.spec.ts bateriam em 404 e reprovariam, culpando o produto
 * por uma tela que ainda nao foi integrada. G2.10 e um dos oito criterios NAO
 * integrados do GATES_STATUS.json.
 *
 * Checa pelo status HTTP, nao por elemento: um 404 do Next ainda renderiza
 * pagina, e procurar elemento daria o mesmo resultado por motivo errado.
 */
export async function temRotaDeCompraMultipla(page: Page, rota: string): Promise<Capacidade> {
  let presente = false;
  try {
    const resposta = await page.goto(rota, { waitUntil: 'commit' });
    presente = (resposta?.status() ?? 404) < 400;
  } catch { presente = false; }
  return {
    nome: 'rota publica de compra multipla (/inscricao/grupo)',
    presente,
    origem: 'PR #471',
  };
}
