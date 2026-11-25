'use client';

import { useMemo, useState } from 'react';
import styles from './planejar-controle-acesso.module.css';

export type ScenarioId = 'entrada-unica' | 'multiplos-pontos' | 'entrada-e-reentrada';
export type ValidationId = 'lista-nominal' | 'qr-emitido' | 'decidir-depois';
export type AreasId = 'sem-acesso-distinto' | 'com-acesso-distinto' | 'decidir-depois';
export type FlowId = 'fluxo-distribuido' | 'fluxo-moderado' | 'pico';
export type ContingencyId = 'contingencia-prevista' | 'sem-contingencia' | 'decidir-depois';
export type StatusId = 'planned' | 'later' | 'stop';
export type DimensionId = 'scenario' | 'validation' | 'areas' | 'flow' | 'contingency';
export type StopRuleId =
  | 'responsavel-ausente'
  | 'ponto-sem-capacidade-definida'
  | 'reentrada-sem-politica'
  | 'area-restrita-sem-autorizacao'
  | 'contingencia-inexistente';

export type PlannerChoices = {
  scenario: ScenarioId | '';
  validation: ValidationId | '';
  areas: AreasId | '';
  flow: FlowId | '';
  contingency: ContingencyId | '';
};

export const STATUS = Object.freeze({
  planned: Object.freeze({ id: 'planned', label: 'definido para planejar', icon: '●' }),
  later: Object.freeze({ id: 'later', label: 'decidir depois', icon: '○' }),
  stop: Object.freeze({ id: 'stop', label: 'pare e confirme', icon: '!' }),
});

export const SCENARIO_OPTIONS = Object.freeze([
  {
    id: 'entrada-unica',
    label: 'Entrada única',
    help: 'Há um único ponto preliminar de entrada. Esta página não configura o ponto, não abre catraca e não registra presença.',
  },
  {
    id: 'multiplos-pontos',
    label: 'Múltiplos pontos',
    help: 'Há mais de um ponto preliminar de acesso. Esta página não define equipe, capacidade real nem autorização por ponto.',
  },
  {
    id: 'entrada-e-reentrada',
    label: 'Entrada e reentrada',
    help: 'O cenário preliminar inclui entrada e reentrada. Esta página não cria política de reentrada e não registra saída ou retorno.',
  },
] as const);

export const VALIDATION_OPTIONS = Object.freeze([
  {
    id: 'lista-nominal',
    label: 'Lista nominal',
    help: 'A validação prevista é conferir uma lista de nomes já conhecida. Não peça nome, documento ou dado pessoal nesta página.',
  },
  {
    id: 'qr-emitido',
    label: 'QR previamente emitido',
    help: 'A validação prevista usaria um QR emitido depois, em outro fluxo. Esta página não lê, não valida e não pede QR.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a forma conceitual de validação para uma decisão humana posterior. Não pede identificador e não lê QR.',
  },
] as const);

export const AREAS_OPTIONS = Object.freeze([
  {
    id: 'sem-acesso-distinto',
    label: 'Sem áreas ou atividades de acesso distinto',
    help: 'Não há áreas ou atividades com acesso distinto neste planejamento. Esta página não cria permissão, ACL ou lista de acesso.',
  },
  {
    id: 'com-acesso-distinto',
    label: 'Haverá áreas ou atividades com acesso distinto',
    help: 'Há áreas ou atividades com acesso distinto só como indicação preliminar. Isso não cria autorização, não nomeia área e não concede permissão.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a existência de áreas ou atividades com acesso distinto para depois. Esta página não cria permissão.',
  },
] as const);

export const FLOW_OPTIONS = Object.freeze([
  {
    id: 'fluxo-distribuido',
    label: 'Fluxo distribuído',
    help: 'Faixa genérica de fluxo baixo e espaçado. Não informe quantidade real de pessoas nem capacidade do ponto.',
  },
  {
    id: 'fluxo-moderado',
    label: 'Fluxo moderado',
    help: 'Faixa genérica. Não informe quantidade real, não confirma capacidade do ponto e não define equipe.',
  },
  {
    id: 'pico',
    label: 'Pico',
    help: 'Faixa genérica de fluxo concentrado. Não estime lotação, fila real nem tempo de passagem.',
  },
] as const);

export const CONTINGENCY_OPTIONS = Object.freeze([
  {
    id: 'contingencia-prevista',
    label: 'Contingência manual ou offline prevista',
    help: 'Há um caminho manual ou offline previsto só como necessidade. Esta página não sincroniza e não implementa fallback.',
  },
  {
    id: 'sem-contingencia',
    label: 'Sem contingência prevista',
    help: 'Nenhum caminho offline ou manual foi previsto. Isso não autoriza operação e não cria modo offline.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a necessidade de contingência para depois. Esta página não sincroniza nem opera offline.',
  },
] as const);

export const STOP_RULES = Object.freeze([
  {
    id: 'responsavel-ausente',
    title: 'Responsável ausente',
    detail: 'Pare e confirme quem responde pelos pontos de acesso. Múltiplos pontos sem responsável confirmado não autorizam operação. Esta página não nomeia pessoa, não atribui equipe e não registra presença.',
  },
  {
    id: 'ponto-sem-capacidade-definida',
    title: 'Ponto sem capacidade definida',
    detail: 'A faixa de fluxo ou a existência de múltiplos pontos ainda não define capacidade. Confirme isso com a pessoa responsável antes de qualquer operação. Esta página não estima fila, equipe nem tempo de passagem.',
  },
  {
    id: 'reentrada-sem-politica',
    title: 'Reentrada sem política',
    detail: 'O cenário inclui reentrada, mas esta página não cria política de reentrada. Sem essa decisão humana, o modelo não está pronto para operação. Nada aqui registra saída, retorno ou presença.',
  },
  {
    id: 'area-restrita-sem-autorizacao',
    title: 'Área restrita sem autorização',
    detail: 'Há áreas ou atividades com acesso distinto sem autorização definida. Esta página não cria ACL, não concede permissão e não nomeia área, pessoa ou atividade.',
  },
  {
    id: 'contingencia-inexistente',
    title: 'Contingência inexistente',
    detail: 'Nenhum caminho offline ou manual foi previsto. Sem contingência, o modelo não está pronto para operação. Esta página não sincroniza, não cria modo offline e não registra presença.',
  },
] as const);

const DIMENSIONS = Object.freeze([
  {
    id: 'scenario',
    legend: 'Cenário preliminar de entrada',
    hintId: 'scenario-hint',
    hint: 'Escolha entrada única, múltiplos pontos ou entrada e reentrada. Esta página não configura ponto, não abre catraca e não registra presença.',
    name: 'access-control-planner-scenario',
    options: SCENARIO_OPTIONS,
  },
  {
    id: 'validation',
    legend: 'Forma conceitual de validação',
    hintId: 'validation-hint',
    hint: 'Escolha lista nominal, QR previamente emitido ou decidir depois. Não peça nome, documento, ingresso, QR ou outro identificador nesta página.',
    name: 'access-control-planner-validation',
    options: VALIDATION_OPTIONS,
  },
  {
    id: 'areas',
    legend: 'Áreas ou atividades com acesso distinto',
    hintId: 'areas-hint',
    hint: 'Indique se haverá áreas ou atividades com acesso distinto, sem criar permissões. Há opção explícita de decidir depois.',
    name: 'access-control-planner-areas',
    options: AREAS_OPTIONS,
  },
  {
    id: 'flow',
    legend: 'Faixa genérica de fluxo',
    hintId: 'flow-hint',
    hint: 'Escolha uma faixa genérica. Não solicite nem informe quantidade real de pessoas, capacidade do ponto ou tempo de passagem.',
    name: 'access-control-planner-flow',
    options: FLOW_OPTIONS,
  },
  {
    id: 'contingency',
    legend: 'Contingência manual ou offline',
    hintId: 'contingency-hint',
    hint: 'Indique se haverá um caminho manual ou offline. Há opção explícita de decidir depois. Esta página não sincroniza e não implementa fallback real.',
    name: 'access-control-planner-contingency',
    options: CONTINGENCY_OPTIONS,
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
  scenario: 'Escolha o cenário preliminar de entrada.',
  validation: 'Escolha a forma conceitual de validação.',
  areas: 'Indique se haverá áreas ou atividades com acesso distinto.',
  flow: 'Escolha a faixa genérica de fluxo.',
  contingency: 'Indique se haverá contingência manual ou offline.',
});

export function emptyChoices(): PlannerChoices {
  return {
    scenario: '',
    validation: '',
    areas: '',
    flow: '',
    contingency: '',
  };
}

export function nextStepFor(choices: PlannerChoices) {
  if (!choices.scenario) return NEXT_STEP.scenario;
  if (!choices.validation) return NEXT_STEP.validation;
  if (!choices.areas) return NEXT_STEP.areas;
  if (!choices.flow) return NEXT_STEP.flow;
  if (!choices.contingency) return NEXT_STEP.contingency;
  return null;
}

export function stopRulesFor(choices: PlannerChoices): StopRuleId[] {
  const rules: StopRuleId[] = [];
  if (choices.scenario === 'multiplos-pontos') {
    rules.push('responsavel-ausente');
  }
  if (
    choices.flow === 'fluxo-moderado'
    || choices.flow === 'pico'
    || choices.scenario === 'multiplos-pontos'
  ) {
    rules.push('ponto-sem-capacidade-definida');
  }
  if (choices.scenario === 'entrada-e-reentrada') {
    rules.push('reentrada-sem-politica');
  }
  if (choices.areas === 'com-acesso-distinto') {
    rules.push('area-restrita-sem-autorizacao');
  }
  if (choices.contingency === 'sem-contingencia') {
    rules.push('contingencia-inexistente');
  }
  return rules;
}

export function statusForDimension(dimension: DimensionId, value: string): StatusId {
  if (value === 'decidir-depois') return 'later';
  if (dimension === 'scenario' && (value === 'multiplos-pontos' || value === 'entrada-e-reentrada')) return 'stop';
  if (dimension === 'areas' && value === 'com-acesso-distinto') return 'stop';
  if (dimension === 'flow' && (value === 'fluxo-moderado' || value === 'pico')) return 'stop';
  if (dimension === 'contingency' && value === 'sem-contingencia') return 'stop';
  return 'planned';
}

export function overallStatusFor(choices: PlannerChoices, rules: StopRuleId[]): StatusId {
  if (rules.length > 0) return 'stop';
  if (
    choices.validation === 'decidir-depois'
    || choices.areas === 'decidir-depois'
    || choices.contingency === 'decidir-depois'
  ) {
    return 'later';
  }
  return 'planned';
}

function optionById<T extends { id: string }>(options: readonly T[], id: string) {
  return options.find((option) => option.id === id);
}

export function planAccessControl(choices: PlannerChoices) {
  if (nextStepFor(choices)) return null;

  const scenario = optionById(SCENARIO_OPTIONS, choices.scenario);
  const validation = optionById(VALIDATION_OPTIONS, choices.validation);
  const areas = optionById(AREAS_OPTIONS, choices.areas);
  const flow = optionById(FLOW_OPTIONS, choices.flow);
  const contingency = optionById(CONTINGENCY_OPTIONS, choices.contingency);
  if (!scenario || !validation || !areas || !flow || !contingency) return null;

  const rules = stopRulesFor(choices);
  const overall = overallStatusFor(choices, rules);
  const overallMeta = STATUS[overall];

  const dimensions = [
    { id: 'scenario' as const, title: 'Cenário preliminar de entrada', option: scenario },
    { id: 'validation' as const, title: 'Forma conceitual de validação', option: validation },
    { id: 'areas' as const, title: 'Áreas ou atividades com acesso distinto', option: areas },
    { id: 'flow' as const, title: 'Faixa genérica de fluxo', option: flow },
    { id: 'contingency' as const, title: 'Contingência manual ou offline', option: contingency },
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
      `Resumo atualizado: ${scenario.label}, ${validation.label}, ${areas.label}, ${flow.label}, ${contingency.label}. Estado geral: ${overallMeta.label}. ${stopRules.length} ${stopRules.length === 1 ? 'regra de parada' : 'regras de parada'}. Este resultado não valida QR, não concede permissão, não abre catraca e não registra presença.`,
  };
}

export default function AccessControlPlanner() {
  const [choices, setChoices] = useState(emptyChoices);
  const [restarted, setRestarted] = useState(false);

  const plan = useMemo(() => planAccessControl(choices), [choices]);
  const nextStep = useMemo(() => nextStepFor(choices), [choices]);

  const announcement = useMemo(() => {
    if (
      !choices.scenario
      && !choices.validation
      && !choices.areas
      && !choices.flow
      && !choices.contingency
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
    <h2 id="planner-title">Comparar o modelo inicial de controle de acesso</h2>
    <p className={styles.plannerLead}>
      As cinco dimensões usam opções fechadas, com decidir depois quando aplicável.
      Não há campo livre. O resultado só aparece depois das cinco escolhas e
      permanece só na memória desta página. Esta página não altera o catálogo dos
      19 tipos nem cria regra paralela de acesso.
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
            Nada disso valida QR, concede permissão, abre catraca ou registra presença.
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
            autoriza operação real.
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
