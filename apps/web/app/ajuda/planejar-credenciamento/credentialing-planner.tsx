'use client';

import { useMemo, useState } from 'react';
import styles from './planejar-credenciamento.module.css';

export type ArrivalId = 'balcao-assistido' | 'autoatendimento' | 'combinacao';
export type IdentificationId = 'confirmacao-nominal' | 'qr-futuro' | 'decidir-depois';
export type PrintingId = 'sem-impressao' | 'com-impressao' | 'decidir-depois';
export type ConcurrencyId = 'chegada-espacada' | 'simultaneidade-moderada' | 'pico-concentrado';
export type ContingencyId = 'contingencia-prevista' | 'sem-contingencia' | 'decidir-depois';
export type StatusId = 'planned' | 'later' | 'stop';
export type DimensionId = 'arrival' | 'identification' | 'printing' | 'concurrency' | 'contingency';
export type StopRuleId =
  | 'responsavel-operacional-ausente'
  | 'capacidade-atendimento-nao-confirmada'
  | 'equipamento-impressora-nao-validado'
  | 'acessibilidade-ponto-nao-revisada'
  | 'contingencia-inexistente';

export type PlannerChoices = {
  arrival: ArrivalId | '';
  identification: IdentificationId | '';
  printing: PrintingId | '';
  concurrency: ConcurrencyId | '';
  contingency: ContingencyId | '';
};

export const STATUS = Object.freeze({
  planned: Object.freeze({ id: 'planned', label: 'definido para planejar', icon: '●' }),
  later: Object.freeze({ id: 'later', label: 'decidir depois', icon: '○' }),
  stop: Object.freeze({ id: 'stop', label: 'pare e confirme', icon: '!' }),
});

export const ARRIVAL_OPTIONS = Object.freeze([
  {
    id: 'balcao-assistido',
    label: 'Balcão assistido',
    help: 'Chegada prevista com atendimento humano no balcão. Esta página não monta fila, não define equipe e não registra presença.',
  },
  {
    id: 'autoatendimento',
    label: 'Autoatendimento',
    help: 'Chegada prevista sem atendimento contínuo no ponto. Esta página não configura quiosque, leitor, câmera ou dispositivo.',
  },
  {
    id: 'combinacao',
    label: 'Combinação dos dois',
    help: 'Há frente assistida e frente de autoatendimento. Uma não substitui a outra automaticamente e nada aqui opera as duas.',
  },
] as const);

export const IDENTIFICATION_OPTIONS = Object.freeze([
  {
    id: 'confirmacao-nominal',
    label: 'Confirmação nominal',
    help: 'A identificação prevista é confirmar o nome já conhecido. Não peça nome, documento ou dado pessoal nesta página.',
  },
  {
    id: 'qr-futuro',
    label: 'QR já emitido por fluxo futuro',
    help: 'A identificação prevista usaria um QR emitido depois, em outro fluxo. Esta página não lê, não valida e não pede QR.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a identificação prevista para uma decisão humana posterior. Não pede nome e não lê QR.',
  },
] as const);

export const PRINTING_OPTIONS = Object.freeze([
  {
    id: 'sem-impressao',
    label: 'Sem impressão local prevista',
    help: 'Não há necessidade preliminar de imprimir crachá ou etiqueta no ponto. Esta página não imprime.',
  },
  {
    id: 'com-impressao',
    label: 'Haverá impressão local de crachá ou etiqueta',
    help: 'Há necessidade operacional preliminar de impressão local. Isso não valida impressora, não imprime e não cria crachá.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a necessidade de impressão local para depois. Esta página não imprime nem configura equipamento.',
  },
] as const);

export const CONCURRENCY_OPTIONS = Object.freeze([
  {
    id: 'chegada-espacada',
    label: 'Chegada espaçada',
    help: 'Faixa genérica de simultaneidade baixa. Não informe número exato de participantes nem capacidade real.',
  },
  {
    id: 'simultaneidade-moderada',
    label: 'Simultaneidade moderada',
    help: 'Faixa genérica. Não informe quantidade exata, não confirma capacidade de atendimento e não define equipe.',
  },
  {
    id: 'pico-concentrado',
    label: 'Pico concentrado',
    help: 'Faixa genérica de chegada concentrada. Não estime lotação, fila real nem tempo de atendimento.',
  },
] as const);

export const CONTINGENCY_OPTIONS = Object.freeze([
  {
    id: 'contingencia-prevista',
    label: 'Contingência offline ou manual prevista',
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
    id: 'responsavel-operacional-ausente',
    title: 'Responsável operacional ausente',
    detail: 'Pare e confirme quem responde pelo ponto de credenciamento. Autoatendimento ou combinação sem responsável confirmado não autoriza operação. Esta página não nomeia pessoa, não atribui equipe e não registra presença.',
  },
  {
    id: 'capacidade-atendimento-nao-confirmada',
    title: 'Capacidade de atendimento não confirmada',
    detail: 'A faixa de simultaneidade ou a combinação de frentes ainda não confirma capacidade de atendimento. Defina isso com a pessoa responsável antes de qualquer operação. Esta página não estima fila, equipe nem tempo de resposta.',
  },
  {
    id: 'equipamento-impressora-nao-validado',
    title: 'Equipamento ou impressora não validado',
    detail: 'A impressão local de crachá ou etiqueta foi indicada sem validar equipamento. Esta página não imprime, não testa impressora e não cria credencial.',
  },
  {
    id: 'acessibilidade-ponto-nao-revisada',
    title: 'Acessibilidade do ponto não revisada',
    detail: 'O ponto de autoatendimento ou a combinação das frentes ainda não teve a acessibilidade revisada. Isso não certifica acessibilidade e não afirma adequação do local.',
  },
  {
    id: 'contingencia-inexistente',
    title: 'Contingência inexistente',
    detail: 'Nenhum caminho offline ou manual foi previsto. Sem contingência, o modelo não está pronto para operação. Esta página não sincroniza, não cria modo offline e não registra presença.',
  },
] as const);

const DIMENSIONS = Object.freeze([
  {
    id: 'arrival',
    legend: 'Modelo preliminar de chegada',
    hintId: 'arrival-hint',
    hint: 'Escolha balcão assistido, autoatendimento ou a combinação dos dois. Esta página não monta fila, não configura quiosque e não registra presença.',
    name: 'credentialing-planner-arrival',
    options: ARRIVAL_OPTIONS,
  },
  {
    id: 'identification',
    legend: 'Identificação prevista',
    hintId: 'identification-hint',
    hint: 'Escolha confirmação nominal, QR já emitido por um fluxo futuro ou decidir depois. Não peça nome, documento ou QR nesta página.',
    name: 'credentialing-planner-identification',
    options: IDENTIFICATION_OPTIONS,
  },
  {
    id: 'printing',
    legend: 'Impressão local',
    hintId: 'printing-hint',
    hint: 'Indique se haverá impressão local de crachá ou etiqueta apenas como necessidade operacional preliminar. Há opção explícita de decidir depois. Esta página não imprime.',
    name: 'credentialing-planner-printing',
    options: PRINTING_OPTIONS,
  },
  {
    id: 'concurrency',
    legend: 'Faixa de simultaneidade de chegada',
    hintId: 'concurrency-hint',
    hint: 'Escolha uma faixa genérica. Não solicite nem informe número exato de participantes, capacidade real ou tempo de atendimento.',
    name: 'credentialing-planner-concurrency',
    options: CONCURRENCY_OPTIONS,
  },
  {
    id: 'contingency',
    legend: 'Contingência offline ou manual',
    hintId: 'contingency-hint',
    hint: 'Indique se haverá um caminho offline ou manual. Há opção explícita de decidir depois. Esta página não sincroniza e não implementa fallback real.',
    name: 'credentialing-planner-contingency',
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
  arrival: 'Escolha o modelo preliminar de chegada.',
  identification: 'Escolha a identificação prevista.',
  printing: 'Indique se haverá impressão local de crachá ou etiqueta.',
  concurrency: 'Escolha a faixa genérica de simultaneidade de chegada.',
  contingency: 'Indique se haverá contingência offline ou manual.',
});

export function emptyChoices(): PlannerChoices {
  return {
    arrival: '',
    identification: '',
    printing: '',
    concurrency: '',
    contingency: '',
  };
}

export function nextStepFor(choices: PlannerChoices) {
  if (!choices.arrival) return NEXT_STEP.arrival;
  if (!choices.identification) return NEXT_STEP.identification;
  if (!choices.printing) return NEXT_STEP.printing;
  if (!choices.concurrency) return NEXT_STEP.concurrency;
  if (!choices.contingency) return NEXT_STEP.contingency;
  return null;
}

export function stopRulesFor(choices: PlannerChoices): StopRuleId[] {
  const rules: StopRuleId[] = [];
  if (choices.arrival === 'autoatendimento' || choices.arrival === 'combinacao') {
    rules.push('responsavel-operacional-ausente');
  }
  if (
    choices.concurrency === 'simultaneidade-moderada'
    || choices.concurrency === 'pico-concentrado'
    || choices.arrival === 'combinacao'
  ) {
    rules.push('capacidade-atendimento-nao-confirmada');
  }
  if (choices.printing === 'com-impressao') {
    rules.push('equipamento-impressora-nao-validado');
  }
  if (choices.arrival === 'autoatendimento' || choices.arrival === 'combinacao') {
    rules.push('acessibilidade-ponto-nao-revisada');
  }
  if (choices.contingency === 'sem-contingencia') {
    rules.push('contingencia-inexistente');
  }
  return rules;
}

export function statusForDimension(dimension: DimensionId, value: string): StatusId {
  if (value === 'decidir-depois') return 'later';
  if (dimension === 'arrival' && (value === 'autoatendimento' || value === 'combinacao')) return 'stop';
  if (dimension === 'printing' && value === 'com-impressao') return 'stop';
  if (dimension === 'concurrency' && (value === 'simultaneidade-moderada' || value === 'pico-concentrado')) return 'stop';
  if (dimension === 'contingency' && value === 'sem-contingencia') return 'stop';
  return 'planned';
}

export function overallStatusFor(choices: PlannerChoices, rules: StopRuleId[]): StatusId {
  if (rules.length > 0) return 'stop';
  if (
    choices.identification === 'decidir-depois'
    || choices.printing === 'decidir-depois'
    || choices.contingency === 'decidir-depois'
  ) {
    return 'later';
  }
  return 'planned';
}

function optionById<T extends { id: string }>(options: readonly T[], id: string) {
  return options.find((option) => option.id === id);
}

export function planCredentialing(choices: PlannerChoices) {
  if (nextStepFor(choices)) return null;

  const arrival = optionById(ARRIVAL_OPTIONS, choices.arrival);
  const identification = optionById(IDENTIFICATION_OPTIONS, choices.identification);
  const printing = optionById(PRINTING_OPTIONS, choices.printing);
  const concurrency = optionById(CONCURRENCY_OPTIONS, choices.concurrency);
  const contingency = optionById(CONTINGENCY_OPTIONS, choices.contingency);
  if (!arrival || !identification || !printing || !concurrency || !contingency) return null;

  const rules = stopRulesFor(choices);
  const overall = overallStatusFor(choices, rules);
  const overallMeta = STATUS[overall];

  const dimensions = [
    { id: 'arrival' as const, title: 'Modelo preliminar de chegada', option: arrival },
    { id: 'identification' as const, title: 'Identificação prevista', option: identification },
    { id: 'printing' as const, title: 'Impressão local', option: printing },
    { id: 'concurrency' as const, title: 'Faixa de simultaneidade de chegada', option: concurrency },
    { id: 'contingency' as const, title: 'Contingência offline ou manual', option: contingency },
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
      `Resumo atualizado: ${arrival.label}, ${identification.label}, ${printing.label}, ${concurrency.label}, ${contingency.label}. Estado geral: ${overallMeta.label}. ${stopRules.length} ${stopRules.length === 1 ? 'regra de parada' : 'regras de parada'}. Este resultado não faz check-in, não valida QR, não imprime, não cria credencial e não registra presença.`,
  };
}

export default function CredentialingPlanner() {
  const [choices, setChoices] = useState(emptyChoices);
  const [restarted, setRestarted] = useState(false);

  const plan = useMemo(() => planCredentialing(choices), [choices]);
  const nextStep = useMemo(() => nextStepFor(choices), [choices]);

  const announcement = useMemo(() => {
    if (
      !choices.arrival
      && !choices.identification
      && !choices.printing
      && !choices.concurrency
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
    <h2 id="planner-title">Comparar o modelo inicial de credenciamento</h2>
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
            Nada disso faz check-in, valida QR, imprime, cria credencial ou registra presença.
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
