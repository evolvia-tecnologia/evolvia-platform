'use client';

import { useMemo, useState } from 'react';
import styles from './planejar-participacao.module.css';

export type AccessId = 'aberto' | 'aprovacao-humana' | 'somente-convite' | 'decidir-depois';
export type CompanionId = 'individual' | 'com-acompanhante' | 'decidir-depois';
export type CategoriesId = 'sem-categorias' | 'com-categorias' | 'decidir-depois';
export type ProofId = 'sem-comprovante' | 'com-comprovante' | 'decidir-depois';
export type StatusId = 'planned' | 'later' | 'stop';
export type DimensionId = 'access' | 'companion' | 'categories' | 'proof';
export type StopRuleId =
  | 'responsavel-ausente'
  | 'criterio-aprovacao-indefinido'
  | 'acompanhante-sem-regra'
  | 'categoria-sem-finalidade'
  | 'comprovante-sem-necessidade';

export type PlannerChoices = {
  access: AccessId | '';
  companion: CompanionId | '';
  categories: CategoriesId | '';
  proof: ProofId | '';
};

export const STATUS = Object.freeze({
  planned: Object.freeze({ id: 'planned', label: 'definido para planejar', icon: '●' }),
  later: Object.freeze({ id: 'later', label: 'decidir depois', icon: '○' }),
  stop: Object.freeze({ id: 'stop', label: 'pare e confirme', icon: '!' }),
});

export const ACCESS_OPTIONS = Object.freeze([
  {
    id: 'aberto',
    label: 'Aberto',
    help: 'Acesso aberto: a pessoa se inscreve sem filtro prévio nesta leitura. Não cria inscrição nem publicação.',
  },
  {
    id: 'aprovacao-humana',
    label: 'Sujeito a aprovação humana',
    help: 'A participação ficaria sujeita a uma decisão humana posterior. Esta página não cria aprovação, fila nem critério.',
  },
  {
    id: 'somente-convite',
    label: 'Somente por convite',
    help: 'Somente quem for convidado participaria. Esta página não envia convite, não gera lista e não atribui permissão.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe o modelo de acesso para uma decisão humana posterior. Não configura evento.',
  },
] as const);

export const COMPANION_OPTIONS = Object.freeze([
  {
    id: 'individual',
    label: 'Participação individual',
    help: 'Participação prevista como individual. Decisão preliminar, sem criar inscrição.',
  },
  {
    id: 'com-acompanhante',
    label: 'Poderá admitir acompanhante',
    help: 'Poderá admitir acompanhante. Decisão preliminar: não cria acompanhante, credencial nem regra própria.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a composição da participação para depois. Não cria inscrição nem acompanhante.',
  },
] as const);

export const CATEGORY_OPTIONS = Object.freeze([
  {
    id: 'sem-categorias',
    label: 'Sem categorias distintas',
    help: 'Sem categorias distintas nesta leitura. Não cria lote, preço nem regra real.',
  },
  {
    id: 'com-categorias',
    label: 'Haverá categorias distintas',
    help: 'Haverá categorias distintas. Não peça nomes, preços ou regras aqui; só o sinal de que elas existem.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a existência de categorias para depois. Não cria categoria, lote nem preço.',
  },
] as const);

export const PROOF_OPTIONS = Object.freeze([
  {
    id: 'sem-comprovante',
    label: 'Nenhum comprovante previsto',
    help: 'Nenhum comprovante previsto nesta leitura. Não pede documento nem dado pessoal.',
  },
  {
    id: 'com-comprovante',
    label: 'Algum comprovante poderá ser necessário',
    help: 'Algum comprovante poderá ser necessário. Finalidade, necessidade e tratamento devem ser definidos antes de qualquer coleta.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a necessidade de comprovante para depois. Não colete documento nesta página.',
  },
] as const);

export const STOP_RULES = Object.freeze([
  {
    id: 'responsavel-ausente',
    title: 'Responsável ausente',
    detail: 'Pare e confirme quem responde pela decisão de acesso. Esta página não nomeia responsável, não atribui permissão e não cria aprovação.',
  },
  {
    id: 'criterio-aprovacao-indefinido',
    title: 'Critério de aprovação indefinido',
    detail: 'O modelo sujeito a aprovação humana ainda não tem critério. Defina o critério com a pessoa responsável antes de configurar inscrição ou aprovação. Esta página não cria regra de aprovação.',
  },
  {
    id: 'acompanhante-sem-regra',
    title: 'Acompanhante sem regra própria',
    detail: 'Admitir acompanhante é só uma decisão preliminar. Sem regra própria, o acompanhante não está definido. Esta página não cria acompanhante, inscrição nem credencial.',
  },
  {
    id: 'categoria-sem-finalidade',
    title: 'Categoria sem finalidade',
    detail: 'Categorias distintas foram indicadas sem finalidade. Defina para que servem antes de criar nomes, preços ou regras reais. Esta página não cria categoria.',
  },
  {
    id: 'comprovante-sem-necessidade',
    title: 'Comprovante sem necessidade justificada',
    detail: 'Algum comprovante poderá ser necessário, mas finalidade, necessidade e tratamento ainda não foram definidos. Não colete comprovante nesta página. Isso não é orientação jurídica conclusiva.',
  },
] as const);

const DIMENSIONS = Object.freeze([
  {
    id: 'access',
    legend: 'Modelo de acesso',
    hintId: 'access-hint',
    hint: 'Escolha um modelo genérico: aberto, sujeito a aprovação humana ou somente por convite. Há opção explícita de decidir depois. Esta página não cria inscrição, convite nem aprovação.',
    name: 'participation-planner-access',
    options: ACCESS_OPTIONS,
  },
  {
    id: 'companion',
    legend: 'Composição da participação',
    hintId: 'companion-hint',
    hint: 'Indique se a participação será individual ou se poderá admitir acompanhante, apenas como decisão preliminar. Há opção explícita de decidir depois.',
    name: 'participation-planner-companion',
    options: COMPANION_OPTIONS,
  },
  {
    id: 'categories',
    legend: 'Categorias de participação',
    hintId: 'categories-hint',
    hint: 'Indique se haverá categorias distintas, sem criar nomes, preços ou regras reais. Há opção explícita de decidir depois.',
    name: 'participation-planner-categories',
    options: CATEGORY_OPTIONS,
  },
  {
    id: 'proof',
    legend: 'Comprovante',
    hintId: 'proof-hint',
    hint: 'Indique se algum comprovante poderá ser necessário. Finalidade, necessidade e tratamento deverão ser definidos antes da coleta. Há opção explícita de decidir depois.',
    name: 'participation-planner-proof',
    options: PROOF_OPTIONS,
  },
] as const);

const STATUS_CLASS = {
  planned: styles.statusPlanned,
  later: styles.statusLater,
  stop: styles.statusStop,
} as const;

const INITIAL_ANNOUNCEMENT =
  'Nenhuma escolha feita. O resumo aparece quando as quatro dimensões estiverem definidas.';

const NEXT_STEP = Object.freeze({
  access: 'Escolha o modelo de acesso.',
  companion: 'Indique se a participação será individual ou poderá admitir acompanhante.',
  categories: 'Indique se haverá categorias distintas de participação.',
  proof: 'Indique se algum comprovante poderá ser necessário.',
});

export function emptyChoices(): PlannerChoices {
  return { access: '', companion: '', categories: '', proof: '' };
}

export function nextStepFor(choices: PlannerChoices) {
  if (!choices.access) return NEXT_STEP.access;
  if (!choices.companion) return NEXT_STEP.companion;
  if (!choices.categories) return NEXT_STEP.categories;
  if (!choices.proof) return NEXT_STEP.proof;
  return null;
}

export function stopRulesFor(choices: PlannerChoices): StopRuleId[] {
  const rules: StopRuleId[] = [];
  if (choices.access === 'aprovacao-humana' || choices.access === 'somente-convite') {
    rules.push('responsavel-ausente');
  }
  if (choices.access === 'aprovacao-humana') {
    rules.push('criterio-aprovacao-indefinido');
  }
  if (choices.companion === 'com-acompanhante') {
    rules.push('acompanhante-sem-regra');
  }
  if (choices.categories === 'com-categorias') {
    rules.push('categoria-sem-finalidade');
  }
  if (choices.proof === 'com-comprovante') {
    rules.push('comprovante-sem-necessidade');
  }
  return rules;
}

export function statusForDimension(dimension: DimensionId, value: string): StatusId {
  if (value === 'decidir-depois') return 'later';
  if (dimension === 'access' && (value === 'aprovacao-humana' || value === 'somente-convite')) return 'stop';
  if (dimension === 'companion' && value === 'com-acompanhante') return 'stop';
  if (dimension === 'categories' && value === 'com-categorias') return 'stop';
  if (dimension === 'proof' && value === 'com-comprovante') return 'stop';
  return 'planned';
}

export function overallStatusFor(choices: PlannerChoices, rules: StopRuleId[]): StatusId {
  if (rules.length > 0) return 'stop';
  if (
    choices.access === 'decidir-depois'
    || choices.companion === 'decidir-depois'
    || choices.categories === 'decidir-depois'
    || choices.proof === 'decidir-depois'
  ) {
    return 'later';
  }
  return 'planned';
}

function optionById<T extends { id: string }>(options: readonly T[], id: string) {
  return options.find((option) => option.id === id);
}

export function planParticipation(choices: PlannerChoices) {
  if (nextStepFor(choices)) return null;

  const access = optionById(ACCESS_OPTIONS, choices.access);
  const companion = optionById(COMPANION_OPTIONS, choices.companion);
  const categories = optionById(CATEGORY_OPTIONS, choices.categories);
  const proof = optionById(PROOF_OPTIONS, choices.proof);
  if (!access || !companion || !categories || !proof) return null;

  const rules = stopRulesFor(choices);
  const overall = overallStatusFor(choices, rules);
  const overallMeta = STATUS[overall];

  const dimensions = [
    { id: 'access' as const, title: 'Modelo de acesso', option: access },
    { id: 'companion' as const, title: 'Composição da participação', option: companion },
    { id: 'categories' as const, title: 'Categorias de participação', option: categories },
    { id: 'proof' as const, title: 'Comprovante', option: proof },
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
      `Resumo atualizado: ${access.label}, ${companion.label}, ${categories.label}, ${proof.label}. Estado geral: ${overallMeta.label}. ${stopRules.length} ${stopRules.length === 1 ? 'regra de parada' : 'regras de parada'}. Este resultado não cria inscrição, convite, aprovação, categoria, acompanhante ou publicação.`,
  };
}

export default function ParticipationPlanner() {
  const [choices, setChoices] = useState(emptyChoices);
  const [restarted, setRestarted] = useState(false);

  const plan = useMemo(() => planParticipation(choices), [choices]);
  const nextStep = useMemo(() => nextStepFor(choices), [choices]);

  const announcement = useMemo(() => {
    if (!choices.access && !choices.companion && !choices.categories && !choices.proof) {
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
    <h2 id="planner-title">Comparar modelos iniciais de participação</h2>
    <p className={styles.plannerLead}>
      As quatro dimensões usam opções fechadas, com decidir depois quando aplicável.
      Não há campo livre. O resultado só aparece depois das quatro escolhas e
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
            Nada disso cria inscrição, convite, aprovação, categoria, acompanhante ou publicação.
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
            pessoa responsável antes de configurar o evento.
          </p>}
        </> : <p className={styles.resultNote}>
          {nextStep
            ? `Combinação incompleta. Próximo passo: ${nextStep}`
            : 'Escolha as quatro dimensões para ver o resumo determinístico.'}
        </p>}
      </div>
    </div>
  </section>;
}
