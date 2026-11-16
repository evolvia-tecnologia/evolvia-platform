import { BadRequestException } from '@nestjs/common';

/**
 * Converte a lista de problemas dos módulos puros no contrato de erro da
 * plataforma (#665).
 *
 * **Existe por causa de um defeito real, e a forma dele importa.** Os módulos
 * puros acumulam TODOS os problemas do pedido e devolvem `string[]`, para a
 * pessoa corrigir tudo de uma vez em vez de descobrir um erro por tentativa.
 * O serviço lançava `new BadRequestException({ erros })` — e o
 * `GlobalExceptionFilter` não entende essa chave: ele procura `fields` (array)
 * ou `message` (array), não encontra nenhum, e responde
 *
 *     { error: { code: 'VALIDATION_ERROR', message: 'Não foi possível
 *       concluir a operação.', fields: [], ... } }
 *
 * Ou seja: a lista inteira era descartada exatamente onde ela servia, e a
 * pessoa recebia uma frase genérica. Pior ainda num painel de filtros, onde
 * "não foi possível" é indistinguível de "o recorte não tem nada".
 *
 * Aqui o pedido inválido passa a sair no MESMO contrato que o resto da API,
 * o de `validationExceptionFactory`: `code`, `message` e `fields`.
 *
 * `field` fica vazio, e isso é decisão, não esquecimento. Os módulos puros
 * devolvem a frase pronta, não o nome do campo. Extrair o nome da frase por
 * expressão regular daria um `field` que o formulário tentaria destacar — e
 * erraria o alvo silenciosamente no dia em que alguém reescrevesse a
 * mensagem. Campo vazio com a mensagem certa é honesto; campo adivinhado é
 * uma afirmação que eu não posso sustentar. O caminho correto é os módulos
 * puros devolverem `{ campo, mensagem }`, e isso é mudança nos quatro
 * validadores e nos quatro testes — separada desta, que é a que destrava a
 * CI.
 *
 * Com um problema só, ele vira a `message`: quem errou uma coisa lê a coisa,
 * sem precisar abrir a lista.
 */
export function recusaDeValidacao(erros: readonly string[]): BadRequestException {
  const problemas = erros.length > 0 ? erros : ['Pedido inválido.'];
  const primeiro = problemas[0] ?? 'Pedido inválido.';
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: problemas.length === 1 ? primeiro : 'Revise os campos informados.',
    fields: problemas.map((message) => ({ field: '', message })),
  });
}
