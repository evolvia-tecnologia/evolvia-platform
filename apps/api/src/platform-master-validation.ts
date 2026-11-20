import { BadRequestException } from '@nestjs/common';

/**
 * Converte a lista de problemas dos módulos puros no contrato de erro da
 * plataforma (#665).
 *
 * **Existe por causa de um defeito real, e a forma dele importa.** Os módulos
 * puros acumulam TODOS os problemas do pedido, para a pessoa corrigir tudo de
 * uma vez em vez de descobrir um erro por tentativa. O serviço lançava
 * `new BadRequestException({ erros })` — e o `GlobalExceptionFilter` não
 * entende essa chave: ele procura `fields` (array) ou `message` (array), não
 * encontra nenhum, e responde
 *
 *     { error: { code: 'VALIDATION_ERROR', message: 'Não foi possível
 *       concluir a operação.', fields: [], ... } }
 *
 * Ou seja: a lista inteira era descartada exatamente onde ela servia, e a
 * pessoa recebia uma frase genérica. Pior ainda num painel de filtros, onde
 * "não foi possível" é indistinguível de "o recorte não tem nada".
 *
 * Aqui o pedido inválido sai no MESMO contrato que o resto da API, o de
 * `validationExceptionFactory`: `code`, `message` e `fields`.
 *
 * ## Por que aceita duas formas
 *
 * Um problema pode chegar como texto ou como `{ campo, mensagem }`. Isto é
 * deliberado e transitório: permite migrar um validador por vez sem que os
 * outros parem de funcionar nem passem a mentir. Texto puro continua saindo
 * com `field` vazio — honesto, porque ninguém disse qual é o campo. Nunca se
 * extrai o campo da frase por expressão regular: isso daria um `field` que o
 * formulário tentaria destacar e erraria o alvo em silêncio no dia em que
 * alguém reescrevesse a mensagem.
 *
 * Com um problema só, ele vira a `message`: quem errou uma coisa lê a coisa,
 * sem precisar abrir a lista.
 */

/** Problema com o campo que o formulário deve destacar. */
export type ProblemaDeValidacao = {
  readonly campo: string;
  readonly mensagem: string;
};

type Problema = string | ProblemaDeValidacao;

const normalizar = (problema: Problema): ProblemaDeValidacao =>
  typeof problema === 'string' ? { campo: '', mensagem: problema } : problema;

export function recusaDeValidacao(problemas: readonly Problema[]): BadRequestException {
  const lista = problemas.length > 0
    ? problemas.map(normalizar)
    : [{ campo: '', mensagem: 'Pedido inválido.' }];
  const primeiro = lista[0] ?? { campo: '', mensagem: 'Pedido inválido.' };
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: lista.length === 1 ? primeiro.mensagem : 'Revise os campos informados.',
    fields: lista.map(({ campo, mensagem }) => ({ field: campo, message: mensagem })),
  });
}
