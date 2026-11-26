/**
 * "Este módulo foi executado diretamente?" — uma implementação só.
 *
 * Existiam duas, divergentes, no mesmo conjunto de scripts.
 * `provisionar-proprietario-master.mjs` documentava por que a comparação
 * ingênua erra e usava `fileURLToPath` + `resolve`;
 * `recuperar-acesso-master.mjs` usava exatamente a ingênua:
 *
 *     import.meta.url.endsWith(process.argv[1].split('/').pop())
 *
 * Ela falha nos dois sentidos. No Windows, `split('/')` não separa `\`, então o
 * "nome do arquivo" sai como o caminho inteiro, `endsWith` dá falso e o CLI
 * termina com código 0 sem imprimir SQL e sem imprimir erro. O operador lê
 * silêncio como sucesso, que é o pior modo de falhar num script que autoriza
 * acesso à Área Master. E é frouxa no outro sentido: comparar só o nome do
 * arquivo casa qualquer módulo homônimo em outra pasta.
 *
 * `fileURLToPath` converte na direção certa (letra de unidade e separador do
 * Windows inclusive) e `resolve` cobre a invocação por caminho relativo, em que
 * `argv[1]` não vem absoluto.
 */

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function chamadoDiretamente(urlDoModulo, caminhoDoArgv) {
  if (typeof urlDoModulo !== 'string' || urlDoModulo.length === 0) return false;
  if (typeof caminhoDoArgv !== 'string' || caminhoDoArgv === '') return false;
  try {
    return fileURLToPath(urlDoModulo) === resolve(caminhoDoArgv);
  } catch {
    // URL que não é `file:` não identifica caminho nenhum. Não foi executado.
    return false;
  }
}
