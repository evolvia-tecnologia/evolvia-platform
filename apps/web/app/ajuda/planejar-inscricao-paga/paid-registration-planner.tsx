"use client";

import { useMemo, useRef, useState } from "react";

import { LocalPlannerChoiceGroup } from "../../../components/local-planner-choice-group";
import {
  LocalPlannerShell,
  LocalPlannerSummary,
} from "../../../components/local-planner-shell";
import {
  applyAnswer,
  deriveProgress,
  deriveScenarioGuidance,
  deriveSummary,
  initialAnswers,
  isAnswerValue,
  formatProgressLabel,
  formatSelectionAnnouncement,
  questions,
  type Answers,
} from "./paid-registration-model";
import styles from "./planejar-inscricao-paga.module.css";

export function PaidRegistrationPlanner() {
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [announcement, setAnnouncement] = useState("");
  const questionsRef = useRef<HTMLDivElement>(null);
  const summary = useMemo(() => deriveSummary(answers), [answers]);
  const progress = useMemo(() => deriveProgress(answers), [answers]);
  const scenarioGuidance = useMemo(
    () => deriveScenarioGuidance(answers.scenario),
    [answers.scenario],
  );
  const progressLabel = formatProgressLabel(progress.completed, progress.total);

  function updateAnswer(key: keyof Answers, value: string) {
    if (isAnswerValue(key, value)) {
      setAnswers((current) => applyAnswer(current, key, value));
      setAnnouncement(formatSelectionAnnouncement(key, value));
    }
  }

  function restart() {
    setAnswers(initialAnswers);
    setAnnouncement("Planejamento reiniciado. Todas as decisões foram limpas.");
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
              {progressLabel}
            </p>
            <progress
              aria-labelledby="paid-registration-progress"
              max={progress.total}
              value={progress.completed}
            >
              {progressLabel}
            </progress>
          </div>
          <section className={styles.scenarioGuidance} aria-labelledby="scenario-guidance-title">
            <h2 id="scenario-guidance-title">Orientação para o cenário</h2>
            <p>{scenarioGuidance}</p>
          </section>
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
            <p className={styles.announcement}>{announcement}</p>
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
