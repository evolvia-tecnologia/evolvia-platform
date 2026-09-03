'use client';

import { useMemo, useState } from 'react';
import styles from './planejar-certificados.module.css';

export type PurposeId = 'participacao-evento' | 'atividade' | 'apresentacao-trabalho' | 'decidir-depois';
export type EligibilityId = 'inscricao-confirmada' | 'presenca-futura' | 'aprovacao-apresentacao-futura' | 'decidir-depois';
export type ModelsId = 'mesmo-modelo' | 'modelos-distintos' | 'decidir-depois';
export type FormatId = 'digital' | 'impressao-sob-demanda' | 'decidir-depois';
export type ValidationId = 'sem-validacao' | 'com-validacao-publica' | 'decidir-depois';
export type StatusId = 'planned' | 'later' | 'stop';
export type DimensionId = 'purpose' | 'eligibility' | 'models' | 'format' | 'validation';
export type StopRuleId =
  | 'responsavel-ausente'
  | 'elegibilidade-indefinida'
  | 'presenca-sem-fonte-confiavel'
  | 'trabalho-sem-aprovacao-apresentacao'
  | 'modelo-sem-campos-revisados'
  | 'validacao-publica-sem-politica';

export type PlannerChoices = {
  purpose: PurposeId | '';
  eligibility: EligibilityId | '';
  models: ModelsId | '';
  format: FormatId | '';
  validation: ValidationId | '';
};

export const STATUS = Object.freeze({
  planned: Object.freeze({ id: 'planned', label: 'definido para planejar', icon: '●' }),
  later: Object.freeze({ id: 'later', label: 'decidir depois', icon: '○' }),
  stop: Object.freeze({ id: 'stop', label: 'pare e confirme', icon: '!' }),
});

export const PURPOSE_OPTIONS = Object.freeze([
  {
    id: 'participacao-evento',
    label: 'Participação no evento',
    help: 'Finalidade preliminar de reconhecer a participação no evento. Esta página não emite certificado e não comprova participação.',
  },
  {
    id: 'atividade',
    label: 'Atividade',
    help: 'Finalidade preliminar ligada a uma atividade. Esta página não consulta atividade real, não registra presença e não emite documento.',
  },
  {
    id: 'apresentacao-trabalho',
    label: 'Apresentação ou trabalho',
    help: 'Finalidade preliminar ligada a apresentação ou trabalho. Esta página não consulta aprovação científica e não comprova apresentação.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a finalidade preliminar para uma decisão humana posterior. Não emite certificado e não altera o evento.',
  },
] as const);

export const ELIGIBILITY_OPTIONS = Object.freeze([
  {
    id: 'inscricao-confirmada',
    label: 'Inscrição confirmada',
    help: 'Critério conceitual: inscrição já confirmada em um fluxo futuro. Esta página não consulta inscrição real nem pede dado pessoal.',
  },
  {
    id: 'presenca-futura',
    label: 'Presença futura',
    help: 'Critério conceitual: presença ainda a ser evidenciada. Esta página não valida presença, não lê check-in e não consulta lista.',
  },
  {
    id: 'aprovacao-apresentacao-futura',
    label: 'Aprovação ou apresentação futura',
    help: 'Critério conceitual: aprovação ou apresentação ainda futura. Esta página não consulta trabalho, não registra aprovação e não emite documento.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe o critério conceitual de elegibilidade para depois. Não consulta dado real e não comprova participação.',
  },
] as const);

export const MODEL_OPTIONS = Object.freeze([
  {
    id: 'mesmo-modelo',
    label: 'Mesmo modelo para todos os perfis',
    help: 'Um único modelo conceitual para todos os perfis. Esta página não cria template, categoria, campo dinâmico nem layout.',
  },
  {
    id: 'modelos-distintos',
    label: 'Haverá modelos distintos por perfil',
    help: 'Há sinal de modelos distintos por perfil. Isso não cria categoria, template, campo revisado nem texto de certificado.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a existência de modelos distintos para depois. Não cria template, categoria ou campo.',
  },
] as const);

export const FORMAT_OPTIONS = Object.freeze([
  {
    id: 'digital',
    label: 'Digital',
    help: 'Formato conceitual digital. Esta página não gera arquivo, PDF, hash, QR, download nem envio.',
  },
  {
    id: 'impressao-sob-demanda',
    label: 'Impressão sob demanda futura',
    help: 'Formato conceitual de impressão sob demanda futura. Esta página não imprime, não gera arquivo e não configura impressora.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe o formato conceitual para depois. Não gera arquivo e não imprime.',
  },
] as const);

export const VALIDATION_OPTIONS = Object.freeze([
  {
    id: 'sem-validacao',
    label: 'Sem validação pública ou segunda via prevista',
    help: 'Não há necessidade futura de validação pública ou segunda via nesta leitura. Esta página não cria código, protocolo ou URL.',
  },
  {
    id: 'com-validacao-publica',
    label: 'Haverá necessidade futura de validação pública ou segunda via',
    help: 'Há necessidade futura de validação pública ou segunda via. Isso não cria código, protocolo, URL, hash nem política.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a necessidade de validação pública ou segunda via para depois. Não cria código, protocolo ou URL.',
  },
] as const);

export const STOP_RULES = Object.freeze([
  {
    id: 'responsavel-ausente',
    title: 'Responsável ausente',
    detail: 'Pare e confirme quem responde pela decisão de certificados. Atividade, apresentação, modelos distintos ou validação pública sem responsável confirmado não autorizam emissão. Esta página não nomeia pessoa e não emite documento.',
  },
  {
    id: 'elegibilidade-indefinida',
    title: 'Elegibilidade indefinida',
    detail: 'A finalidade preliminar e o critério conceitual ainda não se sustentam juntos. Defina a elegibilidade com a pessoa responsável antes de qualquer emissão. Esta página não consulta inscrição, presença ou trabalho reais.',
  },
  {
    id: 'presenca-sem-fonte-confiavel',
    title: 'Presença sem fonte confiável',
    detail: 'Presença futura foi indicada sem fonte confiável de evidência. Esta página não valida presença, não lê check-in e não comprova participação.',
  },
  {
    id: 'trabalho-sem-aprovacao-apresentacao',
    title: 'Trabalho sem aprovação ou apresentação confirmada',
    detail: 'A finalidade ou o critério apontam para apresentação ou trabalho sem aprovação ou apresentação confirmada. Esta página não consulta o módulo científico e não comprova apresentação.',
  },
  {
    id: 'modelo-sem-campos-revisados',
    title: 'Modelo sem campos revisados',
    detail: 'Modelos distintos por perfil foram indicados sem revisar campos. Esta página não cria template, campo dinâmico, categoria nem texto de certificado.',
  },
  {
    id: 'validacao-publica-sem-politica',
    title: 'Validação pública sem política',
    detail: 'A necessidade futura de validação pública ou segunda via foi indicada sem política. Esta página não cria código, protocolo, URL, hash nem segunda via.',
  },
] as const);

const DIMENSIONS = Object.freeze([
  {
    id: 'purpose',
    legend: 'Finalidade preliminar',
    hintId: 'purpose-hint',
    hint: 'Escolha participação no evento, atividade, apresentação ou trabalho. Há opção explícita de decidir depois. Esta página não emite certificado e não comprova participação.',
    name: 'certificates-planner-purpose',
    options: PURPOSE_OPTIONS,
  },
  {
    id: 'eligibility',
    legend: 'Critério conceitual de elegibilidade',
    hintId: 'eligibility-hint',
    hint: 'Escolha inscrição confirmada, presença futura ou aprovação ou apresentação futura, sem consultar dado real. Há opção explícita de decidir depois.',
    name: 'certificates-planner-eligibility',
    options: ELIGIBILITY_OPTIONS,
  },
  {
    id: 'models',
    legend: 'Modelos por perfil',
    hintId: 'models-hint',
    hint: 'Indique se haverá modelos distintos por perfil, sem criar categoria ou template. Há opção explícita de decidir depois.',
    name: 'certificates-planner-models',
    options: MODEL_OPTIONS,
  },
  {
    id: 'format',
    legend: 'Formato conceitual',
    hintId: 'format-hint',
    hint: 'Indique o formato conceitual: digital ou impressão sob demanda futura, sem gerar arquivo. Há opção explícita de decidir depois.',
    name: 'certificates-planner-format',
    options: FORMAT_OPTIONS,
  },
  {
    id: 'validation',
    legend: 'Validação pública ou segunda via',
    hintId: 'validation-hint',
    hint: 'Indique a necessidade futura de validação pública ou segunda via, sem criar código, protocolo ou URL. Há opção explícita de decidir depois.',
    name: 'certificates-planner-validation',
    options: VALIDATION_OPTIONS,
  },
] as const);

const STATUS_CLASS = {
  planned: styles.statusPlanned,
  later: styles.statusLater,
  stop: styles.statusStop,
} as const;

const INITIAL_ANNOUNCEMENT =
  'Nenhuma escolha feita. O resumo aparece quando as cinco dimensões estiverem definidas.';

const NEXT_STEP = Object.freeze({
  purpose: 'Escolha a finalidade preliminar.',
  eligibility: 'Escolha o critério conceitual de elegibilidade.',
  models: 'Indique se haverá modelos distintos por perfil.',
  format: 'Indique o formato conceitual.',
  validation: 'Indique a necessidade futura de validação pública ou segunda via.',
});

export function emptyChoices(): PlannerChoices {
  return {
    purpose: '',
    eligibility: '',
    models: '',
    format: '',
    validation: '',
  };
}

export function nextStepFor(choices: PlannerChoices) {
  if (!choices.purpose) return NEXT_STEP.purpose;
  if (!choices.eligibility) return NEXT_STEP.eligibility;
  if (!choices.models) return NEXT_STEP.models;
  if (!choices.format) return NEXT_STEP.format;
  if (!choices.validation) return NEXT_STEP.validation;
  return null;
}

export function stopRulesFor(choices: PlannerChoices): StopRuleId[] {
  const rules: StopRuleId[] = [];
  if (
    choices.purpose === 'atividade'
    || choices.purpose === 'apresentacao-trabalho'
    || choices.models === 'modelos-distintos'
    || choices.validation === 'com-validacao-publica'
  ) {
    rules.push('responsavel-ausente');
  }
  if (
    choices.purpose === 'atividade'
    || choices.purpose === 'apresentacao-trabalho'
    || (choices.purpose === 'participacao-evento' && choices.eligibility === 'aprovacao-apresentacao-futura')
  ) {
    rules.push('elegibilidade-indefinida');
  }
  if (choices.eligibility === 'presenca-futura') {
    rules.push('presenca-sem-fonte-confiavel');
  }
  if (
    choices.purpose === 'apresentacao-trabalho'
    || choices.eligibility === 'aprovacao-apresentacao-futura'
  ) {
    rules.push('trabalho-sem-aprovacao-apresentacao');
  }
  if (choices.models === 'modelos-distintos') {
    rules.push('modelo-sem-campos-revisados');
  }
  if (choices.validation === 'com-validacao-publica') {
    rules.push('validacao-publica-sem-politica');
  }
  return rules;
}

export function statusForDimension(dimension: DimensionId, value: string): StatusId {
  if (value === 'decidir-depois') return 'later';
  if (dimension === 'purpose' && (value === 'atividade' || value === 'apresentacao-trabalho')) return 'stop';
  if (dimension === 'eligibility' && (value === 'presenca-futura' || value === 'aprovacao-apresentacao-futura')) return 'stop';
  if (dimension === 'models' && value === 'modelos-distintos') return 'stop';
  if (dimension === 'validation' && value === 'com-validacao-publica') return 'stop';
  return 'planned';
}

export function overallStatusFor(choices: PlannerChoices, rules: StopRuleId[]): StatusId {
  if (rules.length > 0) return 'stop';
  if (
    choices.purpose === 'decidir-depois'
    || choices.eligibility === 'decidir-depois'
    || choices.models === 'decidir-depois'
    || choices.format === 'decidir-depois'
    || choices.validation === 'decidir-depois'
  ) {
    return 'later';
  }
  return 'planned';
}

function optionById<T extends { id: string }>(options: readonly T[], id: string) {
  return options.find((option) => option.id === id);
}

export function planCertificates(choices: PlannerChoices) {
  if (nextStepFor(choices)) return null;

  const purpose = optionById(PURPOSE_OPTIONS, choices.purpose);
  const eligibility = optionById(ELIGIBILITY_OPTIONS, choices.eligibility);
  const models = optionById(MODEL_OPTIONS, choices.models);
  const format = optionById(FORMAT_OPTIONS, choices.format);
  const validation = optionById(VALIDATION_OPTIONS, choices.validation);
  if (!purpose || !eligibility || !models || !format || !validation) return null;

  const rules = stopRulesFor(choices);
  const overall = overallStatusFor(choices, rules);
  const overallMeta = STATUS[overall];

  const dimensions = [
    { id: 'purpose' as const, title: 'Finalidade preliminar', option: purpose },
    { id: 'eligibility' as const, title: 'Critério conceitual de elegibilidade', option: eligibility },
    { id: 'models' as const, title: 'Modelos por perfil', option: models },
    { id: 'format' as const, title: 'Formato conceitual', option: format },
    { id: 'validation' as const, title: 'Validação pública ou segunda via', option: validation },
  ].map((item) => {
    const status = statusForDimension(item.id, item.option.id);
    const meta = STATUS[status];
    return {
      id: item.id,
      title: item.title,
      value: item.option.label,
      status,
      statusLabel: meta.label,
      icon: meta.icon,
    };
  });

  const stopRules = rules.map((id) => {
    const rule = STOP_RULES.find((item) => item.id === id);
    const meta = STATUS.stop;
    return {
      id,
      title: rule?.title ?? id,
      detail: rule?.detail ?? '',
      status: 'stop' as const,
      statusLabel: meta.label,
      icon: meta.icon,
    };
  });

  return {
    overall,
    overallLabel: overallMeta.label,
    overallIcon: overallMeta.icon,
    dimensions,
    stopRules,
    announcement:
      `Resumo atualizado: ${purpose.label}, ${eligibility.label}, ${models.label}, ${format.label}, ${validation.label}. Estado geral: ${overallMeta.label}. ${stopRules.length} ${stopRules.length === 1 ? 'regra de parada' : 'regras de parada'}. Este resultado não emite certificado, não comprova participação, não valida presença e não altera o evento.`,
  };
}

export default function CertificatesPlanner() {
  const [choices, setChoices] = useState(emptyChoices);
  const [restarted, setRestarted] = useState(false);

  const plan = useMemo(() => planCertificates(choices), [choices]);
  const nextStep = useMemo(() => nextStepFor(choices), [choices]);

  const announcement = useMemo(() => {
    if (
      !choices.purpose
      && !choices.eligibility
      && !choices.models
      && !choices.format
      && !choices.validation
    ) {
      return restarted
        ? 'Escolhas reiniciadas. Nenhum resumo está visível.'
        : INITIAL_ANNOUNCEMENT;
    }
    if (!plan) {
      return `Atualização: ainda faltam escolhas. Próximo passo: ${nextStep}`;
    }
    return plan.announcement;
  }, [choices, plan, restarted, nextStep]);

  function select(dimension: keyof PlannerChoices, value: string) {
    setChoices((current) => ({ ...current, [dimension]: value }));
  }

  function restart() {
    setChoices(emptyChoices());
    setRestarted(true);
  }

  return <section className={styles.planner} aria-labelledby="planner-title">
    <h2 id="planner-title">Comparar o plano inicial de certificados</h2>
    <p className={styles.plannerLead}>
      As cinco dimensões usam opções fechadas, com decidir depois quando aplicável.
      Não há campo livre. O resultado só aparece depois das cinco escolhas e
      permanece só na memória desta página.
    </p>

    {DIMENSIONS.map((dimension) => <fieldset key={dimension.id} className={styles.group} aria-describedby={dimension.hintId}>
      <legend>{dimension.legend}</legend>
      <p className={styles.fieldHint} id={dimension.hintId}>{dimension.hint}</p>
      {dimension.options.map((option) => {
        const selected = choices[dimension.id] === option.id;
        return <div key={option.id} className={styles.option}>
          <input
            id={`${dimension.id}-${option.id}`}
            type="radio"
            name={dimension.name}
            checked={selected}
            onChange={() => select(dimension.id, option.id)}
          />
          <label htmlFor={`${dimension.id}-${option.id}`}>
            <span className={styles.optionTitle}>
              {option.label}
              {selected ? <span className={styles.selectedMark}>Selecionado</span> : null}
            </span>
            <span className={styles.optionHelp}>{option.help}</span>
          </label>
        </div>;
      })}
    </fieldset>)}

    <div className={`${styles.result} ${plan ? styles.resultReady : styles.resultStart}`}>
      <div className={styles.resultHead}>
        <h3 id="summary-title">Resumo das escolhas</h3>
        <button type="button" className={styles.resetButton} onClick={restart}>
          Reiniciar escolhas
        </button>
      </div>

      <div role="status" aria-live="polite" aria-atomic="true" aria-labelledby="summary-title">
        <p className={styles.announcement}>{announcement}</p>

        {plan ? <>
          <p
            className={`${styles.overall} ${STATUS_CLASS[plan.overall]}`}
            data-status={plan.overall}
          >
            <span className={styles.statusIcon} aria-hidden="true">{plan.overallIcon}</span>
            <span className={styles.statusLabel}>{plan.overallLabel}</span>
          </p>

          <dl className={styles.summaryList}>
            {plan.dimensions.map((item) => <div
              key={item.id}
              className={STATUS_CLASS[item.status]}
              data-status={item.status}
            >
              <dt>{item.title}</dt>
              <dd>
                <span className={styles.statusIcon} aria-hidden="true">{item.icon}</span>
                <span className={styles.statusLabel}>{item.statusLabel}</span>
                <span>{item.value}</span>
              </dd>
            </div>)}
          </dl>

          <p className={styles.resultNote}>
            Os três estados aparecem por texto, ícone e estilo de borda, nunca só por cor.
            Nada disso emite certificado, comprova participação, valida presença ou altera o evento.
          </p>

          <ul className={styles.levelLegend} aria-label="Estados do planejamento">
            {Object.values(STATUS).map((level) => <li
              key={level.id}
              className={`${styles.levelItem} ${STATUS_CLASS[level.id]}`}
            >
              <span className={styles.statusIcon} aria-hidden="true">{level.icon}</span>
              <span>{level.label}</span>
            </li>)}
          </ul>

          {plan.stopRules.length > 0 ? <>
            <h4 className={styles.stopTitle} id="stop-rules-title">Regras de parada</h4>
            <ol className={styles.checkpoints} aria-labelledby="stop-rules-title">
              {plan.stopRules.map((item) => <li
                key={item.id}
                className={`${styles.checkpoint} ${STATUS_CLASS[item.status]}`}
                data-status={item.status}
                data-stop={item.id}
              >
                <p className={styles.checkpointHead}>
                  <span className={styles.statusIcon} aria-hidden="true">{item.icon}</span>
                  <span className={styles.statusLabel}>{item.statusLabel}</span>
                  <span className={styles.checkpointTitle}>{item.title}</span>
                </p>
                <p className={styles.checkpointDetail}>{item.detail}</p>
              </li>)}
            </ol>
          </> : <p className={styles.resultNote}>
            Nenhuma regra de parada nesta combinação. Confirme as escolhas com a
            pessoa responsável antes de configurar o evento. Nenhuma combinação
            emite documento ou comprova participação.
          </p>}
        </> : <p className={styles.resultNote}>
          {nextStep
            ? `Combinação incompleta. Próximo passo: ${nextStep}`
            : 'Escolha as cinco dimensões para ver o resumo determinístico.'}
        </p>}
      </div>
    </div>
  </section>;
}
