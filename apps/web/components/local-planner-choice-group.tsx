"use client";

import type { ChangeEvent } from "react";

import styles from "./local-planner-shell.module.css";

export type LocalPlannerChoice = {
  value: string;
  label: string;
  description?: string;
};

type LocalPlannerChoiceGroupProps = {
  legend: string;
  hint?: string;
  name: string;
  options: readonly LocalPlannerChoice[];
  value: string;
  onChange: (value: string) => void;
};

export function LocalPlannerChoiceGroup({
  legend,
  hint,
  name,
  options,
  value,
  onChange,
}: LocalPlannerChoiceGroupProps) {
  const hintId = hint ? `${name}-hint` : undefined;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.currentTarget.value);
  }

  return (
    <fieldset className={styles.choiceGroup} aria-describedby={hintId}>
      <legend>{legend}</legend>
      {hint ? (
        <p className={styles.choiceHint} id={hintId}>
          {hint}
        </p>
      ) : null}

      <div className={styles.choiceOptions}>
        {options.map((option) => (
          <label className={styles.choiceOption} key={option.value}>
            <input
              checked={value === option.value}
              name={name}
              onChange={handleChange}
              type="radio"
              value={option.value}
            />
            <span>
              <strong>{option.label}</strong>
              {option.description ? <small>{option.description}</small> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
