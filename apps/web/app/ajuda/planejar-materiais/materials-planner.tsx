'use client';

import { useMemo, useState } from 'react';
import styles from './planejar-materiais.module.css';

export type NeedId = 'nenhum-material' | 'item-unico' | 'kit';
export type MomentId = 'chegada' | 'atividade-especifica' | 'saida';
export type CategoryId = 'sem-diferenciacao' | 'com-diferenciacao' | 'decidir-depois';
export type VolumeId = 'reduzido' | 'moderado' | 'alto';
export type RecordId = 'sem-comprovante' | 'com-comprovante' | 'decidir-depois';
export type StatusId = 'planned' | 'later' | 'stop';
export type DimensionId = 'need' | 'moment' | 'category' | 'volume' | 'record';
export type StopRuleId =
  | 'responsavel-ausente'
  | 'composicao-kit-indefinida'
  | 'volume-sem-capacidade'
  | 'categoria-sem-regra'
  | 'item-sem-contingencia'
  | 'registro-sem-finalidade';

export type PlannerChoices = {
  need: NeedId | '';
  moment: MomentId | '';
  category: CategoryId | '';
  volume: VolumeId | '';
  record: RecordId | '';
};

export const STATUS = Object.freeze({
  planned: Object.freeze({ id: 'planned', label: 'definido para planejar', icon: '●' }),
  later: Object.freeze({ id: 'later', label: 'decidir depois', icon: '○' }),
  stop: Object.freeze({ id: 'stop', label: 'pare e confirme', icon: '!' }),
});

export const NEED_OPTIONS = Object.freeze([
  {
    id: 'nenhum-material',
    label: 'Nenhum material',
    help: 'Não há necessidade preliminar de material ou kit. Esta página não cadastra item e não movimenta estoque.',
  },
  {
    id: 'item-unico',
    label: 'Item único',
    help: 'Há um item único previsto, sem informar qual. Esta página não cria item, lote ou estoque e não pede quantidade.',
  },
  {
    id: 'kit',
    label: 'Kit com múltiplos itens',
    help: 'Há um kit previsto, sem definir a composição. Esta página não cria kit, não lista itens e não monta estoque.',
  },
] as const);

export const MOMENT_OPTIONS = Object.freeze([
  {
    id: 'chegada',
    label: 'Chegada',
    help: 'Entrega conceitual na chegada. Sem data, horário ou local real. Esta página não registra entrega.',
  },
  {
    id: 'atividade-especifica',
    label: 'Atividade específica',
    help: 'Entrega conceitual em uma atividade. Sem nomear a atividade, horário ou responsável. Esta página não registra entrega.',
  },
  {
    id: 'saida',
    label: 'Saída',
    help: 'Entrega conceitual na saída. Sem data, horário ou local real. Esta página não registra entrega.',
  },
] as const);

export const CATEGORY_OPTIONS = Object.freeze([
  {
    id: 'sem-diferenciacao',
    label: 'Sem diferenciação por categoria',
    help: 'O mesmo plano vale para todas as pessoas participantes. Esta página não cria categoria nem regra.',
  },
  {
    id: 'com-diferenciacao',
    label: 'Haverá diferenciação por categoria',
    help: 'Há diferença prevista por categoria de participante, sem criar a categoria nem a regra. Não peça o nome da categoria.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a diferenciação por categoria para depois. Esta página não cria categoria, não classifica participante e não aplica regra.',
  },
] as const);

export const VOLUME_OPTIONS = Object.freeze([
  {
    id: 'reduzido',
    label: 'Volume reduzido',
    help: 'Faixa genérica. Não informe quantidade, lote ou capacidade física.',
  },
  {
    id: 'moderado',
    label: 'Volume moderado',
    help: 'Faixa genérica. Não confirma capacidade operacional e não pede quantidade.',
  },
  {
    id: 'alto',
    label: 'Volume alto',
    help: 'Faixa genérica. Não estima estoque, equipe nem capacidade física.',
  },
] as const);

export const RECORD_OPTIONS = Object.freeze([
  {
    id: 'sem-comprovante',
    label: 'Sem comprovante ou registro previsto',
    help: 'Não há necessidade preliminar de comprovante ou registro de entrega. Esta página não coleta assinatura nem identidade.',
  },
  {
    id: 'com-comprovante',
    label: 'Haverá comprovante ou registro como decisão futura',
    help: 'Há necessidade preliminar de registro de entrega, só como decisão futura. Esta página não coleta assinatura, identidade ou comprovante real.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe o comprovante ou registro para depois. Esta página não coleta assinatura nem cria registro de entrega.',
  },
] as const);

export const STOP_RULES = Object.freeze([
  {
    id: 'responsavel-ausente',
    title: 'Responsável ausente',
    detail: 'Pare e confirme quem responde pela entrega de materiais. Kit ou entrega em atividade específica sem responsável confirmado não autoriza operação. Esta página não nomeia pessoa e não atribui equipe.',
  },
  {
    id: 'composicao-kit-indefinida',
    title: 'Composição do kit indefinida',
    detail: 'O kit foi indicado sem definir os itens. Esta página não cria kit, não cadastra item e não monta estoque.',
  },
  {
    id: 'volume-sem-capacidade',
    title: 'Volume sem capacidade',
    detail: 'A faixa de volume ainda não confirma capacidade operacional. Defina isso com a pessoa responsável antes de qualquer movimentação. Esta página não estima quantidade, estoque nem equipe.',
  },
  {
    id: 'categoria-sem-regra',
    title: 'Categoria sem regra',
    detail: 'A diferenciação por categoria foi indicada sem criar a regra. Esta página não cria categoria, não classifica participante e não aplica regra real.',
  },
  {
    id: 'item-sem-contingencia',
    title: 'Item sem contingência',
    detail: 'Há item ou kit sem caminho previsto se faltar ou falhar. No kit ou na entrega na saída, confirme a contingência com a pessoa responsável. Esta página não cria lote, reserva nem reposição.',
  },
  {
    id: 'registro-sem-finalidade',
    title: 'Registro sem finalidade',
    detail: 'O comprovante ou registro de entrega foi indicado sem finalidade definida. Esta página não coleta assinatura, identidade ou comprovante real e não afirma rastreabilidade.',
  },
] as const);

const DIMENSIONS = Object.freeze([
  {
    id: 'need',
    legend: 'Necessidade preliminar',
    hintId: 'need-hint',
    hint: 'Escolha nenhum material, item único ou kit com múltiplos itens. Esta página não cadastra item, não cria kit e não movimenta estoque.',
    name: 'materials-planner-need',
    options: NEED_OPTIONS,
  },
  {
    id: 'moment',
    legend: 'Momento conceitual de entrega',
    hintId: 'moment-hint',
    hint: 'Escolha chegada, atividade específica ou saída. Sem data, horário ou local real. Esta página não registra entrega.',
    name: 'materials-planner-moment',
    options: MOMENT_OPTIONS,
  },
  {
    id: 'category',
    legend: 'Diferenciação por categoria de participante',
    hintId: 'category-hint',
    hint: 'Indique se haverá diferenciação por categoria, sem criar categorias ou regras. Há opção explícita de decidir depois. Não peça o nome da categoria.',
    name: 'materials-planner-category',
    options: CATEGORY_OPTIONS,
  },
  {
    id: 'volume',
    legend: 'Faixa genérica de volume',
    hintId: 'volume-hint',
    hint: 'Escolha uma faixa genérica. Não solicite nem informe quantidade, lote, estoque ou capacidade física.',
    name: 'materials-planner-volume',
    options: VOLUME_OPTIONS,
  },
  {
    id: 'record',
    legend: 'Comprovante ou registro de entrega',
    hintId: 'record-hint',
    hint: 'Indique a necessidade de comprovante ou registro apenas como decisão futura. Há opção explícita de decidir depois. Esta página não coleta assinatura nem identidade.',
    name: 'materials-planner-record',
    options: RECORD_OPTIONS,
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
  need: 'Escolha a necessidade preliminar de materiais.',
  moment: 'Escolha o momento conceitual de entrega.',
  category: 'Indique se haverá diferenciação por categoria de participante.',
  volume: 'Escolha a faixa genérica de volume.',
  record: 'Indique se haverá comprovante ou registro de entrega.',
});

export function emptyChoices(): PlannerChoices {
  return {
    need: '',
    moment: '',
    category: '',
    volume: '',
    record: '',
  };
}

export function nextStepFor(choices: PlannerChoices) {
  if (!choices.need) return NEXT_STEP.need;
  if (!choices.moment) return NEXT_STEP.moment;
  if (!choices.category) return NEXT_STEP.category;
  if (!choices.volume) return NEXT_STEP.volume;
  if (!choices.record) return NEXT_STEP.record;
  return null;
}

export function stopRulesFor(choices: PlannerChoices): StopRuleId[] {
  const rules: StopRuleId[] = [];
  if (choices.need === 'kit' || choices.moment === 'atividade-especifica') {
    rules.push('responsavel-ausente');
  }
  if (choices.need === 'kit') {
    rules.push('composicao-kit-indefinida');
  }
  if (choices.volume === 'moderado' || choices.volume === 'alto') {
    rules.push('volume-sem-capacidade');
  }
  if (choices.category === 'com-diferenciacao') {
    rules.push('categoria-sem-regra');
  }
  if (choices.need === 'kit' || choices.moment === 'saida') {
    rules.push('item-sem-contingencia');
  }
  if (choices.record === 'com-comprovante') {
    rules.push('registro-sem-finalidade');
  }
  return rules;
}

export function statusForDimension(dimension: DimensionId, value: string): StatusId {
  if (value === 'decidir-depois') return 'later';
  if (dimension === 'need' && value === 'kit') return 'stop';
  if (dimension === 'moment' && (value === 'atividade-especifica' || value === 'saida')) return 'stop';
  if (dimension === 'volume' && (value === 'moderado' || value === 'alto')) return 'stop';
  if (dimension === 'category' && value === 'com-diferenciacao') return 'stop';
  if (dimension === 'record' && value === 'com-comprovante') return 'stop';
  return 'planned';
}

export function overallStatusFor(choices: PlannerChoices, rules: StopRuleId[]): StatusId {
  if (rules.length > 0) return 'stop';
  if (choices.category === 'decidir-depois' || choices.record === 'decidir-depois') {
    return 'later';
  }
  return 'planned';
}

function optionById<T extends { id: string }>(options: readonly T[], id: string) {
  return options.find((option) => option.id === id);
}

export function planMaterials(choices: PlannerChoices) {
  if (nextStepFor(choices)) return null;

  const need = optionById(NEED_OPTIONS, choices.need);
  const moment = optionById(MOMENT_OPTIONS, choices.moment);
  const category = optionById(CATEGORY_OPTIONS, choices.category);
  const volume = optionById(VOLUME_OPTIONS, choices.volume);
  const record = optionById(RECORD_OPTIONS, choices.record);
  if (!need || !moment || !category || !volume || !record) return null;

  const rules = stopRulesFor(choices);
  const overall = overallStatusFor(choices, rules);
  const overallMeta = STATUS[overall];

  const dimensions = [
    { id: 'need' as const, title: 'Necessidade preliminar', option: need },
    { id: 'moment' as const, title: 'Momento conceitual de entrega', option: moment },
    { id: 'category' as const, title: 'Diferenciação por categoria de participante', option: category },
    { id: 'volume' as const, title: 'Faixa genérica de volume', option: volume },
    { id: 'record' as const, title: 'Comprovante ou registro de entrega', option: record },
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
      `Resumo atualizado: ${need.label}, ${moment.label}, ${category.label}, ${volume.label}, ${record.label}. Estado geral: ${overallMeta.label}. ${stopRules.length} ${stopRules.length === 1 ? 'regra de parada' : 'regras de parada'}. Este resultado não cria item, estoque, lote, categoria, comprovante ou registro de entrega.`,
  };
}

export default function MaterialsPlanner() {
  const [choices, setChoices] = useState(emptyChoices);
  const [restarted, setRestarted] = useState(false);

  const plan = useMemo(() => planMaterials(choices), [choices]);
  const nextStep = useMemo(() => nextStepFor(choices), [choices]);

  const announcement = useMemo(() => {
    if (
      !choices.need
      && !choices.moment
      && !choices.category
      && !choices.volume
      && !choices.record
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
    <h2 id="planner-title">Comparar o plano preliminar de materiais e kits</h2>
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
            Nada disso cria item, estoque, lote, categoria, comprovante ou registro de entrega.
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
            movimenta ou autoriza estoque ou entrega.
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
