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

/** Só o que estas regras precisam ler. Mínimo de propósito. */
export type DatasDoWizard = {
  startDate?: string | null;
  endDate?: string | null;
};

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
