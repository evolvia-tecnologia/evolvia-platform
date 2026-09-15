"use client";

import { useMemo, useRef, useState } from "react";

import { LocalPlannerChoiceGroup } from "../../../components/local-planner-choice-group";
import {
  LocalPlannerShell,
  LocalPlannerSummary,
} from "../../../components/local-planner-shell";
import {
  deriveProgress,
  deriveSummary,
  initialAnswers,
  questions,
  type Answers,
} from "./paid-registration-model";
import styles from "./planejar-inscricao-paga.module.css";

export function PaidRegistrationPlanner() {
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const questionsRef = useRef<HTMLDivElement>(null);
  const summary = useMemo(() => deriveSummary(answers), [answers]);
  const progress = useMemo(() => deriveProgress(answers), [answers]);

  function updateAnswer(key: keyof Answers, value: string) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  function restart() {
    setAnswers(initialAnswers);
    questionsRef.current
      ?.querySelector<HTMLInputElement>('input[name="paid-registration-responsible"]')
      ?.focus();
  }

  return (
    <LocalPlannerShell
      eyebrow="Planejamento financeiro local"
      title="Antecipe decisões sobre inscrições pagas"
      description="Organize as perguntas que precisarão ser respondidas antes da configuração oficial do evento."
    >
      <div className={styles.layout}>
        <div className={styles.questions} ref={questionsRef}>
          <div className={styles.progressPanel}>
            <p id="paid-registration-progress">
              Progresso: {progress.completed} de {progress.total} decisões respondidas.
            </p>
            <progress
              aria-labelledby="paid-registration-progress"
              max={progress.total}
              value={progress.completed}
            />
          </div>
          {questions.map((question) => (
            <LocalPlannerChoiceGroup
              key={question.key}
              legend={question.legend}
              hint={question.hint}
              name={`paid-registration-${question.key}`}
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
            <p>
              Este planejamento não calcula preço, não cobra, não reserva vaga e não processa pagamento.
            </p>
            <p>
              A EVA pode orientar as próximas decisões, mas a validação e a configuração continuam humanas.
            </p>
          </div>

          <button className={styles.restart} type="button" onClick={restart}>
            Reiniciar planejamento
          </button>
        </aside>
      </div>
    </LocalPlannerShell>
  );
}
