"use client";

import { useMemo, useRef, useState } from "react";

import { LocalPlannerChoiceGroup } from "../../../components/local-planner-choice-group";
import {
  LocalPlannerShell,
  LocalPlannerSummary,
} from "../../../components/local-planner-shell";
import {
  deriveProgress,
  applyAnswer,
  deriveScientificGuidance,
  deriveSummary,
  formatProgressLabel,
  formatSelectionAnnouncement,
  initialAnswers,
  isAnswerValue,
  questions,
  type Answers,
} from "./scientific-planner-model";
import styles from "./planejar-trabalhos-cientificos.module.css";

export function ScientificPlanner() {
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [announcement, setAnnouncement] = useState("");
  const questionsRef = useRef<HTMLDivElement>(null);
  const summary = useMemo(() => deriveSummary(answers), [answers]);
  const progress = useMemo(() => deriveProgress(answers), [answers]);
  const progressLabel = formatProgressLabel(progress.completed, progress.total);
  const scientificGuidance = useMemo(() => deriveScientificGuidance(answers), [answers]);

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
      ?.querySelector<HTMLInputElement>('input[name="scientific-responsible"]')
      ?.focus();
  }

  return (
    <LocalPlannerShell
      eyebrow="Planejamento científico local"
      title="Antecipe decisões sobre trabalhos científicos"
      description="Organize as perguntas que precisarão ser respondidas antes da configuração oficial do evento."
    >
      <div className={styles.layout}>
        <div className={styles.questions} ref={questionsRef}>
          <div className={styles.progressPanel}>
            <p id="scientific-progress">{progressLabel}</p>
            <progress
              aria-labelledby="scientific-progress"
              max={progress.total}
              value={progress.completed}
            >
              {progressLabel}
            </progress>
          </div>
          <section className={styles.scientificGuidance} aria-labelledby="scientific-guidance-title">
            <h2 id="scientific-guidance-title">Orientação científica</h2>
            <p>{scientificGuidance}</p>
          </section>
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
            <p className={styles.announcement}>{announcement}</p>
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
            <p>A EVA apenas orienta; a decisão e a configuração continuam humanas.</p>
          </div>

          <button className={styles.restart} type="button" onClick={restart}>
            Reiniciar planejamento
          </button>
        </aside>
      </div>
    </LocalPlannerShell>
  );
}
