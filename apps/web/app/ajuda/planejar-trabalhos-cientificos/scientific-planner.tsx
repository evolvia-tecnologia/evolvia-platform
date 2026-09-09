"use client";

import { useMemo, useState } from "react";

import { LocalPlannerChoiceGroup } from "../../../../components/local-planner-choice-group";
import {
  LocalPlannerShell,
  LocalPlannerSummary,
  type LocalPlannerState,
} from "../../../../components/local-planner-shell";
import styles from "./planejar-trabalhos-cientificos.module.css";

type Answers = {
  responsible: string;
  workModel: string;
  presentation: string;
  areas: string;
  authors: string;
  presenter: string;
  evaluation: string;
};

const initialAnswers: Answers = {
  responsible: "",
  workModel: "",
  presentation: "",
  areas: "",
  authors: "",
  presenter: "",
  evaluation: "",
};

const questions = [
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

const stopReasons: Partial<Record<keyof Answers, Record<string, string>>> = {
  responsible: { missing: "Defina quem responderá pelas decisões científicas." },
  workModel: { undefined: "Defina a regra do formato do trabalho antes de configurar." },
  areas: { "required-missing": "Estruture áreas e subáreas antes de torná-las obrigatórias." },
  authors: { missing: "Discuta os limites de autores antes de abrir o fluxo." },
  presenter: { missing: "Defina a regra de apresentador antes da abertura." },
  evaluation: { "criteria-missing": "Defina critérios antes de habilitar avaliação, correção ou reavaliação." },
};

const labels = new Map(
  questions.flatMap((question) => question.options.map((option) => [`${question.key}:${option.value}`, option.label])),
);

function deriveSummary(answers: Answers): {
  state: LocalPlannerState;
  title: string;
  lead: string;
  actions: string[];
} {
  const firstMissing = questions.find((question) => !answers[question.key]);
  if (firstMissing) {
    return {
      state: "later",
      title: "Continue o planejamento",
      lead: `Próximo passo: ${firstMissing.legend}`,
      actions: ["Complete as escolhas para gerar um resumo determinístico."],
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

export function ScientificPlanner() {
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [announcement, setAnnouncement] = useState("");
  const summary = useMemo(() => deriveSummary(answers), [answers]);

  function updateAnswer(key: keyof Answers, value: string) {
    setAnswers((current) => ({ ...current, [key]: value }));
    const question = questions.find((candidate) => candidate.key === key);
    const optionLabel = labels.get(`${key}:${value}`) ?? value;
    setAnnouncement(`Opção "${optionLabel}" selecionada para "${question?.legend ?? "pergunta atual"}".`);
  }

  function restart() {
    setAnswers(initialAnswers);
    setAnnouncement("Planejamento reiniciado. Todas as escolhas foram removidas.");
  }

  return (
    <LocalPlannerShell
      eyebrow="Planejamento científico local"
      title="Antecipe decisões sobre trabalhos científicos"
      description="Organize as perguntas que precisarão ser respondidas antes da configuração oficial do evento."
    >
      <div className={styles.layout}>
        <div className={styles.questions}>
          {questions.map((question) => (
            <LocalPlannerChoiceGroup
              key={question.key}
              legend={question.legend}
              hint={question.hint}
              name={`scientific-${question.key}`}
              options={question.options}
              value={answers[question.key]}
              onChange={(value) => updateAnswer(question.key, value)}
            />
          ))}
        </div>

        <aside className={styles.result} aria-label="Resumo do planejamento">
          <LocalPlannerSummary state={summary.state} title={summary.title}>
            <p>{summary.lead}</p>
            <ul>
              {summary.actions.map((action) => <li key={action}>{action}</li>)}
            </ul>
          </LocalPlannerSummary>

          <div className={styles.boundary} role="note">
            <h2>Limites desta ferramenta</h2>
            <p>
              Este planejamento não recebe trabalhos, não cadastra autores, não avalia,
              não publica resultados e não cria regras científicas no evento.
            </p>
          </div>

          <button className={styles.restart} type="button" onClick={restart}>
            Reiniciar planejamento
          </button>
          <p className={styles.srOnly} aria-live="polite" aria-atomic="true">
            {announcement}
          </p>
        </aside>
      </div>
    </LocalPlannerShell>
  );
}
