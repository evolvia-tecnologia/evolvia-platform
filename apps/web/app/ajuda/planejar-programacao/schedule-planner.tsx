'use client';

import { useMemo, useState } from 'react';
import styles from './planejar-programacao.module.css';

export type StructureId = 'atividade-unica' | 'trilha-sequencial' | 'programacao-paralela';
export type DurationId = 'um-periodo' | 'um-dia' | 'multiplos-dias';
export type RoomsId = 'unico' | 'multiplos' | 'decidir-depois';
export type SpeakersId = 'sem-convidadas' | 'com-convidadas' | 'decidir-depois';
export type CapacityId = 'sem-capacidade' | 'com-capacidade' | 'decidir-depois';
export type StatusId = 'planned' | 'later' | 'stop';
export type DimensionId = 'structure' | 'duration' | 'rooms' | 'speakers' | 'capacity';
export type StopRuleId =
  | 'conflito-horarios-nao-tratado'
  | 'ambiente-responsavel-ausente'
  | 'capacidade-sem-criterio'
  | 'atividade-paralela-sem-orientacao'
  | 'acessibilidade-percurso-nao-revisada';

export type PlannerChoices = {
  structure: StructureId | '';
  duration: DurationId | '';
  rooms: RoomsId | '';
  speakers: SpeakersId | '';
  capacity: CapacityId | '';
};

export const STATUS = Object.freeze({
  planned: Object.freeze({ id: 'planned', label: 'definido para planejar', icon: '●' }),
  later: Object.freeze({ id: 'later', label: 'decidir depois', icon: '○' }),
  stop: Object.freeze({ id: 'stop', label: 'pare e confirme', icon: '!' }),
});

export const STRUCTURE_OPTIONS = Object.freeze([
  {
    id: 'atividade-unica',
    label: 'Atividade única',
    help: 'Uma atividade isolada nesta leitura preliminar. Não cria atividade, título, horário nem reserva.',
  },
  {
    id: 'trilha-sequencial',
    label: 'Trilha sequencial',
    help: 'Atividades em sequência, sem datas nem horários. Esta página não cria trilha, conflito tratado nem programação real.',
  },
  {
    id: 'programacao-paralela',
    label: 'Programação paralela',
    help: 'Mais de uma atividade no mesmo intervalo genérico. Sem orientação de simultaneidade: não cria trilhas paralelas nem reserva.',
  },
] as const);

export const DURATION_OPTIONS = Object.freeze([
  {
    id: 'um-periodo',
    label: 'Um período',
    help: 'Um período genérico, sem data, hora ou fuso. Não abre calendário e não cria reserva.',
  },
  {
    id: 'um-dia',
    label: 'Um dia',
    help: 'Um dia genérico, sem escolher data real. Não há seletor de data, hora ou calendário nesta página.',
  },
  {
    id: 'multiplos-dias',
    label: 'Múltiplos dias',
    help: 'Mais de um dia, ainda sem datas reais. Esta página não cria calendário, intervalo publicado nem ausência automática de conflitos.',
  },
] as const);

export const ROOM_OPTIONS = Object.freeze([
  {
    id: 'unico',
    label: 'Ambiente único',
    help: 'Um ambiente genérico basta nesta leitura. Não cria sala, local, mapa nem reserva.',
  },
  {
    id: 'multiplos',
    label: 'Múltiplos ambientes',
    help: 'Mais de um ambiente poderá ser necessário. Não cria salas, não atribui local e não confirma disponibilidade.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a necessidade de salas ou ambientes para uma decisão humana posterior. Não cria local.',
  },
] as const);

export const SPEAKER_OPTIONS = Object.freeze([
  {
    id: 'sem-convidadas',
    label: 'Sem pessoas convidadas neste planejamento',
    help: 'Nenhuma pessoa convidada ou palestrante nesta leitura. Não pede identidade, contato nem biografia.',
  },
  {
    id: 'com-convidadas',
    label: 'Haverá pessoas convidadas ou palestrantes',
    help: 'Há dependência de pessoas convidadas. Isto é só um sinal de planejamento: não pede nome, não cria palestrante e não envia convite.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a dependência de pessoas convidadas para depois. Não pede identidade e não cria palestrante.',
  },
] as const);

export const CAPACITY_OPTIONS = Object.freeze([
  {
    id: 'sem-capacidade',
    label: 'Sem inscrição ou capacidade específica',
    help: 'As atividades não pedem inscrição ou capacidade específica nesta leitura. Não cria vaga, inscrição nem pagamento.',
  },
  {
    id: 'com-capacidade',
    label: 'Atividades poderão exigir inscrição ou capacidade específica',
    help: 'Poderá haver inscrição ou capacidade específica. Sem critério, vaga ou preço aqui: não configura inscrição de atividade nem pagamento.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a inscrição ou a capacidade específica para depois. Não configura vaga, preço nem pagamento.',
  },
] as const);

export const STOP_RULES = Object.freeze([
  {
    id: 'conflito-horarios-nao-tratado',
    title: 'Conflito de horários não tratado',
    detail: 'A estrutura ou a duração preliminar admite sobreposição ou sequência sem horários coletados. Esta página não trata conflito, não cria agenda e não afirma ausência automática de conflitos.',
  },
  {
    id: 'ambiente-responsavel-ausente',
    title: 'Ambiente ou responsável ausente',
    detail: 'Há indício de múltiplos ambientes ou de pessoas convidadas, sem local criado e sem identidade. Esta página não cria sala, não nomeia responsável e não envia convite.',
  },
  {
    id: 'capacidade-sem-criterio',
    title: 'Capacidade sem critério',
    detail: 'Inscrição ou capacidade específica foi indicada sem critério, vaga ou preço. Defina o critério com a pessoa responsável antes de configurar inscrição. Esta página não cria vaga nem pagamento.',
  },
  {
    id: 'atividade-paralela-sem-orientacao',
    title: 'Atividade paralela sem orientação',
    detail: 'Programação paralela foi escolhida sem orientação de simultaneidade, percurso ou prioridade. Esta página não cria trilhas paralelas, não reserva ambiente e não autoriza programação real.',
  },
  {
    id: 'acessibilidade-percurso-nao-revisada',
    title: 'Acessibilidade do percurso não revisada',
    detail: 'Há deslocamento entre atividades, ambientes ou dias e o percurso não foi revisado aqui. Esta leitura não certifica acessibilidade, não substitui a escuta das pessoas e não cria rota real.',
  },
] as const);

const DIMENSIONS = Object.freeze([
  {
    id: 'structure',
    legend: 'Estrutura preliminar',
    hintId: 'structure-hint',
    hint: 'Escolha uma estrutura genérica: atividade única, trilha sequencial ou programação paralela. Esta página não cria atividade, trilha nem reserva.',
    name: 'schedule-planner-structure',
    options: STRUCTURE_OPTIONS,
  },
  {
    id: 'duration',
    legend: 'Duração preliminar',
    hintId: 'duration-hint',
    hint: 'Escolha um período, um dia ou múltiplos dias, sem informar data, hora ou fuso. Não há calendário nesta página.',
    name: 'schedule-planner-duration',
    options: DURATION_OPTIONS,
  },
  {
    id: 'rooms',
    legend: 'Salas ou ambientes',
    hintId: 'rooms-hint',
    hint: 'Indique uma necessidade genérica de ambiente: único, múltiplos ou decidir depois. Esta página não cria local nem reserva.',
    name: 'schedule-planner-rooms',
    options: ROOM_OPTIONS,
  },
  {
    id: 'speakers',
    legend: 'Pessoas convidadas',
    hintId: 'speakers-hint',
    hint: 'Indique se haverá pessoas convidadas ou palestrantes apenas como dependência de planejamento. Não peça identidade, contato ou biografia.',
    name: 'schedule-planner-speakers',
    options: SPEAKER_OPTIONS,
  },
  {
    id: 'capacity',
    legend: 'Inscrição ou capacidade',
    hintId: 'capacity-hint',
    hint: 'Indique se as atividades poderão exigir inscrição ou capacidade específica, sem configurar vaga, preço ou pagamento. Há opção explícita de decidir depois.',
    name: 'schedule-planner-capacity',
    options: CAPACITY_OPTIONS,
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
  structure: 'Escolha a estrutura preliminar da programação.',
  duration: 'Escolha a duração preliminar, sem informar datas.',
  rooms: 'Indique a necessidade genérica de salas ou ambientes.',
  speakers: 'Indique se haverá pessoas convidadas ou palestrantes.',
  capacity: 'Indique se as atividades poderão exigir inscrição ou capacidade específica.',
});

export function emptyChoices(): PlannerChoices {
  return { structure: '', duration: '', rooms: '', speakers: '', capacity: '' };
}

export function nextStepFor(choices: PlannerChoices) {
  if (!choices.structure) return NEXT_STEP.structure;
  if (!choices.duration) return NEXT_STEP.duration;
  if (!choices.rooms) return NEXT_STEP.rooms;
  if (!choices.speakers) return NEXT_STEP.speakers;
  if (!choices.capacity) return NEXT_STEP.capacity;
  return null;
}

export function stopRulesFor(choices: PlannerChoices): StopRuleId[] {
  const rules: StopRuleId[] = [];
  if (
    choices.structure === 'trilha-sequencial'
    || choices.structure === 'programacao-paralela'
    || choices.duration === 'multiplos-dias'
  ) {
    rules.push('conflito-horarios-nao-tratado');
  }
  if (choices.rooms === 'multiplos' || choices.speakers === 'com-convidadas') {
    rules.push('ambiente-responsavel-ausente');
  }
  if (choices.capacity === 'com-capacidade') {
    rules.push('capacidade-sem-criterio');
  }
  if (choices.structure === 'programacao-paralela') {
    rules.push('atividade-paralela-sem-orientacao');
  }
  if (
    choices.structure === 'trilha-sequencial'
    || choices.structure === 'programacao-paralela'
    || choices.rooms === 'multiplos'
    || choices.duration === 'multiplos-dias'
  ) {
    rules.push('acessibilidade-percurso-nao-revisada');
  }
  return rules;
}

export function statusForDimension(dimension: DimensionId, value: string): StatusId {
  if (value === 'decidir-depois') return 'later';
  if (dimension === 'structure' && (value === 'trilha-sequencial' || value === 'programacao-paralela')) return 'stop';
  if (dimension === 'duration' && value === 'multiplos-dias') return 'stop';
  if (dimension === 'rooms' && value === 'multiplos') return 'stop';
  if (dimension === 'speakers' && value === 'com-convidadas') return 'stop';
  if (dimension === 'capacity' && value === 'com-capacidade') return 'stop';
  return 'planned';
}

export function overallStatusFor(choices: PlannerChoices, rules: StopRuleId[]): StatusId {
  if (rules.length > 0) return 'stop';
  if (
    choices.rooms === 'decidir-depois'
    || choices.speakers === 'decidir-depois'
    || choices.capacity === 'decidir-depois'
  ) {
    return 'later';
  }
  return 'planned';
}

function optionById<T extends { id: string }>(options: readonly T[], id: string) {
  return options.find((option) => option.id === id);
}

export function planSchedule(choices: PlannerChoices) {
  if (nextStepFor(choices)) return null;

  const structure = optionById(STRUCTURE_OPTIONS, choices.structure);
  const duration = optionById(DURATION_OPTIONS, choices.duration);
  const rooms = optionById(ROOM_OPTIONS, choices.rooms);
  const speakers = optionById(SPEAKER_OPTIONS, choices.speakers);
  const capacity = optionById(CAPACITY_OPTIONS, choices.capacity);
  if (!structure || !duration || !rooms || !speakers || !capacity) return null;

  const rules = stopRulesFor(choices);
  const overall = overallStatusFor(choices, rules);
  const overallMeta = STATUS[overall];

  const dimensions = [
    { id: 'structure' as const, title: 'Estrutura preliminar', option: structure },
    { id: 'duration' as const, title: 'Duração preliminar', option: duration },
    { id: 'rooms' as const, title: 'Salas ou ambientes', option: rooms },
    { id: 'speakers' as const, title: 'Pessoas convidadas', option: speakers },
    { id: 'capacity' as const, title: 'Inscrição ou capacidade', option: capacity },
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
      `Resumo atualizado: ${structure.label}, ${duration.label}, ${rooms.label}, ${speakers.label}, ${capacity.label}. Estado geral: ${overallMeta.label}. ${stopRules.length} ${stopRules.length === 1 ? 'regra de parada' : 'regras de parada'}. Este resultado não cria agenda, atividade, sala, palestrante, inscrição, reserva ou publicação.`,
  };
}

export default function SchedulePlanner() {
  const [choices, setChoices] = useState(emptyChoices);
  const [restarted, setRestarted] = useState(false);

  const plan = useMemo(() => planSchedule(choices), [choices]);
  const nextStep = useMemo(() => nextStepFor(choices), [choices]);

  const announcement = useMemo(() => {
    if (!choices.structure && !choices.duration && !choices.rooms && !choices.speakers && !choices.capacity) {
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
    <h2 id="planner-title">Comparar uma programação inicial</h2>
    <p className={styles.plannerLead}>
      As cinco dimensões usam opções fechadas. Salas, pessoas convidadas e
      capacidade têm decidir depois. Não há campo livre, data, hora, local
      nomeado nem upload. O resultado só aparece depois das cinco escolhas e
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
            Nada disso cria agenda, atividade, sala, palestrante, inscrição, reserva ou publicação.
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
            pessoa responsável antes de configurar o evento. Isto não autoriza
            programação real.
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
