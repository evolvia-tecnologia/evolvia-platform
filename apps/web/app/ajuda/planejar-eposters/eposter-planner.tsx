"use client";

import { useMemo, useRef, useState } from "react";

import { LocalPlannerChoiceGroup } from "../../../components/local-planner-choice-group";
import {
  LocalPlannerShell,
  LocalPlannerSummary,
  type LocalPlannerState,
} from "../../../components/local-planner-shell";
import styles from "./planejar-eposters.module.css";

export type Answers = {
  responsible: "" | "confirmed" | "missing" | "later";
  format: "" | "printed" | "digital" | "both" | "unspecified" | "later";
  source: "" | "approved-work" | "curation" | "unapproved" | "later";
  search: "" | "core" | "extended" | "not-needed" | "later";
  identifier: "" | "not-needed" | "policy-ready" | "policy-missing" | "later";
  download: "" | "not-needed" | "authorized" | "authorization-missing" | "later";
  languages: "" | "single" | "multiple" | "later";
  accessibility: "" | "not-applicable" | "alternative-ready" | "alternative-missing" | "later";
  equipment: "" | "not-needed" | "validated" | "unvalidated" | "later";
};

export const initialAnswers: Answers = {
  responsible: "",
  format: "",
  source: "",
  search: "",
  identifier: "",
  download: "",
  languages: "",
  accessibility: "",
  equipment: "",
};

export const questions = [
  {
    key: "responsible",
    legend: "Existe uma função responsável pelas decisões de pôsteres?",
    hint: "Indique somente a situação da responsabilidade. Não informe nomes ou contatos.",
    options: [
      { value: "confirmed", label: "Sim, a responsabilidade está definida" },
      { value: "missing", label: "Ainda não existe responsável" },
      { value: "later", label: "Decidir depois" },
    ],
  },
  {
    key: "format",
    legend: "Qual formato preliminar deve entrar no plano?",
    hint: "A escolha não cria modelo nem publica conteúdo.",
    options: [
      { value: "printed", label: "Pôster impresso" },
      { value: "digital", label: "ePoster" },
      { value: "both", label: "Pôster impresso e ePoster" },
      { value: "unspecified", label: "Ainda não há formato especificado" },
      { value: "later", label: "Decidir depois" },
    ],
  },
  {
    key: "source",
    legend: "Qual será a origem futura do conteúdo?",
    hint: "Nenhum trabalho, arquivo ou dado é recebido nesta etapa.",
    options: [
      { value: "approved-work", label: "Trabalho aprovado" },
      { value: "curation", label: "Curadoria autorizada" },
      { value: "unapproved", label: "Conteúdo ainda sem aprovação" },
      { value: "later", label: "Decidir depois" },
    ],
  },
  {
    key: "search",
    legend: "Quais referências de busca deverão ser consideradas?",
    hint: "A ferramenta não recebe ID, título, autor, área ou instituição.",
    options: [
      { value: "core", label: "ID, título e autor" },
      { value: "extended", label: "ID, título, autor, área e instituição" },
      { value: "not-needed", label: "Busca não será necessária neste plano" },
      { value: "later", label: "Decidir depois" },
    ],
  },
  {
    key: "identifier",
    legend: "Código Pxx e QR individual deverão ser considerados?",
    hint: "Nenhum código ou QR é gerado aqui.",
    options: [
      { value: "not-needed", label: "Não serão necessários neste plano" },
      { value: "policy-ready", label: "Sim, com política definida antes" },
      { value: "policy-missing", label: "Sim, mas ainda não há política" },
      { value: "later", label: "Decidir depois" },
    ],
  },
  {
    key: "download",
    legend: "O download futuro deverá ser considerado?",
    hint: "Nenhum arquivo é disponibilizado por este planejador.",
    options: [
      { value: "not-needed", label: "Não será necessário neste plano" },
      { value: "authorized", label: "Sim, com autorização definida antes" },
      { value: "authorization-missing", label: "Sim, mas ainda falta autorização" },
      { value: "later", label: "Decidir depois" },
    ],
  },
  {
    key: "languages",
    legend: "A experiência deverá prever mais de um idioma?",
    hint: "A escolha não traduz nem altera conteúdo.",
    options: [
      { value: "single", label: "Um idioma" },
      { value: "multiple", label: "Mais de um idioma" },
      { value: "later", label: "Decidir depois" },
    ],
  },
  {
    key: "accessibility",
    legend: "Mídias futuras terão alternativa acessível?",
    hint: "Registre a prontidão da decisão, sem enviar mídia.",
    options: [
      { value: "not-applicable", label: "Não haverá mídia neste plano" },
      { value: "alternative-ready", label: "Sim, a alternativa será definida antes" },
      { value: "alternative-missing", label: "Haverá mídia, mas falta alternativa acessível" },
      { value: "later", label: "Decidir depois" },
    ],
  },
  {
    key: "equipment",
    legend: "A exibição dependerá de equipamento no local?",
    hint: "Nenhum dispositivo é configurado ou validado aqui.",
    options: [
      { value: "not-needed", label: "Não dependerá de equipamento" },
      { value: "validated", label: "Sim, com validação prevista antes do evento" },
      { value: "unvalidated", label: "Sim, mas ainda sem validação prevista" },
      { value: "later", label: "Decidir depois" },
    ],
  },
] as const;

export function deriveProgress(answers: Answers) {
  const completed = questions.filter((question) => answers[question.key] !== "").length;
  return { completed, total: questions.length };
}

export function formatProgressLabel(completed: number, total: number) {
  const decisionLabel = completed === 1 ? "decisão respondida" : "decisões respondidas";
  return `Progresso: ${completed} de ${total} ${decisionLabel}.`;
}

export function deriveEposterGuidance(answers: Answers) {
  if (answers.format === "") {
    return "Escolha o formato preliminar para orientar as decisões de exibição.";
  }
  if (answers.format === "unspecified") {
    return "Especifique o formato antes de preparar a exibição.";
  }
  if (answers.format === "later") {
    return "O formato continuará pendente até uma decisão humana.";
  }
  if (answers.source === "") {
    return "Agora confirme qual será a origem autorizada do conteúdo.";
  }
  if (answers.source === "unapproved") {
    return "Confirme a aprovação ou curadoria antes de planejar a publicação.";
  }
  if (answers.source === "later") {
    return "A origem do conteúdo continuará pendente até uma decisão humana.";
  }
  return "Formato e origem estão combinados; revise busca, identificação, download e acessibilidade.";
}

const stopReasons: Partial<Record<keyof Answers, Record<string, string>>> = {
  responsible: { missing: "Defina quem responderá pelas decisões de pôsteres." },
  format: { unspecified: "Especifique o formato antes de preparar a exibição." },
  source: { unapproved: "Confirme a aprovação ou curadoria do conteúdo antes de planejar a publicação." },
  identifier: { "policy-missing": "Defina a política de código Pxx e QR antes de gerar identificadores." },
  download: { "authorization-missing": "Confirme a autorização antes de disponibilizar download." },
  accessibility: { "alternative-missing": "Defina uma alternativa acessível antes de usar mídia." },
  equipment: { unvalidated: "Valide o equipamento de exibição antes do evento." },
};

const labels = new Map<string, string>(
  questions.flatMap((question) =>
    question.options.map((option) => [`${question.key}:${option.value}`, option.label] as const),
  ),
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

function invalidAnswers(answers: Answers) {
  return questions.filter(
    (question) =>
      answers[question.key] !== "" &&
      !isAnswerValue(question.key, answers[question.key]),
  );
}

export function deriveSummary(answers: Answers): {
  state: LocalPlannerState;
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
      title: "Pare e confirme antes de preparar a exibição",
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
    actions: questions.map(
      (question) =>
        `${question.legend} ${labels.get(`${question.key}:${answers[question.key]}`) ?? "Definido"}.`,
    ),
  };
}

export function EposterPlanner() {
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const questionsRef = useRef<HTMLDivElement>(null);
  const summary = useMemo(() => deriveSummary(answers), [answers]);
  const progress = useMemo(() => deriveProgress(answers), [answers]);
  const progressLabel = formatProgressLabel(progress.completed, progress.total);
  const guidance = useMemo(() => deriveEposterGuidance(answers), [answers]);

  function updateAnswer(key: keyof Answers, value: string) {
    if (isAnswerValue(key, value)) {
      setAnswers((current) => ({ ...current, [key]: value }) as Answers);
    }
  }

  function restart() {
    setAnswers(initialAnswers);
    questionsRef.current
      ?.querySelector<HTMLInputElement>('input[name="eposter-responsible"]')
      ?.focus();
  }

  return (
    <LocalPlannerShell
      eyebrow="Planejamento científico local"
      title="Antecipe decisões sobre pôsteres e ePosters"
      description="Organize escolhas preliminares sem enviar arquivos, cadastrar trabalhos ou publicar conteúdo."
    >
      <div className={styles.layout}>
        <div className={styles.questions} ref={questionsRef}>
          <div className={styles.progressPanel}>
            <p id="eposter-progress">{progressLabel}</p>
            <progress
              aria-labelledby="eposter-progress"
              max={progress.total}
              value={progress.completed}
            >
              {progressLabel}
            </progress>
          </div>
          <section className={styles.eposterGuidance} aria-labelledby="eposter-guidance-title">
            <h2 id="eposter-guidance-title">Orientação para a exibição</h2>
            <p>{guidance}</p>
          </section>
          {questions.map((question) => (
            <LocalPlannerChoiceGroup
              key={question.key}
              legend={question.legend}
              hint={question.hint}
              name={`eposter-${question.key}`}
              options={question.options}
              value={answers[question.key]}
              onChange={(value) => updateAnswer(question.key, value)}
            />
          ))}
        </div>

        <aside className={styles.result} aria-label="Resumo do planejamento">
          <LocalPlannerSummary state={summary.state} title={summary.title}>
            <p>{summary.lead}</p>
            <ul>{summary.actions.map((action) => <li key={action}>{action}</li>)}</ul>
          </LocalPlannerSummary>

          <div className={styles.boundary} role="note">
            <h2>Limites desta ferramenta</h2>
            <p>Este planejamento não recebe, converte, hospeda, exibe ou publica pôster.</p>
          </div>

          <button className={styles.restart} type="button" onClick={restart}>
            Reiniciar planejamento
          </button>
        </aside>
      </div>
    </LocalPlannerShell>
  );
}
