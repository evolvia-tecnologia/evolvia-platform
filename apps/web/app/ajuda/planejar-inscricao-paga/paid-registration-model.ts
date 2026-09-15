export type Answers = {
  responsible: string;
  scenario: string;
  categories: string;
  benefits: string;
  proof: string;
  split: string;
  refund: string;
  capacity: string;
};

export type PlannerSummary = {
  state: "ready" | "later" | "stop";
  title: string;
  lead: string;
  actions: string[];
};

export const initialAnswers: Answers = {
  responsible: "",
  scenario: "",
  categories: "",
  benefits: "",
  proof: "",
  split: "",
  refund: "",
  capacity: "",
};

export const questions = [
  {
    key: "responsible",
    legend: "Existe uma função responsável pelas decisões financeiras?",
    hint: "Indique somente a situação da responsabilidade. Não informe nomes ou contatos.",
    options: [
      { value: "confirmed", label: "Sim, a responsabilidade está definida" },
      { value: "missing", label: "Ainda não existe responsável" },
      { value: "later", label: "Decidir depois" },
    ],
  },
  {
    key: "scenario",
    legend: "Qual cenário preliminar deve entrar no plano?",
    hint: "A escolha não cria preço, cobrança nem disponibilidade.",
    options: [
      { value: "free", label: "Evento gratuito" },
      { value: "paid-registration", label: "Inscrição paga" },
      { value: "paid-activities", label: "Atividades pagas" },
      { value: "later", label: "Decidir depois" },
    ],
  },
  {
    key: "categories",
    legend: "Como categorias, preços e lotes serão planejados?",
    hint: "Não informe valores. Registre somente se haverá política antes da configuração.",
    options: [
      { value: "not-needed", label: "Não serão necessários neste plano" },
      { value: "policy-ready", label: "Serão considerados com política definida antes" },
      { value: "policy-missing", label: "Serão necessários, mas ainda não há política" },
      { value: "later", label: "Decidir depois" },
    ],
  },
  {
    key: "benefits",
    legend: "Cupom, convite ou cortesia devem ser considerados?",
    hint: "Nenhum código é criado por esta ferramenta.",
    options: [
      { value: "not-needed", label: "Não serão necessários neste plano" },
      { value: "consider", label: "Sim, deverão ser considerados futuramente" },
      { value: "later", label: "Decidir depois" },
    ],
  },
  {
    key: "proof",
    legend: "Haverá comprovante por categoria antes do pagamento?",
    hint: "O planejador não recebe arquivo nem aprova comprovante.",
    options: [
      { value: "not-needed", label: "Não será necessário neste plano" },
      { value: "criteria-ready", label: "Sim, com critérios definidos antes da abertura" },
      { value: "criteria-missing", label: "Sim, mas ainda não há critérios de aprovação" },
      { value: "later", label: "Decidir depois" },
    ],
  },
  {
    key: "split",
    legend: "Repasse ou split deve ser considerado?",
    hint: "Nenhum destinatário, conta ou contrato é cadastrado aqui.",
    options: [
      { value: "not-needed", label: "Não será necessário neste plano" },
      { value: "contract-ready", label: "Sim, com destinatários e contrato confirmados antes" },
      { value: "contract-missing", label: "Sim, mas faltam destinatários ou contrato" },
      { value: "later", label: "Decidir depois" },
    ],
  },
  {
    key: "refund",
    legend: "Reembolso precisa entrar no planejamento?",
    hint: "Esta etapa não executa estorno nem define política financeira.",
    options: [
      { value: "not-needed", label: "Não será necessário neste plano" },
      { value: "rule-ready", label: "Sim, com regra definida antes da abertura" },
      { value: "rule-missing", label: "Sim, mas ainda não existe regra" },
      { value: "later", label: "Decidir depois" },
    ],
  },
  {
    key: "capacity",
    legend: "Atividades pagas terão política de capacidade?",
    hint: "A ferramenta não reserva vagas; registra apenas a prontidão da decisão.",
    options: [
      { value: "not-needed", label: "Não há atividade paga neste plano" },
      { value: "policy-ready", label: "Sim, a política será definida antes da abertura" },
      { value: "policy-missing", label: "Haverá atividade paga, mas não há controle definido" },
      { value: "later", label: "Decidir depois" },
    ],
  },
] as const;

export function deriveProgress(answers: Answers) {
  const completed = questions.filter((question) => answers[question.key] !== "").length;
  return { completed, total: questions.length };
}

const stopReasons: Partial<Record<keyof Answers, Record<string, string>>> = {
  responsible: { missing: "Defina quem responderá pelas decisões financeiras." },
  categories: { "policy-missing": "Defina a política de preços e lotes antes de configurar." },
  proof: { "criteria-missing": "Defina os critérios de comprovante e aprovação antes do pagamento." },
  split: { "contract-missing": "Confirme destinatários e contrato antes de planejar repasse ou split." },
  refund: { "rule-missing": "Defina a regra de reembolso antes de abrir inscrições pagas." },
  capacity: { "policy-missing": "Defina o controle de capacidade antes de oferecer atividade paga." },
};

const labels = new Map<string, string>(
  questions.flatMap((question) =>
    question.options.map((option) => [`${question.key}:${option.value}`, option.label] as const),
  ),
);

function invalidAnswers(answers: Answers) {
  return questions.filter(
    (question) =>
      answers[question.key] !== "" &&
      !question.options.some((option) => option.value === answers[question.key]),
  );
}

function inconsistentDecisions(answers: Answers) {
  const reasons: string[] = [];

  if (answers.scenario === "free") {
    if (answers.proof !== "not-needed") {
      reasons.push("Em evento gratuito, confirme que não haverá comprovante condicionado a pagamento.");
    }
    if (answers.split !== "not-needed") {
      reasons.push("Em evento gratuito, retire o repasse ou split do plano financeiro.");
    }
    if (answers.refund !== "not-needed") {
      reasons.push("Em evento gratuito, retire o reembolso do plano financeiro.");
    }
  }

  if (answers.scenario === "paid-registration" && answers.categories === "not-needed") {
    reasons.push("Para inscrição paga, defina a política de categorias, preços e lotes antes de configurar.");
  }

  if (answers.scenario === "paid-activities" && answers.capacity === "not-needed") {
    reasons.push("Para atividades pagas, defina uma política de capacidade antes de configurar.");
  }

  return reasons;
}

export function deriveSummary(answers: Answers): PlannerSummary {
  const firstMissing = questions.find((question) => !answers[question.key]);
  if (firstMissing) {
    const { completed, total } = deriveProgress(answers);
    const remaining = total - completed;
    const remainingLabel = remaining === 1 ? "Falta 1 decisão." : `Faltam ${remaining} decisões.`;
    return {
      state: "later",
      title: "Continue o planejamento",
      lead: `${remainingLabel} Próximo passo: ${firstMissing.legend}`,
      actions: ["Complete as escolhas para gerar um resumo determinístico."],
    };
  }

  const invalid = invalidAnswers(answers);
  if (invalid.length > 0) {
    return {
      state: "stop",
      title: "Pare e revise as escolhas",
      lead: "O plano contém uma resposta que não pertence às opções permitidas.",
      actions: invalid.map((question) => `Revise: ${question.legend}`),
    };
  }

  const inconsistencies = inconsistentDecisions(answers);
  if (inconsistencies.length > 0) {
    return {
      state: "stop",
      title: "Pare e alinhe o cenário",
      lead: "Algumas escolhas não são coerentes com o cenário financeiro selecionado.",
      actions: inconsistencies,
    };
  }

  const blockers = questions.flatMap((question) => {
    const reason = stopReasons[question.key]?.[answers[question.key]];
    return reason ? [reason] : [];
  });
  if (blockers.length > 0) {
    return {
      state: "stop",
      title: "Pare e confirme antes de configurar",
      lead: "O plano encontrou decisões financeiras que precisam de validação humana.",
      actions: blockers,
    };
  }

  const deferred = questions.filter((question) => answers[question.key] === "later");
  if (deferred.length > 0) {
    return {
      state: "later",
      title: "Decisões registradas para depois",
      lead: "O planejamento pode continuar, mas ainda não está pronto para virar configuração.",
      actions: deferred.map((question) => `Decidir: ${question.legend}`),
    };
  }

  return {
    state: "ready",
    title: "Definido para planejar",
    lead: "As decisões preliminares estão coerentes para orientar a configuração oficial.",
    actions: questions.map(
      (question) =>
        `${question.legend} ${labels.get(`${question.key}:${answers[question.key]}`) ?? "Definido"}.`,
    ),
  };
}
