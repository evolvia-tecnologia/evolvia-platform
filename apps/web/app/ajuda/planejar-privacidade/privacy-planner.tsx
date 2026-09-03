'use client';

import { useMemo, useState } from 'react';
import styles from './planejar-privacidade.module.css';

export type PurposeId =
  | 'inscricao'
  | 'comunicacao-operacional'
  | 'credenciamento'
  | 'certificado'
  | 'decidir-depois';
export type DataId =
  | 'identificacao-basica'
  | 'contato'
  | 'vinculo-profissional'
  | 'acessibilidade'
  | 'decidir-depois';
export type RetentionId = 'excluir-apos-finalidade' | 'manter-prazo-definido' | 'decidir-depois';
export type SharingId = 'sem-compartilhamento' | 'com-compartilhamento' | 'decidir-depois';
export type StatusId = 'planned' | 'later' | 'stop';
export type DimensionId = 'purpose' | 'data' | 'retention' | 'sharing';
export type StopRuleId =
  | 'finalidade-ausente'
  | 'dado-sem-necessidade'
  | 'retencao-indefinida'
  | 'compartilhamento-sem-responsavel'
  | 'dado-sensivel-sem-revisao';

export type PlannerChoices = {
  purpose: PurposeId | '';
  data: DataId | '';
  retention: RetentionId | '';
  sharing: SharingId | '';
};

export const STATUS = Object.freeze({
  planned: Object.freeze({ id: 'planned', label: 'definido para planejar', icon: '●' }),
  later: Object.freeze({ id: 'later', label: 'decidir depois', icon: '○' }),
  stop: Object.freeze({ id: 'stop', label: 'pare e confirme', icon: '!' }),
});

export const PURPOSE_OPTIONS = Object.freeze([
  {
    id: 'inscricao',
    label: 'Inscrição',
    help: 'Classifique a finalidade inicial como inscrição. Não cria ficha, não coleta dado pessoal e não configura o evento.',
  },
  {
    id: 'comunicacao-operacional',
    label: 'Comunicação operacional',
    help: 'Classifique a finalidade inicial como comunicação operacional. Não envia mensagem, não coleta contato e não autoriza tratamento.',
  },
  {
    id: 'credenciamento',
    label: 'Credenciamento ou acesso',
    help: 'Classifique a finalidade inicial como credenciamento ou acesso. Não emite credencial e não coleta documento.',
  },
  {
    id: 'certificado',
    label: 'Emissão de certificado',
    help: 'Classifique a finalidade inicial como emissão de certificado. Não emite certificado e não coleta dado pessoal.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a finalidade inicial para uma decisão humana posterior. Sem finalidade, pare e confirme antes de planejar qualquer dado.',
  },
] as const);

export const DATA_OPTIONS = Object.freeze([
  {
    id: 'identificacao-basica',
    label: 'Identificação básica',
    help: 'Categoria mínima de identificação, como nome ou tratamento. Não peça o dado real nesta página.',
  },
  {
    id: 'contato',
    label: 'Contato',
    help: 'Categoria mínima de contato operacional. Não informe e-mail, telefone ou outro contato aqui.',
  },
  {
    id: 'vinculo-profissional',
    label: 'Vínculo profissional',
    help: 'Categoria mínima de vínculo profissional. Não informe empresa, cargo ou instituição aqui.',
  },
  {
    id: 'acessibilidade',
    label: 'Necessidade de acessibilidade',
    help: 'Categoria potencialmente sensível. Exige revisão humana e não coleta a necessidade real nesta página.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a categoria de dados para depois. Não afirma necessidade e não coleta dado algum.',
  },
] as const);

export const RETENTION_OPTIONS = Object.freeze([
  {
    id: 'excluir-apos-finalidade',
    label: 'Excluir após a finalidade',
    help: 'Diretriz preliminar: excluir depois de cumprir a finalidade. Não define prazo jurídico nem apaga dado algum aqui.',
  },
  {
    id: 'manter-prazo-definido',
    label: 'Manter por prazo definido',
    help: 'Diretriz preliminar: manter por um prazo que ainda será definido fora desta página. Não fixa prazo jurídico.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe a retenção para depois. Sem diretriz, a retenção permanece indefinida e pede confirmação humana.',
  },
] as const);

export const SHARING_OPTIONS = Object.freeze([
  {
    id: 'sem-compartilhamento',
    label: 'Sem compartilhamento operacional',
    help: 'Não há compartilhamento operacional com fornecedor nesta leitura. Não nomeia fornecedor e não envia informação.',
  },
  {
    id: 'com-compartilhamento',
    label: 'Haverá compartilhamento operacional',
    help: 'Haverá compartilhamento operacional com fornecedor. Sem responsável e base documentados, pare e confirme. Não nomeie fornecedor.',
  },
  {
    id: 'decidir-depois',
    label: 'Decidir depois',
    help: 'Deixe o compartilhamento operacional para uma decisão humana posterior. Não envia informação e não cria integração.',
  },
] as const);

export const STOP_RULES = Object.freeze([
  {
    id: 'finalidade-ausente',
    title: 'Finalidade ausente',
    detail: 'A finalidade inicial não foi classificada. Pare e confirme a finalidade antes de planejar qualquer dado. Esta página não autoriza tratamento e não configura o evento.',
  },
  {
    id: 'dado-sem-necessidade',
    title: 'Dado sem necessidade',
    detail: 'A categoria de dados indicada não tem necessidade demonstrada para a finalidade escolhida. Pare e confirme. Não peça o dado real nesta página.',
  },
  {
    id: 'retencao-indefinida',
    title: 'Retenção indefinida',
    detail: 'A retenção ficou para decidir depois, sem diretriz preliminar. Pare e confirme. Esta página não define prazo jurídico e não apaga nem conserva dado algum.',
  },
  {
    id: 'compartilhamento-sem-responsavel',
    title: 'Compartilhamento sem responsável ou base documentada',
    detail: 'Há compartilhamento operacional com fornecedor sem responsável ou base documentada nesta leitura. Pare e confirme. Não nomeie fornecedor, não envie informação e não crie integração.',
  },
  {
    id: 'dado-sensivel-sem-revisao',
    title: 'Dado sensível sem revisão humana',
    detail: 'Necessidade de acessibilidade é categoria potencialmente sensível e exige revisão humana. Esta página não coleta a necessidade real, não substitui a escuta das pessoas e não afirma conformidade.',
  },
] as const);

const NEEDED_DATA: Record<Exclude<PurposeId, 'decidir-depois'>, readonly Exclude<DataId, 'acessibilidade' | 'decidir-depois'>[]> = {
  inscricao: ['identificacao-basica', 'contato'],
  'comunicacao-operacional': ['contato'],
  credenciamento: ['identificacao-basica'],
  certificado: ['identificacao-basica', 'vinculo-profissional'],
};

const DIMENSIONS = Object.freeze([
  {
    id: 'purpose',
    legend: 'Finalidade inicial',
    hintId: 'purpose-hint',
    hint: 'Classifique a finalidade inicial por opções fechadas: inscrição, comunicação operacional, credenciamento ou acesso, ou emissão de certificado. Há opção explícita de decidir depois. Esta página não autoriza tratamento.',
    name: 'privacy-planner-purpose',
    options: PURPOSE_OPTIONS,
  },
  {
    id: 'data',
    legend: 'Categoria mínima de dados',
    hintId: 'data-hint',
    hint: 'Indique a categoria mínima prevista, sem pedir o dado real. Identificação básica, contato, vínculo profissional ou necessidade de acessibilidade. Há opção explícita de decidir depois.',
    name: 'privacy-planner-data',
    options: DATA_OPTIONS,
  },
  {
    id: 'retention',
    legend: 'Diretriz preliminar de retenção',
    hintId: 'retention-hint',
    hint: 'Escolha uma diretriz preliminar: excluir após a finalidade, manter por prazo definido ou decidir depois. Esta página não define prazo jurídico.',
    name: 'privacy-planner-retention',
    options: RETENTION_OPTIONS,
  },
  {
    id: 'sharing',
    legend: 'Compartilhamento operacional',
    hintId: 'sharing-hint',
    hint: 'Indique se haverá compartilhamento operacional com fornecedor. Não nomeie fornecedor e não envie informação. Há opção explícita de decidir depois.',
    name: 'privacy-planner-sharing',
    options: SHARING_OPTIONS,
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
  purpose: 'Escolha a finalidade inicial.',
  data: 'Indique a categoria mínima de dados prevista.',
  retention: 'Escolha a diretriz preliminar de retenção.',
  sharing: 'Indique se haverá compartilhamento operacional com fornecedor.',
});

export function emptyChoices(): PlannerChoices {
  return { purpose: '', data: '', retention: '', sharing: '' };
}

export function nextStepFor(choices: PlannerChoices) {
  if (!choices.purpose) return NEXT_STEP.purpose;
  if (!choices.data) return NEXT_STEP.data;
  if (!choices.retention) return NEXT_STEP.retention;
  if (!choices.sharing) return NEXT_STEP.sharing;
  return null;
}

export function dataHasNeed(purpose: PurposeId | '', data: DataId | '') {
  if (data === 'acessibilidade' || data === 'decidir-depois' || !data) return true;
  if (purpose === 'decidir-depois' || !purpose) return false;
  return (NEEDED_DATA[purpose] as readonly string[]).includes(data);
}

export function stopRulesFor(choices: PlannerChoices): StopRuleId[] {
  const rules: StopRuleId[] = [];
  if (choices.purpose === 'decidir-depois') {
    rules.push('finalidade-ausente');
  }
  if (choices.data && choices.data !== 'decidir-depois' && choices.data !== 'acessibilidade' && !dataHasNeed(choices.purpose, choices.data)) {
    rules.push('dado-sem-necessidade');
  }
  if (choices.retention === 'decidir-depois') {
    rules.push('retencao-indefinida');
  }
  if (choices.sharing === 'com-compartilhamento') {
    rules.push('compartilhamento-sem-responsavel');
  }
  if (choices.data === 'acessibilidade') {
    rules.push('dado-sensivel-sem-revisao');
  }
  return rules;
}

export function statusForDimension(dimension: DimensionId, value: string, choices: PlannerChoices): StatusId {
  if (dimension === 'purpose' && value === 'decidir-depois') return 'stop';
  if (dimension === 'data' && value === 'acessibilidade') return 'stop';
  if (dimension === 'data' && value !== 'decidir-depois' && !dataHasNeed(choices.purpose, value as DataId)) return 'stop';
  if (dimension === 'retention' && value === 'decidir-depois') return 'stop';
  if (dimension === 'sharing' && value === 'com-compartilhamento') return 'stop';
  if (value === 'decidir-depois') return 'later';
  return 'planned';
}

export function overallStatusFor(choices: PlannerChoices, rules: StopRuleId[]): StatusId {
  if (rules.length > 0) return 'stop';
  if (
    choices.purpose === 'decidir-depois'
    || choices.data === 'decidir-depois'
    || choices.retention === 'decidir-depois'
    || choices.sharing === 'decidir-depois'
  ) {
    return 'later';
  }
  return 'planned';
}

function optionById<T extends { id: string }>(options: readonly T[], id: string) {
  return options.find((option) => option.id === id);
}

export function planPrivacy(choices: PlannerChoices) {
  if (nextStepFor(choices)) return null;

  const purpose = optionById(PURPOSE_OPTIONS, choices.purpose);
  const data = optionById(DATA_OPTIONS, choices.data);
  const retention = optionById(RETENTION_OPTIONS, choices.retention);
  const sharing = optionById(SHARING_OPTIONS, choices.sharing);
  if (!purpose || !data || !retention || !sharing) return null;

  const rules = stopRulesFor(choices);
  const overall = overallStatusFor(choices, rules);
  const overallMeta = STATUS[overall];

  const dimensions = [
    { id: 'purpose' as const, title: 'Finalidade inicial', option: purpose },
    { id: 'data' as const, title: 'Categoria mínima de dados', option: data },
    { id: 'retention' as const, title: 'Diretriz preliminar de retenção', option: retention },
    { id: 'sharing' as const, title: 'Compartilhamento operacional', option: sharing },
  ].map((item) => {
    const status = statusForDimension(item.id, item.option.id, choices);
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
      `Resumo atualizado: ${purpose.label}, ${data.label}, ${retention.label}, ${sharing.label}. Estado geral: ${overallMeta.label}. ${stopRules.length} ${stopRules.length === 1 ? 'regra de parada' : 'regras de parada'}. Este resultado não coleta, não salva, não transmite, não autoriza tratamento, não altera política e não configura o evento.`,
  };
}

export default function PrivacyPlanner() {
  const [choices, setChoices] = useState(emptyChoices);
  const [restarted, setRestarted] = useState(false);

  const plan = useMemo(() => planPrivacy(choices), [choices]);
  const nextStep = useMemo(() => nextStepFor(choices), [choices]);

  const announcement = useMemo(() => {
    if (!choices.purpose && !choices.data && !choices.retention && !choices.sharing) {
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
    <h2 id="planner-title">Comparar decisões mínimas de privacidade</h2>
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
            Nada disso coleta, salva, transmite, autoriza tratamento, altera política ou configura o evento.
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
            pessoa responsável antes de configurar o evento. A ausência de alerta
            não afirma conformidade.
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
