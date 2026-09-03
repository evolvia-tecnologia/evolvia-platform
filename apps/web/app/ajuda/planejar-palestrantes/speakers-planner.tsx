'use client';

import { useMemo, useState } from 'react';
import styles from './planejar-palestrantes.module.css';

export type FormatId = 'palestra-individual' | 'painel' | 'oficina' | 'decidir-depois';
export type OriginId = 'convite' | 'curadoria' | 'submissao-futura' | 'decidir-depois';
export type ProfileId = 'com-perfil-publico' | 'sem-perfil-publico' | 'decidir-depois';
export type MaterialsId = 'com-materiais' | 'sem-materiais' | 'decidir-depois';
export type AuthorizationId = 'com-autorizacao' | 'sem-autorizacao' | 'decidir-depois';
export type AccessibilityId = 'com-acessibilidade' | 'sem-acessibilidade' | 'decidir-depois';
export type ConcurrencyId = 'uma-atividade' | 'poucas-paralelas' | 'varias-paralelas' | 'decidir-depois';
export type StatusId = 'planned' | 'later' | 'stop';
export type DimensionId =
  | 'format'
  | 'origin'
  | 'profile'
  | 'materials'
  | 'authorization'
  | 'accessibility'
  | 'concurrency';
export type StopRuleId =
  | 'responsavel-ausente'
  | 'conteudo-sem-curadoria'
  | 'painel-sem-mediacao'
  | 'oficina-sem-capacidade'
  | 'perfil-sem-autorizacao'
  | 'material-sem-acessibilidade';

export type PlannerChoices = {
  format: FormatId | '';
  origin: OriginId | '';
  profile: ProfileId | '';
  materials: MaterialsId | '';
  authorization: AuthorizationId | '';
  accessibility: AccessibilityId | '';
  concurrency: ConcurrencyId | '';
};

export const STATUS = Object.freeze({
  planned: Object.freeze({ id: 'planned', label: 'definido para planejar', icon: '●' }),
  later: Object.freeze({ id: 'later', label: 'decidir depois', icon: '○' }),
  stop: Object.freeze({ id: 'stop', label: 'pare e confirme', icon: '!' }),
});

export const FORMAT_OPTIONS = Object.freeze([
  {
    id: 'palestra-individual',
    label: 'Palestra individual',
    help: 'Uma pessoa apresenta. Decisão preliminar: esta página não cadastra palestrante, não cria sessão e não agenda horário.',
  },
  {
    id: 'painel',
    label: 'Painel',
    help: 'Várias pessoas participam de um painel. Sem mediação definida aqui. Esta página não convida, não cadastra e não cria mesa.',
  },
  {
    id: 'oficina',
    label: 'Oficina',
    help: 'Atividade prática em formato de oficina. Sem capacidade, vaga ou sala reais. Esta página não cria oficina nem reserva ambiente.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe o formato preliminar para uma decisão humana posterior. Não configura evento nem cria sessão.',
  },
] as const);

export const ORIGIN_OPTIONS = Object.freeze([
  {
    id: 'convite',
    label: 'Convite',
    help: 'O conteúdo viria de convite. Esta página não envia convite, não gera lista e não confirma aceite.',
  },
  {
    id: 'curadoria',
    label: 'Curadoria',
    help: 'O conteúdo passaria por curadoria. Esta página não cria comissão, não avalia trabalho e não publica seleção.',
  },
  {
    id: 'submissao-futura',
    label: 'Submissão futura',
    help: 'O conteúdo viria de uma submissão futura. Esta página não abre chamada, não recebe arquivo e não inicia fluxo científico.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a origem conceitual do conteúdo para depois. Não cria convite, curadoria nem submissão.',
  },
] as const);

export const PROFILE_OPTIONS = Object.freeze([
  {
    id: 'com-perfil-publico',
    label: 'Haverá perfil público',
    help: 'Há necessidade de perfil público da pessoa participante. Não peça nome, biografia, foto ou contato nesta página.',
  },
  {
    id: 'sem-perfil-publico',
    label: 'Sem perfil público previsto',
    help: 'Nenhum perfil público está previsto nesta leitura. Esta página não cria página de pessoa nem publica identidade.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a necessidade de perfil público para depois. Não peça nome, biografia, foto ou contato.',
  },
] as const);

export const MATERIALS_OPTIONS = Object.freeze([
  {
    id: 'com-materiais',
    label: 'Haverá materiais futuros',
    help: 'Há necessidade futura de materiais. Só uma decisão: esta página não pede arquivo, não faz upload e não envia conteúdo.',
  },
  {
    id: 'sem-materiais',
    label: 'Sem materiais previstos',
    help: 'Nenhum material está previsto nesta leitura. Esta página não cadastra item e não recebe arquivo.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a necessidade futura de materiais para depois. Não peça arquivo nem faça upload.',
  },
] as const);

export const AUTHORIZATION_OPTIONS = Object.freeze([
  {
    id: 'com-autorizacao',
    label: 'Haverá autorização de uso',
    help: 'Há necessidade futura de autorização de uso de imagem ou conteúdo. Só uma decisão: esta página não coleta aceite e não afirma direito de uso.',
  },
  {
    id: 'sem-autorizacao',
    label: 'Sem autorização prevista',
    help: 'Nenhuma autorização de uso está prevista nesta leitura. Esta página não gera termo e não afirma direito de uso.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a autorização de uso de imagem ou conteúdo para depois. Não coleta aceite e não cria termo.',
  },
] as const);

export const ACCESSIBILITY_OPTIONS = Object.freeze([
  {
    id: 'com-acessibilidade',
    label: 'Haverá decisão de acessibilidade',
    help: 'Há necessidade futura de acessibilidade. Só uma decisão: esta página não certifica acessibilidade e não substitui a escuta das pessoas.',
  },
  {
    id: 'sem-acessibilidade',
    label: 'Sem necessidade de acessibilidade indicada',
    help: 'Nenhuma necessidade de acessibilidade foi indicada nesta leitura. Isso não certifica acessibilidade e não dispensa revisão humana.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a necessidade de acessibilidade para depois. Esta página não certifica acessibilidade.',
  },
] as const);

export const CONCURRENCY_OPTIONS = Object.freeze([
  {
    id: 'uma-atividade',
    label: 'Uma atividade por vez',
    help: 'Faixa genérica: uma atividade por vez. Sem quantidade, horário ou sala reais. Esta página não cria agenda.',
  },
  {
    id: 'poucas-paralelas',
    label: 'Poucas em paralelo',
    help: 'Faixa genérica de poucas atividades em paralelo. Sem quantidade, horário ou sala reais. Esta página não cria grade.',
  },
  {
    id: 'varias-paralelas',
    label: 'Várias em paralelo',
    help: 'Faixa genérica de várias atividades em paralelo. Sem quantidade, horário ou sala reais. Esta página não resolve conflito.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a faixa genérica de simultaneidade para depois. Não informe quantidade, horário ou sala.',
  },
] as const);

export const STOP_RULES = Object.freeze([
  {
    id: 'responsavel-ausente',
    title: 'Responsável ausente',
    detail: 'O conteúdo viria de convite, mas esta página não nomeia quem convida. Pare e confirme a pessoa responsável antes de qualquer convite. Esta página não envia convite e não cadastra pessoa.',
  },
  {
    id: 'conteudo-sem-curadoria',
    title: 'Conteúdo sem curadoria',
    detail: 'A origem é uma submissão futura sem curadoria definida. Pare e confirme o critério humano antes de abrir chamada. Esta página não cria fluxo científico, não recebe arquivo e não avalia trabalho.',
  },
  {
    id: 'painel-sem-mediacao',
    title: 'Painel sem mediação',
    detail: 'O formato painel foi indicado sem mediação. Pare e confirme quem media antes de criar mesa. Esta página não convida, não cadastra e não atribui papel de mediação.',
  },
  {
    id: 'oficina-sem-capacidade',
    title: 'Oficina sem capacidade',
    detail: 'O formato oficina foi indicado sem capacidade. Pare e confirme vagas e ambiente com a pessoa responsável. Esta página não cria oficina, não reserva sala e não informa quantidade.',
  },
  {
    id: 'perfil-sem-autorizacao',
    title: 'Perfil sem autorização',
    detail: 'Há perfil público sem autorização de uso de imagem ou conteúdo. Pare e confirme a autorização humana antes de qualquer publicação. Esta página não cria perfil, não coleta aceite e não afirma direito de uso.',
  },
  {
    id: 'material-sem-acessibilidade',
    title: 'Material sem acessibilidade',
    detail: 'Há materiais futuros sem decisão de acessibilidade. Pare e confirme alternativas com a pessoa responsável. Esta página não certifica acessibilidade, não recebe arquivo e não envia conteúdo.',
  },
] as const);

const DIMENSIONS = Object.freeze([
  {
    id: 'format',
    legend: 'Formato preliminar de participação',
    hintId: 'format-hint',
    hint: 'Escolha palestra individual, painel ou oficina. Há opção explícita de decidir depois. Esta página não cadastra pessoa e não cria sessão.',
    name: 'speakers-planner-format',
    options: FORMAT_OPTIONS,
  },
  {
    id: 'origin',
    legend: 'Origem conceitual do conteúdo',
    hintId: 'origin-hint',
    hint: 'Indique se o conteúdo viria de convite, curadoria ou submissão futura. Há opção explícita de decidir depois. Esta página não envia convite e não abre chamada.',
    name: 'speakers-planner-origin',
    options: ORIGIN_OPTIONS,
  },
  {
    id: 'profile',
    legend: 'Perfil público da pessoa participante',
    hintId: 'profile-hint',
    hint: 'Indique se haverá perfil público, sem pedir nome, biografia, foto ou contato. Há opção explícita de decidir depois.',
    name: 'speakers-planner-profile',
    options: PROFILE_OPTIONS,
  },
  {
    id: 'materials',
    legend: 'Materiais futuros',
    hintId: 'materials-hint',
    hint: 'Indique a necessidade futura de materiais, apenas como decisão. Não peça arquivo e não faça upload. Há opção explícita de decidir depois.',
    name: 'speakers-planner-materials',
    options: MATERIALS_OPTIONS,
  },
  {
    id: 'authorization',
    legend: 'Autorização de uso de imagem ou conteúdo',
    hintId: 'authorization-hint',
    hint: 'Indique a necessidade futura de autorização de uso, apenas como decisão. Esta página não coleta aceite e não afirma direito de uso. Há opção explícita de decidir depois.',
    name: 'speakers-planner-authorization',
    options: AUTHORIZATION_OPTIONS,
  },
  {
    id: 'accessibility',
    legend: 'Acessibilidade',
    hintId: 'accessibility-hint',
    hint: 'Indique a necessidade futura de acessibilidade, apenas como decisão. Esta página não certifica acessibilidade. Há opção explícita de decidir depois.',
    name: 'speakers-planner-accessibility',
    options: ACCESSIBILITY_OPTIONS,
  },
  {
    id: 'concurrency',
    legend: 'Faixa genérica de simultaneidade',
    hintId: 'concurrency-hint',
    hint: 'Escolha uma faixa genérica, sem quantidade, horário ou sala reais. Há opção explícita de decidir depois. Esta página não cria agenda.',
    name: 'speakers-planner-concurrency',
    options: CONCURRENCY_OPTIONS,
  },
] as const);

const STATUS_CLASS = {
  planned: styles.statusPlanned,
  later: styles.statusLater,
  stop: styles.statusStop,
} as const;

const INITIAL_ANNOUNCEMENT =
  'Nenhuma escolha feita. O resumo aparece quando as sete dimensões estiverem definidas.';

const NEXT_STEP = Object.freeze({
  format: 'Escolha o formato preliminar de participação.',
  origin: 'Indique a origem conceitual do conteúdo.',
  profile: 'Indique se haverá perfil público da pessoa participante.',
  materials: 'Indique a necessidade futura de materiais.',
  authorization: 'Indique a necessidade futura de autorização de uso de imagem ou conteúdo.',
  accessibility: 'Indique a necessidade futura de acessibilidade.',
  concurrency: 'Escolha a faixa genérica de simultaneidade.',
});

export function emptyChoices(): PlannerChoices {
  return {
    format: '',
    origin: '',
    profile: '',
    materials: '',
    authorization: '',
    accessibility: '',
    concurrency: '',
  };
}

export function nextStepFor(choices: PlannerChoices) {
  if (!choices.format) return NEXT_STEP.format;
  if (!choices.origin) return NEXT_STEP.origin;
  if (!choices.profile) return NEXT_STEP.profile;
  if (!choices.materials) return NEXT_STEP.materials;
  if (!choices.authorization) return NEXT_STEP.authorization;
  if (!choices.accessibility) return NEXT_STEP.accessibility;
  if (!choices.concurrency) return NEXT_STEP.concurrency;
  return null;
}

export function stopRulesFor(choices: PlannerChoices): StopRuleId[] {
  const rules: StopRuleId[] = [];
  if (choices.origin === 'convite') {
    rules.push('responsavel-ausente');
  }
  if (choices.origin === 'submissao-futura') {
    rules.push('conteudo-sem-curadoria');
  }
  if (choices.format === 'painel') {
    rules.push('painel-sem-mediacao');
  }
  if (choices.format === 'oficina') {
    rules.push('oficina-sem-capacidade');
  }
  if (choices.profile === 'com-perfil-publico' && choices.authorization !== 'com-autorizacao') {
    rules.push('perfil-sem-autorizacao');
  }
  if (choices.materials === 'com-materiais' && choices.accessibility !== 'com-acessibilidade') {
    rules.push('material-sem-acessibilidade');
  }
  return rules;
}

export function statusForDimension(dimension: DimensionId, value: string): StatusId {
  if (value === 'decidir-depois') return 'later';
  if (dimension === 'format' && (value === 'painel' || value === 'oficina')) return 'stop';
  if (dimension === 'origin' && (value === 'convite' || value === 'submissao-futura')) return 'stop';
  return 'planned';
}

export function overallStatusFor(choices: PlannerChoices, rules: StopRuleId[]): StatusId {
  if (rules.length > 0) return 'stop';
  if (
    choices.format === 'decidir-depois'
    || choices.origin === 'decidir-depois'
    || choices.profile === 'decidir-depois'
    || choices.materials === 'decidir-depois'
    || choices.authorization === 'decidir-depois'
    || choices.accessibility === 'decidir-depois'
    || choices.concurrency === 'decidir-depois'
  ) {
    return 'later';
  }
  return 'planned';
}

function optionById<T extends { id: string }>(options: readonly T[], id: string) {
  return options.find((option) => option.id === id);
}

export function planSpeakers(choices: PlannerChoices) {
  if (nextStepFor(choices)) return null;

  const format = optionById(FORMAT_OPTIONS, choices.format);
  const origin = optionById(ORIGIN_OPTIONS, choices.origin);
  const profile = optionById(PROFILE_OPTIONS, choices.profile);
  const materials = optionById(MATERIALS_OPTIONS, choices.materials);
  const authorization = optionById(AUTHORIZATION_OPTIONS, choices.authorization);
  const accessibility = optionById(ACCESSIBILITY_OPTIONS, choices.accessibility);
  const concurrency = optionById(CONCURRENCY_OPTIONS, choices.concurrency);
  if (!format || !origin || !profile || !materials || !authorization || !accessibility || !concurrency) {
    return null;
  }

  const rules = stopRulesFor(choices);
  const overall = overallStatusFor(choices, rules);
  const overallMeta = STATUS[overall];

  const dimensions = [
    { id: 'format' as const, title: 'Formato preliminar de participação', option: format },
    { id: 'origin' as const, title: 'Origem conceitual do conteúdo', option: origin },
    { id: 'profile' as const, title: 'Perfil público da pessoa participante', option: profile },
    { id: 'materials' as const, title: 'Materiais futuros', option: materials },
    { id: 'authorization' as const, title: 'Autorização de uso de imagem ou conteúdo', option: authorization },
    { id: 'accessibility' as const, title: 'Acessibilidade', option: accessibility },
    { id: 'concurrency' as const, title: 'Faixa genérica de simultaneidade', option: concurrency },
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
      `Resumo atualizado: ${format.label}, ${origin.label}, ${profile.label}, ${materials.label}, ${authorization.label}, ${accessibility.label}, ${concurrency.label}. Estado geral: ${overallMeta.label}. ${stopRules.length} ${stopRules.length === 1 ? 'regra de parada' : 'regras de parada'}. Este resultado não convida, não cadastra, não agenda, não publica e não envia conteúdo.`,
  };
}

export default function SpeakersPlanner() {
  const [choices, setChoices] = useState(emptyChoices);
  const [restarted, setRestarted] = useState(false);

  const plan = useMemo(() => planSpeakers(choices), [choices]);
  const nextStep = useMemo(() => nextStepFor(choices), [choices]);

  const announcement = useMemo(() => {
    if (
      !choices.format
      && !choices.origin
      && !choices.profile
      && !choices.materials
      && !choices.authorization
      && !choices.accessibility
      && !choices.concurrency
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
    <h2 id="planner-title">Comparar decisões iniciais sobre palestrantes</h2>
    <p className={styles.plannerLead}>
      As sete dimensões usam opções fechadas, com decidir depois quando aplicável.
      Não há campo livre. O resultado só aparece depois das sete escolhas e
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
            Nada disso convida, cadastra, agenda, publica ou envia conteúdo.
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
            pessoa responsável antes de configurar o evento. Isso não afirma
            confirmação, disponibilidade, direito de uso ou acessibilidade certificada.
          </p>}
        </> : <p className={styles.resultNote}>
          {nextStep
            ? `Combinação incompleta. Próximo passo: ${nextStep}`
            : 'Escolha as sete dimensões para ver o resumo determinístico.'}
        </p>}
      </div>
    </div>
  </section>;
}
