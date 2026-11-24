/**
 * Invariantes do SALVAMENTO do Wizard, em módulo sem dependências.
 *
 * Separado de `wizard-policy.ts` por um motivo concreto: aquele arquivo importa
 * `./event-publication/public-discovery.policy` sem extensão, e o Node não
 * resolve import relativo extensionless ao executar TypeScript com
 * `--experimental-strip-types`. Isso tornava impossível exercitar estas regras
 * sem build — e regra de validação que só roda depois de compilar é regra que
 * ninguém roda enquanto escreve.
 *
 * Aqui não há import nenhum, nem de tipo: os tipos são estruturais e mínimos,
 * de propósito. Assim este arquivo roda direto no harness de testes.
 */

/**
 * Data vinda do corpo (ISO) ou do banco (`Date` do Prisma). As duas formas
 * aparecem porque a regra compara o que foi pedido com o que já está gravado.
 */
export type ValorDeData = Date | string | null | undefined;

/** Só o que estas regras precisam ler. Mínimo de propósito. */
export type DatasDoWizard = {
  startDate?: ValorDeData;
  endDate?: ValorDeData;
};

/** O corpo do PATCH, já normalizado. */
export type PedidoDeDatas = DatasDoWizard & { datesPending?: boolean };

/** O que está gravado no Event. */
export type AgendaGravada = DatasDoWizard;

/**
 * Como o evento FICA depois deste salvamento, e quais campos serão escritos.
 *
 * Os dois `grava*` existem para que a validação e a escrita usem a mesma
 * decisão. Sem eles, a escrita voltaria a decidir sozinha — foi exatamente
 * essa divergência que deixou passar o intervalo invertido.
 */
export type AgendaResultante = {
  startDate: ValorDeData;
  endDate: ValorDeData;
  gravaStartDate: boolean;
  gravaEndDate: boolean;
};

/**
 * Espelho exato das guardas de `persistEventData`.
 *
 * Lá a escrita é:
 *
 * ```ts
 * if (answers.startDate || answers.datesPending)
 *   data.startDate = answers.startDate ? new Date(answers.startDate) : null;
 * ```
 *
 * Ou seja: pedido com valor manda; sem valor, `datesPending` limpa; sem os
 * dois, o campo nem entra no update e o que está gravado permanece. Essa
 * terceira linha é a que faltava na validação — ela lia só o corpo, então
 * "mandei apenas o término" passava com o início antigo intacto.
 *
 * Preserva o valor original quando o campo não é tocado (devolve o `Date` do
 * Prisma, não um ISO reconstruído) para que a escrita continue não mexendo em
 * precisão que ninguém pediu para mexer.
 */
export function agendaResultante(
  pedido: PedidoDeDatas,
  gravado: AgendaGravada | null | undefined,
): AgendaResultante {
  const datasPendentes = pedido.datesPending === true;
  // null explícito limpa a data; undefined significa que o PATCH omitiu o campo.
  // Boolean() confundia esses dois pedidos e mantinha a data antiga.
  const gravaStartDate = pedido.startDate !== undefined || datasPendentes;
  const gravaEndDate = pedido.endDate !== undefined || datasPendentes;

  return {
    startDate: gravaStartDate ? (pedido.startDate ?? null) : (gravado?.startDate ?? null),
    endDate: gravaEndDate ? (pedido.endDate ?? null) : (gravado?.endDate ?? null),
    gravaStartDate,
    gravaEndDate,
  };
}

/**
 * Invariantes que valem em TODO salvamento, não só na conclusão.
 *
 * A ordem das datas estava só em `getWizardCompletionIssues`, chamada apenas
 * por `complete()`. O `save()` ia direto gravar, então um PATCH com término
 * anterior ao início persistia o intervalo invertido e respondia 200.
 *
 * Comparar com `<` e não `<=` é deliberado: evento que começa e termina no
 * mesmo instante é legítimo. Há teste de fronteira para isso.
 *
 * Rascunho com uma data só continua podendo ser salvo: a regra exige as duas
 * para comparar, e obrigatoriedade é assunto de `complete()`, não de salvar.
 */
export function getWizardSaveIssues(answers: DatasDoWizard): string[] {
  const issues: string[] = [];
  if (
    answers.startDate
    && answers.endDate
    && new Date(answers.endDate) < new Date(answers.startDate)
  ) {
    issues.push('A data de término não pode ser anterior à data de início.');
  }
  return issues;
}

/**
 * A mesma regra, aplicada ao RESULTADO e só quando o salvamento mexe em data.
 *
 * Por que não cobrar sempre: evento gravado antes desta correção pode ter
 * intervalo invertido no banco. Validar o resultado em todo salvamento
 * deixaria esse organizador sem conseguir nem corrigir o nome do evento —
 * trocaria um defeito de dado por uma tela travada, e "preservar dados durante
 * erros" não é isso.
 *
 * Quem MEXE numa data responde pelo resultado inteiro, nos dois sentidos:
 * mandar só o término anterior ao início gravado é recusado, e mandar só o
 * início posterior ao término gravado também. Quem não mexe em data nenhuma
 * não piora o intervalo, porque nenhum dos dois campos entra no update.
 *
 * `complete()` NÃO usa esta versão: concluir é o portão da publicação, e lá um
 * intervalo invertido já gravado tem de barrar mesmo que o corpo não toque nas
 * datas. A assimetria é deliberada.
 */
export function getAgendaSaveIssues(agenda: AgendaResultante): string[] {
  if (!agenda.gravaStartDate && !agenda.gravaEndDate) return [];
  return getWizardSaveIssues(agenda);
}

/**
 * Ausência no corpo NÃO é pedido de apagamento.
 *
 * `normalizeWizardAnswers` devolve `[]` tanto para "o cliente mandou lista
 * vazia" quanto para "o cliente nem mandou o campo", e `persistEventData`
 * escrevia esse `[]` direto. Resultado: qualquer salvamento parcial zerava as
 * áreas de atuação do evento — inclusive as definidas pela rota dedicada
 * `PATCH /events/:eventId/subject-areas`.
 *
 * Zero áreas nunca foi estado válido no resto do sistema: `parseSubjectAreas`
 * recusa lista vazia e a conclusão do Wizard exige ao menos uma. Logo,
 * preservar o que está gravado é a leitura coerente de um corpo sem o campo.
 *
 * `current` aceita ausente. No banco o campo é `String[] @default([])`, então
 * um Event real SEMPRE traz array — mas quem chama nem sempre é um Event
 * completo, e estourar por isso trocaria um defeito de dado por um defeito de
 * disponibilidade. Ausente significa "nada gravado", que é o mesmo que vazio.
 *
 * Devolve CÓPIA de propósito: quem chama não pode acabar segurando a mesma
 * referência que veio do banco.
 */
export function subjectAreasToPersist(
  requested: readonly string[] | undefined | null,
  current: readonly string[] | undefined | null,
): string[] {
  if (requested && requested.length > 0) return [...requested];
  return current ? [...current] : [];
}
