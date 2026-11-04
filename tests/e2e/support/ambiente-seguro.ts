/**
 * Decide se uma URL pode receber a suite. Recusa por padrao.
 *
 * Por que isto existe, e por que o guarda anterior era perigoso
 * -------------------------------------------------------------
 * A versao anterior fazia duas expressoes regulares sobre a STRING da URL:
 *
 *     const producao  = /(^|\/\/)(www\.)?evolviatecnologia\.com/u;
 *     const permitido = /homolog|staging|dev|localhost|127\.0\.0\.1/u;
 *     if (producao.test(base) && !permitido.test(base)) recusa();
 *
 * Isso reprova producao so quando o host comeca imediatamente depois de `//`,
 * com `www.` opcional. Qualquer OUTRO subdominio escapa:
 *
 *     https://app.evolviatecnologia.com/   -> nao casa producao -> ACEITO
 *
 * E a suite autenticada cria categoria, lote e beneficio, e salva. Apontada
 * para um subdominio de producao, ela ESCREVERIA EM DADOS REAIS de clientes.
 * Um vermelho falso custa tempo; isto custa dado de terceiro.
 *
 * Tambem era vulneravel a substring: `permitido` casava com qualquer URL que
 * contivesse "dev" em qualquer posicao -- inclusive
 * `https://evolviatecnologia.com/evento/dev-conf`, que e producao.
 *
 * Como passou a funcionar
 * -----------------------
 * 1. A URL e PARSEADA (new URL), e a decisao olha `hostname`, nunca a string.
 *    Isso elimina de uma vez o truque de substring e o de caminho.
 * 2. Recusa por padrao, como manda o AGENTS.md. So entra host que esta numa
 *    lista curta de prefixos de homologacao, ou local, ou nomeado
 *    explicitamente pelo operador em EVOLVIA_E2E_PERMITIR_HOST.
 * 3. O opt-in exige igualdade exata de hostname. Nao e substring, nao e
 *    sufixo: quem autoriza precisa digitar o host inteiro.
 *
 * A URL canonica de homologacao esta registrada na issue #332:
 *     https://homologacao.evolviatecnologia.com
 * O alias legado dev.evolviatecnologia.com tem certificado invalido
 * (NET::ERR_CERT_COMMON_NAME_INVALID) e deveria redirecionar 308 para a
 * canonica; enquanto nao redirecionar, nao serve para rodar a suite.
 */

/** Prefixos de subdominio que caracterizam ambiente de teste. */
const PREFIXOS_DE_HOMOLOGACAO = ['homologacao', 'homolog', 'hml', 'staging', 'stg', 'dev', 'qa', 'teste'];

/**
 * Dominios da Evolvia. O prefixo de homologacao so vale DENTRO deles.
 *
 * Sem esta checagem, `https://homolog.evolviatecnologia.com.invasor.net/`
 * seria aceito: primeiro rotulo `homolog`, dominio de terceiro. E a suite faz
 * login -- ela entregaria usuario e senha de homologacao ao dono daquele host.
 */
const DOMINIOS_DA_EVOLVIA = ['evolviatecnologia.com', 'evolvia.com.br'];

/** Hosts locais aceitos em qualquer porta. */
const LOCAIS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '[::1]']);

export type Veredito =
  | { seguro: true; host: string; razao: 'local' | 'inventario' | 'prefixo-de-homologacao' | 'permitido-explicitamente' }
  | { seguro: false; motivo: string };

export function avaliarAmbiente(
  base: string,
  permitirHost = process.env.EVOLVIA_E2E_PERMITIR_HOST ?? '',
): Veredito {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return { seguro: false, motivo: `EVOLVIA_E2E_BASE_URL nao e uma URL valida: ${JSON.stringify(base)}` };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { seguro: false, motivo: `Protocolo nao suportado: ${url.protocol}` };
  }

  const host = url.hostname.toLowerCase();

  if (LOCAIS.has(host) || host.endsWith('.localhost')) {
    return { seguro: true, host, razao: 'local' };
  }

  /**
   * TLD .invalid: a RFC 2606 reserva esse rotulo justamente para garantir que
   * ele NUNCA resolva. E o que o modo inventario usa para rodar
   * `playwright test --list` sem ambiente -- nenhuma requisicao pode sair.
   *
   * Preferi isso a isentar o modo inventario do guarda: isento, alguem que
   * rodasse a suite de verdade com EVOLVIA_E2E_MODO=inventario e uma URL de
   * producao passaria direto. Aqui o guarda vale sempre.
   */
  if (host === 'invalid' || host.endsWith('.invalid')) {
    return { seguro: true, host, razao: 'inventario' };
  }

  // Igualdade exata, nunca substring nem sufixo.
  const autorizado = permitirHost.trim().toLowerCase();
  if (autorizado && autorizado === host) {
    return { seguro: true, host, razao: 'permitido-explicitamente' };
  }

  const rotulos = host.split('.');
  const primeiroRotulo = rotulos[0] ?? '';
  const dominio = rotulos.slice(1).join('.');
  if (PREFIXOS_DE_HOMOLOGACAO.includes(primeiroRotulo) && DOMINIOS_DA_EVOLVIA.includes(dominio)) {
    return { seguro: true, host, razao: 'prefixo-de-homologacao' };
  }

  return {
    seguro: false,
    motivo:
      `Host recusado: ${host}.\n\n`
      + 'Esta suite recusa por padrao. Ela faz login, cria categoria, lote e '
      + 'beneficio e SALVA: apontada para producao, escreveria em dados reais.\n\n'
      + 'Aceita automaticamente: localhost/127.0.0.1, ou host cujo primeiro '
      + `rotulo seja um de [${PREFIXOS_DE_HOMOLOGACAO.join(', ')}] E cujo `
      + `dominio seja um de [${DOMINIOS_DA_EVOLVIA.join(', ')}] `
      + '(ex.: homologacao.evolviatecnologia.com, registrada na issue #332). '
      + 'As duas condicoes juntas: `homolog.` em dominio de terceiro e recusado, '
      + 'porque a suite faz login e vazaria credencial.\n\n'
      + 'Para autorizar outro host, defina EVOLVIA_E2E_PERMITIR_HOST com o '
      + 'hostname EXATO. Nao use isso para apontar para producao.',
  };
}

/** Lanca quando o ambiente nao e seguro. Usada pela playwright.config.ts. */
export function exigirAmbienteSeguro(base: string): string {
  const veredito = avaliarAmbiente(base);
  if (!veredito.seguro) throw new Error(veredito.motivo);
  return base;
}
