'use client';

import { useMemo, useState } from 'react';
import styles from './planejar-expositores.module.css';

export type ModelId = 'estande-fisico' | 'presenca-digital' | 'patrocinio-sem-estande' | 'decidir-depois';
export type OriginId = 'convite' | 'venda-futura' | 'curadoria' | 'decidir-depois';
export type ProfileId = 'perfil-previsto' | 'sem-perfil-publico' | 'decidir-depois';
export type InfrastructureId = 'infraestrutura-prevista' | 'sem-infraestrutura' | 'decidir-depois';
export type TeamId = 'credenciais-previstas' | 'sem-credenciais-equipe' | 'decidir-depois';
export type LeadsId = 'leads-previstos' | 'sem-coleta-de-leads' | 'decidir-depois';
export type ConcurrencyId = 'simultaneidade-espacada' | 'simultaneidade-moderada' | 'pico';
export type StatusId = 'planned' | 'later' | 'stop';
export type DimensionId =
  | 'model'
  | 'origin'
  | 'publicProfile'
  | 'infrastructure'
  | 'teamCredentials'
  | 'leads'
  | 'concurrency';
export type StopRuleId =
  | 'responsavel-ausente'
  | 'espaco-sem-capacidade'
  | 'infraestrutura-sem-validacao'
  | 'perfil-sem-autorizacao'
  | 'equipe-sem-regra-de-credenciamento'
  | 'leads-sem-finalidade-consentimento';

export type PlannerChoices = {
  model: ModelId | '';
  origin: OriginId | '';
  publicProfile: ProfileId | '';
  infrastructure: InfrastructureId | '';
  teamCredentials: TeamId | '';
  leads: LeadsId | '';
  concurrency: ConcurrencyId | '';
};

export const STATUS = Object.freeze({
  planned: Object.freeze({ id: 'planned', label: 'definido para planejar', icon: '●' }),
  later: Object.freeze({ id: 'later', label: 'decidir depois', icon: '○' }),
  stop: Object.freeze({ id: 'stop', label: 'pare e confirme', icon: '!' }),
});

export const MODEL_OPTIONS = Object.freeze([
  {
    id: 'estande-fisico',
    label: 'Estande físico',
    help: 'Presença preliminar em espaço físico. Esta página não reserva espaço, não vende estande e não pede metragem nem mapa.',
  },
  {
    id: 'presenca-digital',
    label: 'Presença digital',
    help: 'Presença preliminar só em canal digital. Esta página não cadastra expositor, não publica perfil e não pede marca ou logo.',
  },
  {
    id: 'patrocinio-sem-estande',
    label: 'Patrocínio sem estande',
    help: 'Apoio preliminar sem ocupação de estande. Esta página não cria plano comercial, não contrata patrocínio e não reserva espaço.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe o modelo preliminar de presença para uma decisão humana posterior. Nada aqui vende, reserva ou cadastra.',
  },
] as const);

export const ORIGIN_OPTIONS = Object.freeze([
  {
    id: 'convite',
    label: 'Convite',
    help: 'A origem conceitual prevista é um convite futuro. Esta página não envia convite, não pede contato e não cadastra empresa.',
  },
  {
    id: 'venda-futura',
    label: 'Venda futura',
    help: 'A origem conceitual prevista é uma venda ainda não feita. Esta página não vende estande, não cobra valor e não reserva espaço.',
  },
  {
    id: 'curadoria',
    label: 'Curadoria',
    help: 'A origem conceitual prevista é uma curadoria posterior. Esta página não seleciona empresa, não pede marca e não cadastra expositor.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a origem conceitual para depois. Esta página não convida, não vende e não seleciona um expositor real.',
  },
] as const);

export const PROFILE_OPTIONS = Object.freeze([
  {
    id: 'perfil-previsto',
    label: 'Haverá perfil público futuro',
    help: 'Há indicação preliminar de perfil público. Esta página não pede empresa, marca, logo ou contato e não autoriza publicação.',
  },
  {
    id: 'sem-perfil-publico',
    label: 'Sem perfil público previsto',
    help: 'Não há perfil público previsto neste planejamento. Esta página não cadastra expositor e não publica página.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a necessidade futura de perfil público para depois. Não pede empresa, marca, logo ou contato.',
  },
] as const);

export const INFRASTRUCTURE_OPTIONS = Object.freeze([
  {
    id: 'infraestrutura-prevista',
    label: 'Infraestrutura prevista',
    help: 'Há necessidade conceitual de infraestrutura. Esta página não configura energia, rede, montagem nem valida equipamento.',
  },
  {
    id: 'sem-infraestrutura',
    label: 'Sem infraestrutura prevista',
    help: 'Não há necessidade conceitual de infraestrutura neste planejamento. Nada aqui reserva serviço ou valida instalação.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a necessidade conceitual de infraestrutura para depois. Esta página não configura nem valida infraestrutura.',
  },
] as const);

export const TEAM_OPTIONS = Object.freeze([
  {
    id: 'credenciais-previstas',
    label: 'Credenciais de equipe previstas',
    help: 'Há necessidade conceitual de credenciais de equipe. Esta página não emite credencial, não pede nome e não cadastra pessoa.',
  },
  {
    id: 'sem-credenciais-equipe',
    label: 'Sem credenciais de equipe previstas',
    help: 'Não há credenciais de equipe previstas neste planejamento. Esta página não credencia e não registra presença.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a necessidade conceitual de credenciais de equipe para depois. Não pede nome, documento ou contato.',
  },
] as const);

export const LEADS_OPTIONS = Object.freeze([
  {
    id: 'leads-previstos',
    label: 'Coleta de leads prevista',
    help: 'Há necessidade conceitual de coleta de leads. Esta página não coleta lead, não usa scanner e não pede finalidade nem consentimento.',
  },
  {
    id: 'sem-coleta-de-leads',
    label: 'Sem coleta de leads prevista',
    help: 'Não há coleta de leads prevista neste planejamento. Esta página não captura contato e não usa scanner.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a necessidade conceitual de coleta de leads para depois. Esta página não coleta lead e não pede dado pessoal.',
  },
] as const);

export const CONCURRENCY_OPTIONS = Object.freeze([
  {
    id: 'simultaneidade-espacada',
    label: 'Simultaneidade espaçada',
    help: 'Faixa genérica de circulação baixa e espaçada. Não informe quantidade, metragem, valor ou mapa.',
  },
  {
    id: 'simultaneidade-moderada',
    label: 'Simultaneidade moderada',
    help: 'Faixa genérica. Não informe quantidade de expositores, metragem, valor ou mapa.',
  },
  {
    id: 'pico',
    label: 'Pico',
    help: 'Faixa genérica de simultaneidade concentrada. Não estime lotação, fila real, metragem nem valor.',
  },
] as const);

export const STOP_RULES = Object.freeze([
  {
    id: 'responsavel-ausente',
    title: 'Responsável ausente',
    detail: 'Pare e confirme quem responde pelo estande físico. Sem responsável confirmado, o modelo não está pronto. Esta página não nomeia pessoa, não cadastra expositor e não reserva espaço.',
  },
  {
    id: 'espaco-sem-capacidade',
    title: 'Espaço sem capacidade',
    detail: 'O estande físico ou a faixa de simultaneidade ainda não define capacidade. Confirme isso com a pessoa responsável antes de qualquer configuração. Esta página não pede metragem, não desenha mapa e não reserva espaço.',
  },
  {
    id: 'infraestrutura-sem-validacao',
    title: 'Infraestrutura sem validação',
    detail: 'Há necessidade conceitual de infraestrutura sem validação. Esta página não configura energia, rede ou montagem e não afirma disponibilidade operacional.',
  },
  {
    id: 'perfil-sem-autorizacao',
    title: 'Perfil sem autorização',
    detail: 'Há indicação de perfil público futuro sem autorização. Esta página não pede empresa, marca, logo ou contato e não autoriza publicação.',
  },
  {
    id: 'equipe-sem-regra-de-credenciamento',
    title: 'Equipe sem regra de credenciamento',
    detail: 'Há necessidade conceitual de credenciais de equipe sem regra definida. Esta página não emite credencial, não pede nome e não cadastra pessoa.',
  },
  {
    id: 'leads-sem-finalidade-consentimento',
    title: 'Leads sem finalidade ou consentimento',
    detail: 'Há necessidade conceitual de coleta de leads sem finalidade ou consentimento. Esta página não coleta lead, não usa scanner e não captura contato.',
  },
] as const);

const DIMENSIONS = Object.freeze([
  {
    id: 'model',
    legend: 'Modelo preliminar de presença',
    hintId: 'model-hint',
    hint: 'Escolha estande físico, presença digital, patrocínio sem estande ou decidir depois. Esta página não vende estande, não reserva espaço e não cadastra expositor.',
    name: 'exhibitors-planner-model',
    options: MODEL_OPTIONS,
  },
  {
    id: 'origin',
    legend: 'Origem conceitual',
    hintId: 'origin-hint',
    hint: 'Escolha convite, venda futura, curadoria ou decidir depois. Esta página não convida, não vende e não seleciona empresa.',
    name: 'exhibitors-planner-origin',
    options: ORIGIN_OPTIONS,
  },
  {
    id: 'publicProfile',
    legend: 'Necessidade futura de perfil público',
    hintId: 'publicProfile-hint',
    hint: 'Indique se haverá perfil público futuro, sem pedir empresa, marca, logo ou contato. Há opção explícita de decidir depois.',
    name: 'exhibitors-planner-public-profile',
    options: PROFILE_OPTIONS,
  },
  {
    id: 'infrastructure',
    legend: 'Necessidade conceitual de infraestrutura',
    hintId: 'infrastructure-hint',
    hint: 'Indique se haverá necessidade conceitual de infraestrutura, sem configurá-la. Há opção explícita de decidir depois.',
    name: 'exhibitors-planner-infrastructure',
    options: INFRASTRUCTURE_OPTIONS,
  },
  {
    id: 'teamCredentials',
    legend: 'Necessidade conceitual de credenciais de equipe',
    hintId: 'teamCredentials-hint',
    hint: 'Indique se haverá credenciais de equipe, sem configurá-las. Não pede nome, documento ou contato. Há opção explícita de decidir depois.',
    name: 'exhibitors-planner-team',
    options: TEAM_OPTIONS,
  },
  {
    id: 'leads',
    legend: 'Necessidade conceitual de coleta de leads',
    hintId: 'leads-hint',
    hint: 'Indique se haverá coleta de leads, sem configurá-la. Esta página não coleta lead e não usa scanner. Há opção explícita de decidir depois.',
    name: 'exhibitors-planner-leads',
    options: LEADS_OPTIONS,
  },
  {
    id: 'concurrency',
    legend: 'Faixa genérica de simultaneidade',
    hintId: 'concurrency-hint',
    hint: 'Escolha uma faixa genérica. Não solicite nem informe quantidade, metragem, valor ou mapa.',
    name: 'exhibitors-planner-concurrency',
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
  model: 'Escolha o modelo preliminar de presença.',
  origin: 'Escolha a origem conceitual.',
  publicProfile: 'Indique a necessidade futura de perfil público.',
  infrastructure: 'Indique a necessidade conceitual de infraestrutura.',
  teamCredentials: 'Indique a necessidade conceitual de credenciais de equipe.',
  leads: 'Indique a necessidade conceitual de coleta de leads.',
  concurrency: 'Escolha a faixa genérica de simultaneidade.',
});

export function emptyChoices(): PlannerChoices {
  return {
    model: '',
    origin: '',
    publicProfile: '',
    infrastructure: '',
    teamCredentials: '',
    leads: '',
    concurrency: '',
  };
}

export function nextStepFor(choices: PlannerChoices) {
  if (!choices.model) return NEXT_STEP.model;
  if (!choices.origin) return NEXT_STEP.origin;
  if (!choices.publicProfile) return NEXT_STEP.publicProfile;
  if (!choices.infrastructure) return NEXT_STEP.infrastructure;
  if (!choices.teamCredentials) return NEXT_STEP.teamCredentials;
  if (!choices.leads) return NEXT_STEP.leads;
  if (!choices.concurrency) return NEXT_STEP.concurrency;
  return null;
}

export function stopRulesFor(choices: PlannerChoices): StopRuleId[] {
  const rules: StopRuleId[] = [];
  if (choices.model === 'estande-fisico') {
    rules.push('responsavel-ausente');
  }
  if (
    choices.model === 'estande-fisico'
    || choices.concurrency === 'simultaneidade-moderada'
    || choices.concurrency === 'pico'
  ) {
    rules.push('espaco-sem-capacidade');
  }
  if (choices.infrastructure === 'infraestrutura-prevista') {
    rules.push('infraestrutura-sem-validacao');
  }
  if (choices.publicProfile === 'perfil-previsto') {
    rules.push('perfil-sem-autorizacao');
  }
  if (choices.teamCredentials === 'credenciais-previstas') {
    rules.push('equipe-sem-regra-de-credenciamento');
  }
  if (choices.leads === 'leads-previstos') {
    rules.push('leads-sem-finalidade-consentimento');
  }
  return rules;
}

export function statusForDimension(dimension: DimensionId, value: string): StatusId {
  if (value === 'decidir-depois') return 'later';
  if (dimension === 'model' && value === 'estande-fisico') return 'stop';
  if (dimension === 'publicProfile' && value === 'perfil-previsto') return 'stop';
  if (dimension === 'infrastructure' && value === 'infraestrutura-prevista') return 'stop';
  if (dimension === 'teamCredentials' && value === 'credenciais-previstas') return 'stop';
  if (dimension === 'leads' && value === 'leads-previstos') return 'stop';
  if (dimension === 'concurrency' && (value === 'simultaneidade-moderada' || value === 'pico')) return 'stop';
  return 'planned';
}

export function overallStatusFor(choices: PlannerChoices, rules: StopRuleId[]): StatusId {
  if (rules.length > 0) return 'stop';
  if (
    choices.model === 'decidir-depois'
    || choices.origin === 'decidir-depois'
    || choices.publicProfile === 'decidir-depois'
    || choices.infrastructure === 'decidir-depois'
    || choices.teamCredentials === 'decidir-depois'
    || choices.leads === 'decidir-depois'
  ) {
    return 'later';
  }
  return 'planned';
}

function optionById<T extends { id: string }>(options: readonly T[], id: string) {
  return options.find((option) => option.id === id);
}

export function planExhibitors(choices: PlannerChoices) {
  if (nextStepFor(choices)) return null;

  const model = optionById(MODEL_OPTIONS, choices.model);
  const origin = optionById(ORIGIN_OPTIONS, choices.origin);
  const publicProfile = optionById(PROFILE_OPTIONS, choices.publicProfile);
  const infrastructure = optionById(INFRASTRUCTURE_OPTIONS, choices.infrastructure);
  const teamCredentials = optionById(TEAM_OPTIONS, choices.teamCredentials);
  const leads = optionById(LEADS_OPTIONS, choices.leads);
  const concurrency = optionById(CONCURRENCY_OPTIONS, choices.concurrency);
  if (!model || !origin || !publicProfile || !infrastructure || !teamCredentials || !leads || !concurrency) {
    return null;
  }

  const rules = stopRulesFor(choices);
  const overall = overallStatusFor(choices, rules);
  const overallMeta = STATUS[overall];

  const dimensions = [
    { id: 'model' as const, title: 'Modelo preliminar de presença', option: model },
    { id: 'origin' as const, title: 'Origem conceitual', option: origin },
    { id: 'publicProfile' as const, title: 'Necessidade futura de perfil público', option: publicProfile },
    { id: 'infrastructure' as const, title: 'Necessidade conceitual de infraestrutura', option: infrastructure },
    { id: 'teamCredentials' as const, title: 'Necessidade conceitual de credenciais de equipe', option: teamCredentials },
    { id: 'leads' as const, title: 'Necessidade conceitual de coleta de leads', option: leads },
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
      `Resumo atualizado: ${model.label}, ${origin.label}, ${publicProfile.label}, ${infrastructure.label}, ${teamCredentials.label}, ${leads.label}, ${concurrency.label}. Estado geral: ${overallMeta.label}. ${stopRules.length} ${stopRules.length === 1 ? 'regra de parada' : 'regras de parada'}. Este resultado não vende estande, não cadastra expositor, não reserva espaço e não coleta lead.`,
  };
}

export default function ExhibitorsPlanner() {
  const [choices, setChoices] = useState(emptyChoices);
  const [restarted, setRestarted] = useState(false);

  const plan = useMemo(() => planExhibitors(choices), [choices]);
  const nextStep = useMemo(() => nextStepFor(choices), [choices]);

  const announcement = useMemo(() => {
    if (
      !choices.model
      && !choices.origin
      && !choices.publicProfile
      && !choices.infrastructure
      && !choices.teamCredentials
      && !choices.leads
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
    <h2 id="planner-title">Comparar o modelo inicial de expositores</h2>
    <p className={styles.plannerLead}>
      As sete dimensões usam opções fechadas, com decidir depois quando aplicável.
      Não há campo livre. O resultado só aparece depois das sete escolhas e
      permanece só na memória desta página. Esta página não altera o catálogo dos
      19 tipos nem cria regra paralela de venda, reserva ou cadastro.
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
            Nada disso vende estande, cadastra expositor, reserva espaço ou coleta lead.
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
            pessoa responsável antes de configurar a feira. Nenhuma combinação
            vende, reserva ou coleta.
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
