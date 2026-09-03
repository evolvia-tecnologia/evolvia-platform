'use client';

import { useMemo, useState } from 'react';
import styles from './planejar-atendimento.module.css';

export type MomentId = 'antes' | 'durante' | 'depois';
export type ChannelId = 'pagina-publica' | 'email-corporativo' | 'balcao-presencial' | 'decidir-depois';
export type TopicId = 'inscricao' | 'pagamento' | 'acesso' | 'programacao' | 'acessibilidade' | 'certificado';
export type DemandId = 'reduzida' | 'moderada' | 'alta';
export type EscalationId = 'sem-escalonamento' | 'escalonamento-previsto' | 'decidir-depois';
export type AccessibleId = 'alternativa-prevista' | 'sem-alternativa' | 'decidir-depois';
export type StatusId = 'planned' | 'later' | 'stop';
export type DimensionId = 'moments' | 'channel' | 'topics' | 'demand' | 'escalation' | 'accessible';
export type StopRuleId =
  | 'responsavel-ausente'
  | 'canal-nao-confirmado'
  | 'demanda-sem-capacidade'
  | 'orientacao-critica-inexistente'
  | 'alternativa-acessivel-ausente'
  | 'escalonamento-indefinido';

export type PlannerChoices = {
  moments: readonly MomentId[];
  channel: ChannelId | '';
  topics: readonly TopicId[];
  demand: DemandId | '';
  escalation: EscalationId | '';
  accessible: AccessibleId | '';
};

export const STATUS = Object.freeze({
  planned: Object.freeze({ id: 'planned', label: 'definido para planejar', icon: '●' }),
  later: Object.freeze({ id: 'later', label: 'decidir depois', icon: '○' }),
  stop: Object.freeze({ id: 'stop', label: 'pare e confirme', icon: '!' }),
});

export const MOMENT_OPTIONS = Object.freeze([
  {
    id: 'antes',
    label: 'Antes do evento',
    help: 'Suporte preliminar previsto antes do encontro. Esta página não envia lembrete, não abre chamado e não coleta dúvida.',
  },
  {
    id: 'durante',
    label: 'Durante o evento',
    help: 'Suporte preliminar previsto enquanto o encontro acontece. Isso não monta plantão, não define equipe e não atende em tempo real.',
  },
  {
    id: 'depois',
    label: 'Depois do evento',
    help: 'Suporte preliminar previsto após o encontro. Esta página não emite certificado, não envia mensagem e não registra pedido.',
  },
] as const);

export const CHANNEL_OPTIONS = Object.freeze([
  {
    id: 'pagina-publica',
    label: 'Página pública',
    help: 'Canal só conceitual para orientação visível. Não peça endereço, não publique conteúdo e não afirme que a página existirá.',
  },
  {
    id: 'email-corporativo',
    label: 'E-mail corporativo',
    help: 'Canal só conceitual. Não peça endereço de e-mail, não envie mensagem e não confirme caixa postal nesta página.',
  },
  {
    id: 'balcao-presencial',
    label: 'Balcão presencial',
    help: 'Canal só conceitual de atendimento no local. Não peça endereço, não monte fila e não atribua pessoa.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe o canal conceitual para uma decisão humana posterior. Esta página não cria canal e não pede contato.',
  },
] as const);

export const TOPIC_OPTIONS = Object.freeze([
  {
    id: 'inscricao',
    label: 'Inscrição',
    help: 'Grupo esperado de dúvidas sobre inscrição. Não registre a dúvida e não abra chamado.',
  },
  {
    id: 'pagamento',
    label: 'Pagamento',
    help: 'Grupo esperado de dúvidas sobre pagamento. Não colete valor, comprovante ou dado financeiro.',
  },
  {
    id: 'acesso',
    label: 'Acesso',
    help: 'Grupo esperado de dúvidas sobre acesso. Não gere credencial, link ou instrução operacional nesta página.',
  },
  {
    id: 'programacao',
    label: 'Programação',
    help: 'Grupo esperado de dúvidas sobre programação. Não publique agenda e não altere horário aqui.',
  },
  {
    id: 'acessibilidade',
    label: 'Acessibilidade',
    help: 'Grupo esperado de dúvidas sobre acessibilidade. Não certifique WCAG e não registre necessidade individual.',
  },
  {
    id: 'certificado',
    label: 'Certificado',
    help: 'Grupo esperado de dúvidas sobre certificado. Não emita, não prometa prazo e não envie arquivo.',
  },
] as const);

export const DEMAND_OPTIONS = Object.freeze([
  {
    id: 'reduzida',
    label: 'Demanda reduzida',
    help: 'Faixa genérica. Não informe quantidade, não estime fila e não prometa tempo de resposta.',
  },
  {
    id: 'moderada',
    label: 'Demanda moderada',
    help: 'Faixa genérica. Não informe quantidade, não confirma capacidade e não define equipe.',
  },
  {
    id: 'alta',
    label: 'Demanda alta',
    help: 'Faixa genérica. Não estime volume, fila real, plantão nem prazo de atendimento.',
  },
] as const);

export const ESCALATION_OPTIONS = Object.freeze([
  {
    id: 'sem-escalonamento',
    label: 'Sem escalonamento humano previsto',
    help: 'Não há necessidade preliminar de encaminhar para uma pessoa. Esta página não cria fila e não atribui responsável.',
  },
  {
    id: 'escalonamento-previsto',
    label: 'Haverá necessidade de escalonamento humano',
    help: 'Há necessidade preliminar de encaminhamento humano. Isso não nomeia pessoa, não abre chamado e não inicia atendimento.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a necessidade de escalonamento humano para depois. Esta página não define plantão nem responsável.',
  },
] as const);

export const ACCESSIBLE_OPTIONS = Object.freeze([
  {
    id: 'alternativa-prevista',
    label: 'Alternativa acessível prevista',
    help: 'Há um caminho acessível previsto só como necessidade. Esta página não certifica acessibilidade e não registra ajuste individual.',
  },
  {
    id: 'sem-alternativa',
    label: 'Sem alternativa acessível prevista',
    help: 'Nenhum caminho acessível foi previsto. Isso não autoriza atendimento e não afirma adequação.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a alternativa acessível para depois. Esta página não certifica WCAG e não coleta necessidade individual.',
  },
] as const);

export const STOP_RULES = Object.freeze([
  {
    id: 'responsavel-ausente',
    title: 'Responsável ausente',
    detail: 'Pare e confirme quem responde pelo suporte durante o evento ou no balcão presencial. Esta página não nomeia pessoa, não atribui equipe e não inicia atendimento.',
  },
  {
    id: 'canal-nao-confirmado',
    title: 'Canal não confirmado',
    detail: 'O e-mail corporativo foi indicado sem confirmar existência, endereço ou responsabilidade da caixa. Esta página não pede contato, não envia mensagem e não afirma disponibilidade de canal.',
  },
  {
    id: 'demanda-sem-capacidade',
    title: 'Demanda sem capacidade',
    detail: 'A faixa de demanda ainda não confirma capacidade de atendimento. Defina isso com a pessoa responsável antes de qualquer operação. Esta página não estima fila, equipe nem prazo.',
  },
  {
    id: 'orientacao-critica-inexistente',
    title: 'Orientação crítica inexistente',
    detail: 'Há grupo de dúvida crítica sem orientação correspondente: pagamento, acesso, acessibilidade ou certificado. Esta página não redige resposta, não abre chamado e não promete resolução.',
  },
  {
    id: 'alternativa-acessivel-ausente',
    title: 'Alternativa acessível ausente',
    detail: 'Nenhum caminho acessível foi previsto. Sem alternativa, o plano de suporte não está pronto. Isto não certifica acessibilidade e não registra necessidade individual.',
  },
  {
    id: 'escalonamento-indefinido',
    title: 'Escalonamento indefinido',
    detail: 'A necessidade de escalonamento humano ficou para decidir depois. Sem essa definição, o plano não descreve o que acontece quando a orientação inicial não basta. Esta página não abre chamado e não atribui responsável.',
  },
] as const);

export const CRITICAL_TOPICS = Object.freeze([
  'pagamento',
  'acesso',
  'acessibilidade',
  'certificado',
] as const satisfies readonly TopicId[]);

const CHECKBOX_GROUPS = Object.freeze([
  {
    id: 'moments' as const,
    legend: 'Momentos preliminares de suporte',
    hintId: 'moments-hint',
    hint: 'Marque um ou mais momentos: antes, durante e depois do evento. Esta página não agenda plantão e não envia mensagem.',
    name: 'support-planner-moments',
    options: MOMENT_OPTIONS,
  },
  {
    id: 'topics' as const,
    legend: 'Grupos de dúvidas esperadas',
    hintId: 'topics-hint',
    hint: 'Marque os grupos esperados sem registrar a mensagem. Não peça texto livre, assunto ou necessidade individual.',
    name: 'support-planner-topics',
    options: TOPIC_OPTIONS,
  },
] as const);

const RADIO_GROUPS = Object.freeze([
  {
    id: 'channel' as const,
    legend: 'Canal conceitual',
    hintId: 'channel-hint',
    hint: 'Escolha página pública, e-mail corporativo, balcão presencial ou decidir depois. Não peça endereço, telefone ou contato.',
    name: 'support-planner-channel',
    options: CHANNEL_OPTIONS,
  },
  {
    id: 'demand' as const,
    legend: 'Faixa genérica de demanda',
    hintId: 'demand-hint',
    hint: 'Escolha uma faixa genérica. Não solicite nem informe quantidade, capacidade real ou prazo de atendimento.',
    name: 'support-planner-demand',
    options: DEMAND_OPTIONS,
  },
  {
    id: 'escalation' as const,
    legend: 'Escalonamento humano',
    hintId: 'escalation-hint',
    hint: 'Indique se haverá necessidade de escalonamento humano. Há opção explícita de decidir depois. Esta página não abre chamado.',
    name: 'support-planner-escalation',
    options: ESCALATION_OPTIONS,
  },
  {
    id: 'accessible' as const,
    legend: 'Alternativa acessível',
    hintId: 'accessible-hint',
    hint: 'Indique se haverá um caminho acessível. Há opção explícita de decidir depois. Esta página não certifica acessibilidade.',
    name: 'support-planner-accessible',
    options: ACCESSIBLE_OPTIONS,
  },
] as const);

const STATUS_CLASS = {
  planned: styles.statusPlanned,
  later: styles.statusLater,
  stop: styles.statusStop,
} as const;

const INITIAL_ANNOUNCEMENT =
  'Nenhuma escolha feita. O resumo aparece quando as seis dimensões estiverem definidas.';

const NEXT_STEP = Object.freeze({
  moments: 'Escolha ao menos um momento preliminar de suporte.',
  channel: 'Escolha um canal apenas conceitual.',
  topics: 'Indique ao menos um grupo de dúvidas esperadas.',
  demand: 'Escolha a faixa genérica de demanda.',
  escalation: 'Indique a necessidade de escalonamento humano.',
  accessible: 'Indique se haverá alternativa acessível.',
});

function has<T extends string>(values: readonly T[], id: T) {
  return values.includes(id);
}

function toggleOrdered<T extends string>(current: readonly T[], id: T, catalog: readonly { id: T }[]) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return catalog.map((item) => item.id).filter((itemId) => next.has(itemId));
}

function optionById<T extends { id: string }>(options: readonly T[], id: string) {
  return options.find((option) => option.id === id);
}

function labelsFor<T extends { id: string; label: string }>(options: readonly T[], ids: readonly string[]) {
  return options.filter((option) => ids.includes(option.id)).map((option) => option.label).join(', ');
}

export function emptyChoices(): PlannerChoices {
  return {
    moments: [],
    channel: '',
    topics: [],
    demand: '',
    escalation: '',
    accessible: '',
  };
}

export function nextStepFor(choices: PlannerChoices) {
  if (choices.moments.length === 0) return NEXT_STEP.moments;
  if (!choices.channel) return NEXT_STEP.channel;
  if (choices.topics.length === 0) return NEXT_STEP.topics;
  if (!choices.demand) return NEXT_STEP.demand;
  if (!choices.escalation) return NEXT_STEP.escalation;
  if (!choices.accessible) return NEXT_STEP.accessible;
  return null;
}

export function stopRulesFor(choices: PlannerChoices): StopRuleId[] {
  const rules: StopRuleId[] = [];
  if (has(choices.moments, 'durante') || choices.channel === 'balcao-presencial') {
    rules.push('responsavel-ausente');
  }
  if (choices.channel === 'email-corporativo') {
    rules.push('canal-nao-confirmado');
  }
  if (choices.demand === 'moderada' || choices.demand === 'alta') {
    rules.push('demanda-sem-capacidade');
  }
  if (CRITICAL_TOPICS.some((topic) => has(choices.topics, topic))) {
    rules.push('orientacao-critica-inexistente');
  }
  if (choices.accessible === 'sem-alternativa') {
    rules.push('alternativa-acessivel-ausente');
  }
  if (choices.escalation === 'decidir-depois') {
    rules.push('escalonamento-indefinido');
  }
  return rules;
}

export function statusForDimension(dimension: DimensionId, choices: PlannerChoices): StatusId {
  if (dimension === 'moments') {
    return has(choices.moments, 'durante') ? 'stop' : 'planned';
  }
  if (dimension === 'topics') {
    return CRITICAL_TOPICS.some((topic) => has(choices.topics, topic)) ? 'stop' : 'planned';
  }
  if (dimension === 'channel') {
    if (choices.channel === 'decidir-depois') return 'later';
    if (choices.channel === 'email-corporativo' || choices.channel === 'balcao-presencial') return 'stop';
    return 'planned';
  }
  if (dimension === 'demand') {
    return choices.demand === 'moderada' || choices.demand === 'alta' ? 'stop' : 'planned';
  }
  if (dimension === 'escalation') {
    return choices.escalation === 'decidir-depois' ? 'stop' : 'planned';
  }
  if (choices.accessible === 'decidir-depois') return 'later';
  if (choices.accessible === 'sem-alternativa') return 'stop';
  return 'planned';
}

export function overallStatusFor(choices: PlannerChoices, rules: StopRuleId[]): StatusId {
  if (rules.length > 0) return 'stop';
  if (choices.channel === 'decidir-depois' || choices.accessible === 'decidir-depois') {
    return 'later';
  }
  return 'planned';
}

export function planSupport(choices: PlannerChoices) {
  if (nextStepFor(choices)) return null;

  const channel = optionById(CHANNEL_OPTIONS, choices.channel);
  const demand = optionById(DEMAND_OPTIONS, choices.demand);
  const escalation = optionById(ESCALATION_OPTIONS, choices.escalation);
  const accessible = optionById(ACCESSIBLE_OPTIONS, choices.accessible);
  if (!channel || !demand || !escalation || !accessible) return null;

  const momentLabel = labelsFor(MOMENT_OPTIONS, choices.moments);
  const topicLabel = labelsFor(TOPIC_OPTIONS, choices.topics);
  if (!momentLabel || !topicLabel) return null;

  const rules = stopRulesFor(choices);
  const overall = overallStatusFor(choices, rules);
  const overallMeta = STATUS[overall];

  const dimensions = [
    { id: 'moments' as const, title: 'Momentos preliminares de suporte', value: momentLabel },
    { id: 'channel' as const, title: 'Canal conceitual', value: channel.label },
    { id: 'topics' as const, title: 'Grupos de dúvidas esperadas', value: topicLabel },
    { id: 'demand' as const, title: 'Faixa genérica de demanda', value: demand.label },
    { id: 'escalation' as const, title: 'Escalonamento humano', value: escalation.label },
    { id: 'accessible' as const, title: 'Alternativa acessível', value: accessible.label },
  ].map((item) => {
    const status = statusForDimension(item.id, choices);
    const meta = STATUS[status];
    return {
      id: item.id,
      title: item.title,
      value: item.value,
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
      `Resumo atualizado: ${momentLabel}; ${channel.label}; ${topicLabel}; ${demand.label}; ${escalation.label}; ${accessible.label}. Estado geral: ${overallMeta.label}. ${stopRules.length} ${stopRules.length === 1 ? 'regra de parada' : 'regras de parada'}. Este resultado não envia mensagem, não abre chamado, não promete prazo e não oferece atendimento real.`,
  };
}

export default function SupportPlanner() {
  const [choices, setChoices] = useState(emptyChoices);
  const [restarted, setRestarted] = useState(false);

  const plan = useMemo(() => planSupport(choices), [choices]);
  const nextStep = useMemo(() => nextStepFor(choices), [choices]);

  const announcement = useMemo(() => {
    if (
      choices.moments.length === 0
      && !choices.channel
      && choices.topics.length === 0
      && !choices.demand
      && !choices.escalation
      && !choices.accessible
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

  function selectRadio(dimension: 'channel' | 'demand' | 'escalation' | 'accessible', value: string) {
    setChoices((current) => ({ ...current, [dimension]: value }));
  }

  function toggleCheckbox(dimension: 'moments' | 'topics', id: string) {
    setChoices((current) => {
      if (dimension === 'moments') {
        return {
          ...current,
          moments: toggleOrdered(current.moments, id as MomentId, MOMENT_OPTIONS),
        };
      }
      return {
        ...current,
        topics: toggleOrdered(current.topics, id as TopicId, TOPIC_OPTIONS),
      };
    });
  }

  function restart() {
    setChoices(emptyChoices());
    setRestarted(true);
  }

  return <section className={styles.planner} aria-labelledby="planner-title">
    <h2 id="planner-title">Comparar o atendimento preliminar</h2>
    <p className={styles.plannerLead}>
      As seis dimensões usam opções fechadas, com decidir depois quando aplicável.
      Não há campo livre. O resultado só aparece depois das seis escolhas e
      permanece só na memória desta página.
    </p>

    {CHECKBOX_GROUPS.map((group) => <fieldset key={group.id} className={styles.group} aria-describedby={group.hintId}>
      <legend>{group.legend}</legend>
      <p className={styles.fieldHint} id={group.hintId}>{group.hint}</p>
      {group.options.map((option) => {
        const selected = has(choices[group.id] as readonly string[], option.id);
        return <div key={option.id} className={styles.option}>
          <input
            id={`${group.id}-${option.id}`}
            type="checkbox"
            name={group.name}
            checked={selected}
            onChange={() => toggleCheckbox(group.id, option.id)}
          />
          <label htmlFor={`${group.id}-${option.id}`}>
            <span className={styles.optionTitle}>
              {option.label}
              {selected ? <span className={styles.selectedMark}>Selecionado</span> : null}
            </span>
            <span className={styles.optionHelp}>{option.help}</span>
          </label>
        </div>;
      })}
    </fieldset>)}

    {RADIO_GROUPS.map((group) => <fieldset key={group.id} className={styles.group} aria-describedby={group.hintId}>
      <legend>{group.legend}</legend>
      <p className={styles.fieldHint} id={group.hintId}>{group.hint}</p>
      {group.options.map((option) => {
        const selected = choices[group.id] === option.id;
        return <div key={option.id} className={styles.option}>
          <input
            id={`${group.id}-${option.id}`}
            type="radio"
            name={group.name}
            checked={selected}
            onChange={() => selectRadio(group.id, option.id)}
          />
          <label htmlFor={`${group.id}-${option.id}`}>
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
            Nada disso envia mensagem, abre chamado, promete prazo ou oferece atendimento real.
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
            abre chamado ou promete atendimento.
          </p>}
        </> : <p className={styles.resultNote}>
          {nextStep
            ? `Combinação incompleta. Próximo passo: ${nextStep}`
            : 'Escolha as seis dimensões para ver o resumo determinístico.'}
        </p>}
      </div>
    </div>
  </section>;
}
