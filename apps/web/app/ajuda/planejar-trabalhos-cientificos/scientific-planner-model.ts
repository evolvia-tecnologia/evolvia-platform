export type Answers = {
  responsible: "" | "confirmed" | "missing" | "later";
  workModel: "" | "abstract" | "full" | "undefined" | "later";
  presentation: "" | "oral" | "poster" | "eposter" | "multiple" | "later";
  areas: "" | "not-needed" | "optional" | "required-ready" | "required-missing" | "later";
  authors: "" | "defined" | "missing" | "later";
  presenter: "" | "defined" | "missing" | "later";
  evaluation: "" | "not-needed" | "criteria-ready" | "criteria-missing" | "later";
};

export const initialAnswers: Answers = {
  responsible: "",
  workModel: "",
  presentation: "",
  areas: "",
  authors: "",
  presenter: "",
  evaluation: "",
};

export const questions = [
  {
    key: "responsible",
    legend: "Existe uma função responsável pelas decisões científicas?",
    hint: "Indique apenas a situação da responsabilidade. Não informe nomes ou contatos.",
    options: [
      { value: "confirmed", label: "Sim, a responsabilidade está definida", description: "A pessoa ou comissão será identificada somente na configuração oficial." },
      { value: "missing", label: "Ainda não existe responsável", description: "É necessário definir a responsabilidade antes de transformar o plano em configuração." },
      { value: "later", label: "Decidir depois", description: "Registre esta decisão como pendente no plano." },
    ],
  },
  {
    key: "workModel",
    legend: "Qual modelo preliminar de trabalho será considerado?",
    hint: "Esta escolha organiza o planejamento e não abre submissões.",
    options: [
      { value: "abstract", label: "Resumo" },
      { value: "full", label: "Trabalho completo" },
      { value: "undefined", label: "Haverá trabalhos, mas o formato ainda não tem regra" },
      { value: "later", label: "Decidir depois" },
    ],
  },
  {
    key: "presentation",
    legend: "Quais formas conceituais de apresentação devem entrar no plano?",
    hint: "As modalidades continuam configuráveis no evento.",
    options: [
      { value: "oral", label: "Oral" },
      { value: "poster", label: "Pôster" },
      { value: "eposter", label: "ePoster" },
      { value: "multiple", label: "Mais de uma forma" },
      { value: "later", label: "Decidir depois" },
    ],
  },
  {
    key: "areas",
    legend: "Como áreas e subáreas devem ser consideradas neste planejamento?",
    hint: "Elas podem ser opcionais conforme o evento e a modalidade.",
    options: [
      { value: "not-needed", label: "Não serão necessárias neste plano" },
      { value: "optional", label: "Poderão ser opcionais" },
      { value: "required-ready", label: "Poderão ser obrigatórias e a estrutura será definida antes" },
      { value: "required-missing", label: "Pretendemos exigir, mas ainda não há estrutura" },
      { value: "later", label: "Decidir depois" },
    ],
  },
  {
    key: "authors",
    legend: "A política preliminar de autores já prevê limites?",
    hint: "Não informe nomes nem quantidades. Os limites reais serão definidos na configuração oficial.",
    options: [
      { value: "defined", label: "Sim, a política preverá limites" },
      { value: "missing", label: "Haverá autores, mas os limites ainda não foram discutidos" },
      { value: "later", label: "Decidir depois" },
    ],
  },
  {
    key: "presenter",
    legend: "A regra de apresentador está encaminhada?",
    hint: "A ferramenta não cadastra apresentadores; registra somente a prontidão da decisão.",
    options: [
      { value: "defined", label: "Sim, a regra será definida antes da abertura" },
      { value: "missing", label: "O apresentador ainda está indefinido" },
      { value: "later", label: "Decidir depois" },
    ],
  },
  {
    key: "evaluation",
    legend: "Como avaliação, correção e reavaliação entram no plano?",
    hint: "Nenhum fluxo ou parecer é criado nesta etapa.",
    options: [
      { value: "not-needed", label: "Não serão necessárias neste plano" },
      { value: "criteria-ready", label: "Serão consideradas com critérios definidos antes da abertura" },
      { value: "criteria-missing", label: "Serão necessárias, mas ainda não há critérios" },
      { value: "later", label: "Decidir depois" },
    ],
  },
] as const;

export function deriveProgress(answers: Answers) {
  const completed = questions.filter((question) =>
    isAnswerValue(question.key, answers[question.key]),
  ).length;
  return { completed, total: questions.length };
}

export function formatProgressLabel(completed: number, total: number) {
  const decisionLabel = completed === 1 ? "decisão respondida" : "decisões respondidas";
  return `Progresso: ${completed} de ${total} ${decisionLabel}.`;
}

export function deriveScientificGuidance(answers: Answers) {
  if (answers.workModel === "") {
    return "Escolha o modelo preliminar para orientar as próximas decisões científicas.";
  }
  if (answers.workModel === "undefined") {
    return "Defina a regra do formato antes de transformar este plano em configuração.";
  }
  if (answers.workModel === "later") {
    return "O modelo do trabalho continuará pendente até uma decisão humana.";
  }
  if (answers.presentation === "") {
    return "Agora escolha como os trabalhos poderão ser apresentados.";
  }
  if (answers.presentation === "later") {
    return "A forma de apresentação continuará pendente até uma decisão humana.";
  }
  return "Modelo e apresentação estão combinados; revise áreas, autores, apresentador e avaliação.";
}

const stopReasons: Partial<Record<keyof Answers, Record<string, string>>> = {
  responsible: { missing: "Defina quem responderá pelas decisões científicas." },
  workModel: { undefined: "Defina a regra do formato do trabalho antes de configurar." },
  areas: { "required-missing": "Estruture áreas e subáreas antes de torná-las obrigatórias." },
  authors: { missing: "Discuta os limites de autores antes de abrir o fluxo." },
  presenter: { missing: "Defina a regra de apresentador antes da abertura." },
  evaluation: { "criteria-missing": "Defina critérios antes de habilitar avaliação, correção ou reavaliação." },
};

const labels = new Map<string, string>(
  questions.flatMap((question) => question.options.map((option) => [`${question.key}:${option.value}`, option.label] as const)),
);

export function isAnswerValue<Key extends keyof Answers>(
  key: Key,
  value: string,
): value is Answers[Key] {
  const question = questions.find((candidate) => candidate.key === key);
  return Boolean(
    question &&
      (question.options as readonly { value: string }[]).some((option) => option.value === value),
  );
}

export function applyAnswer<Key extends keyof Answers>(
  answers: Answers,
  key: Key,
  value: string,
): Answers {
  if (!isAnswerValue(key, value)) {
    return answers;
  }
  return { ...answers, [key]: value };
}

export function formatSelectionAnnouncement(key: keyof Answers, value: string) {
  if (!isAnswerValue(key, value)) {
    return "";
  }

  const question = questions.find((candidate) => candidate.key === key);
  const optionLabel = labels.get(`${key}:${value}`);
  if (!question || !optionLabel) {
    return "";
  }

  return `Opção "${optionLabel}" selecionada para "${question.legend}".`;
}

function invalidAnswers(answers: Answers) {
  return questions.filter(
    (question) =>
      answers[question.key] !== "" &&
      !isAnswerValue(question.key, answers[question.key]),
  );
}

export function deriveSummary(answers: Answers): {
  state: "ready" | "later" | "stop";
  title: string;
  lead: string;
  actions: string[];
} {
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

  const blockers = questions.flatMap((question) => {
    const reason = stopReasons[question.key]?.[answers[question.key]];
    return reason ? [reason] : [];
  });
  if (blockers.length > 0) {
    return {
      state: "stop",
      title: "Pare e confirme antes de configurar",
      lead: "O plano encontrou decisões que precisam de validação humana.",
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
    actions: questions.map((question) => `${question.legend} ${labels.get(`${question.key}:${answers[question.key]}`) ?? "Definido"}.`),
  };
}
