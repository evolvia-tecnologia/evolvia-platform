import type { Locator, Page } from '@playwright/test';

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
 * Regra 2, aprendida em 03/11/2026: o detector tem de ser ESTREITO. Um detector
 * largo declara a capacidade presente quando ela nao esta, e ai as assercoes
 * integrais disparam contra a develop -- o vermelho falso que ele deveria
 * evitar. Ver temAvisoDeAjuste.
 *
 * Regra 3, da revisao independente na #571 (microcorte do #629): o detector tem
 * de ESPERAR de forma deterministica. Ver o comentario de `presente` abaixo.
 *
 * Regra 4, da auditoria do Work em 16/11/2026: o detector nao pode ter EFEITO
 * COLATERAL. Ver temRotaDeCompraMultipla.
 */

export type Capacidade = {
  nome: string;
  presente: boolean;
  origem: string;
};

/**
 * Teto da espera por um controle, em milissegundos.
 *
 * Ajustavel por EVOLVIA_E2E_ESPERA_CAPACIDADE para ambientes mais lentos. O
 * padrao de 2s e generoso para um controle que deveria vir na hidratacao, e
 * barato o suficiente para pagar em cada detector.
 */
const TETO = Number(process.env.EVOLVIA_E2E_ESPERA_CAPACIDADE || 2_000);

/**
 * Decide se um controle esta presente, esperando de forma deterministica.
 *
 * Por que nao `locator.count()`
 * -----------------------------
 * `count()` NAO espera: ele mede o DOM no instante da chamada. Chamado logo
 * apos navegar, devolve 0 para um controle que ainda vai renderizar na
 * hidratacao -- e ai a capacidade e declarada AUSENTE e o teste vira SKIP
 * falso. A capacidade existia; so nao tinha aparecido ainda.
 *
 * Isso foi medido, nao deduzido. Em fixture/hidratacao.cjs, com o controle
 * inserido 700ms apos o load:
 *
 *   rota        count() imediato   esta funcao   correto
 *   /imediato   true               true          true
 *   /ausente    false              false         false
 *   /tardio     FALSE  <-- erra    true          true
 *
 * `waitFor({ state: 'attached' })` com teto resolve nas duas direcoes:
 * presente => true dentro do teto; ausente => false depois dele. O preco e que
 * capacidade ausente custa o teto -- troca consciente, porque um gate
 * obrigatorio pulado por engano custa muito mais: o relator e o guarda em
 * tools/verificar-resultado.mjs tratam esse SKIP como falha da execucao.
 *
 * `.first()` evita strict mode violation quando o seletor casa varios: aqui a
 * pergunta e "existe pelo menos um?", nao "existe exatamente um?".
 */
async function presente(alvo: Locator, teto = TETO): Promise<boolean> {
  try {
    await alvo.first().waitFor({ state: 'attached', timeout: teto });
    return true;
  } catch {
    return false;
  }
}

/** Barra de formatacao por campo da etiqueta. Chega com o PR #614. */
export async function temBarraDeFormatacao(page: Page): Promise<Capacidade> {
  return {
    nome: 'barra de formatacao da etiqueta (alinhamento, negrito, cor, fonte, tamanho)',
    presente: await presente(page.locator('ol li').first().getByLabel(/alinhamento de/iu)),
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
  return {
    nome: 'aviso de etiqueta ilegivel (data-fit-warning) e impressao bloqueada',
    presente: await presente(page.locator('[data-fit-warning]')),
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
 * Checa pelo STATUS HTTP, nao por elemento: um 404 do Next ainda renderiza
 * pagina, entao procurar elemento daria o resultado certo pelo motivo errado.
 *
 * Por que `page.request.get` e nao `page.goto` -- regra 4
 * ------------------------------------------------------
 * A versao anterior usava `page.goto(rota, { waitUntil: 'commit' })`. Isso
 * respondia a pergunta certa e cobrava um preco escondido: **navegava a pagina
 * sob teste**. Este detector e chamado antes das jornadas, entao ele destruia o
 * estado que o teste seguinte usava -- sessao na tela errada, DOM anterior
 * perdido. Achado do Work na auditoria da #634.
 *
 * `page.request` compartilha cookies e storage do contexto, logo a sessao
 * autenticada continua valendo, mas nenhuma navegacao acontece.
 *
 * Medido em Chromium, servidor local, pagina inicial em /a:
 *
 *   rota      | metodo  | status | url antes -> depois | DOM anterior
 *   /existe   | goto    | 200    | /a -> /existe       | perdido
 *   /existe   | request | 200    | /a -> /a            | preservado
 *   /ausente  | goto    | 404    | /a -> /ausente      | perdido
 *   /ausente  | request | 404    | /a -> /a            | preservado
 *
 * Status identico nos dois metodos, nas duas direcoes: a troca nao perde o
 * sinal, so deixa de causar o efeito colateral. Redirecionamento continua
 * sendo seguido, como no `goto`, para que o status final decida.
 */
export async function temRotaDeCompraMultipla(page: Page, rota: string): Promise<Capacidade> {
  let existe = false;
  try {
    const resposta = await page.request.get(rota);
    existe = resposta.status() < 400;
  } catch { existe = false; }
  return {
    nome: 'rota publica de compra multipla (/inscricao/grupo)',
    presente: existe,
    origem: 'PR #471',
  };
}
