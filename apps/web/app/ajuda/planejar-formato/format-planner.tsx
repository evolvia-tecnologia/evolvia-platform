'use client';

import { useMemo, useState } from 'react';
import styles from './planejar-formato.module.css';

export type ProfileId = 'entretenimento' | 'corporativo' | 'cientifico' | 'feira';
export type FormatId = 'presencial' | 'online' | 'hibrido';
export type AudienceId = 'encontro-reduzido' | 'publico-moderado' | 'publico-amplo' | 'grande-circulacao';
export type AttentionId = 'essential' | 'recommended' | 'confirm';
export type TopicId = 'place' | 'connectivity' | 'reception' | 'accessibility' | 'contingency' | 'owner';

export type PlannerChoices = {
  profile: ProfileId | '';
  format: FormatId | '';
  audience: AudienceId | '';
};

export const ATTENTION = Object.freeze({
  essential: Object.freeze({ id: 'essential', label: 'Essencial', icon: '●' }),
  recommended: Object.freeze({ id: 'recommended', label: 'Recomendado', icon: '○' }),
  confirm: Object.freeze({ id: 'confirm', label: 'Confirmar antes de avançar', icon: '!' }),
});

export const PROFILES = Object.freeze([
  {
    id: 'entretenimento',
    label: 'Entretenimento',
    help: 'Perfil amplo para encontros orientados à experiência do público. Não escolhe tipo canônico.',
  },
  {
    id: 'corporativo',
    label: 'Corporativo',
    help: 'Perfil amplo para encontros de empresas, equipes ou capacitação. Não escolhe tipo canônico.',
  },
  {
    id: 'cientifico',
    label: 'Científico',
    help: 'Perfil amplo para encontros técnicos ou acadêmicos. Não escolhe tipo canônico.',
  },
  {
    id: 'feira',
    label: 'Feira',
    help: 'Perfil amplo para circulação de visitantes e exposições. Não escolhe tipo canônico.',
  },
] as const);

export const FORMATS = Object.freeze([
  {
    id: 'presencial',
    label: 'Presencial',
    help: 'A participação prevista ocorre no mesmo lugar físico.',
  },
  {
    id: 'online',
    label: 'Online',
    help: 'A participação prevista ocorre à distância, por um caminho de acesso.',
  },
  {
    id: 'hibrido',
    label: 'Híbrido',
    help: 'Há frente presencial e frente à distância. Uma não substitui a outra automaticamente.',
  },
] as const);

export const AUDIENCES = Object.freeze([
  {
    id: 'encontro-reduzido',
    label: 'Encontro reduzido',
    help: 'Faixa genérica. Não informe quantidade exata nem dado pessoal.',
  },
  {
    id: 'publico-moderado',
    label: 'Público moderado',
    help: 'Faixa genérica. Não informe quantidade exata nem dado pessoal.',
  },
  {
    id: 'publico-amplo',
    label: 'Público amplo',
    help: 'Faixa genérica. Não informe quantidade exata nem dado pessoal.',
  },
  {
    id: 'grande-circulacao',
    label: 'Grande circulação',
    help: 'Faixa genérica. Não estima lotação física nem pede quantidade exata.',
  },
] as const);

export const CHECKPOINT_TOPICS = Object.freeze([
  { id: 'place', title: 'Local ou acesso' },
  { id: 'connectivity', title: 'Conectividade' },
  { id: 'reception', title: 'Recepção e credenciamento' },
  { id: 'accessibility', title: 'Acessibilidade' },
  { id: 'contingency', title: 'Contingência' },
  { id: 'owner', title: 'Responsável humano' },
] as const);

const DIMENSIONS = Object.freeze([
  {
    id: 'profile',
    legend: 'Perfil amplo',
    hintId: 'profile-hint',
    hint: 'Escolha um dos quatro perfis já adotados pela plataforma. Esta página não lista nem escolhe os 19 tipos canônicos.',
    name: 'format-planner-profile',
    options: PROFILES,
  },
  {
    id: 'format',
    legend: 'Formato',
    hintId: 'format-hint',
    hint: 'Escolha presencial, online ou híbrido. A escolha descreve a forma de participação, sem configurar o evento.',
    name: 'format-planner-format',
    options: FORMATS,
  },
  {
    id: 'audience',
    legend: 'Faixa de público',
    hintId: 'audience-hint',
    hint: 'Escolha uma faixa genérica. Não solicite nem informe número exato, nome, e-mail, telefone ou outro dado pessoal.',
    name: 'format-planner-audience',
    options: AUDIENCES,
  },
] as const);

const ATTENTION_CLASS = {
  essential: styles.attentionEssential,
  recommended: styles.attentionRecommended,
  confirm: styles.attentionConfirm,
} as const;

const INITIAL_ANNOUNCEMENT =
  'Nenhuma escolha feita. O resumo aparece quando perfil, formato e faixa de público estiverem definidos.';

export function emptyChoices(): PlannerChoices {
  return { profile: '', format: '', audience: '' };
}

export function attentionFor(topicId: TopicId, format: FormatId): AttentionId {
  if (topicId === 'connectivity') return format === 'presencial' ? 'recommended' : 'essential';
  if (topicId === 'reception') return format === 'online' ? 'recommended' : 'essential';
  if (topicId === 'contingency') return 'recommended';
  if (topicId === 'owner') return 'confirm';
  return 'essential';
}

function contextPhrase(
  profile: (typeof PROFILES)[number],
  format: (typeof FORMATS)[number],
  audience: (typeof AUDIENCES)[number],
) {
  return `No perfil ${profile.label}, formato ${format.label} e faixa ${audience.label}`;
}

function placeDetail(
  profile: (typeof PROFILES)[number],
  format: (typeof FORMATS)[number],
  audience: (typeof AUDIENCES)[number],
) {
  const context = contextPhrase(profile, format, audience);
  if (format.id === 'online') {
    return `${context}, confirme o caminho de acesso à distância, sem escolher ferramenta nem prometer disponibilidade contínua.`;
  }
  if (format.id === 'hibrido') {
    return `${context}, confirme o local presencial e o caminho de acesso à distância, descrevendo os dois sem inferir que um substitui o outro.`;
  }
  if (profile.id === 'entretenimento') {
    return `${context}, confirme o local onde o público chega e como a entrada será reconhecida, sem estimar lotação física.`;
  }
  if (profile.id === 'feira') {
    return `${context}, confirme o local da circulação e como visitantes encontram o acesso, sem estimar lotação física.`;
  }
  if (profile.id === 'cientifico') {
    return `${context}, confirme o local das atividades e como as pessoas participantes o identificam, sem inferir capacidade do espaço.`;
  }
  return `${context}, confirme o local do encontro e como as pessoas convidadas o encontram, sem inferir capacidade do espaço.`;
}

function connectivityDetail(
  profile: (typeof PROFILES)[number],
  format: (typeof FORMATS)[number],
  audience: (typeof AUDIENCES)[number],
) {
  const context = contextPhrase(profile, format, audience);
  if (format.id === 'presencial') {
    return `${context}, confirme se a operação no local depende de conexão e como isso será verificado, sem prazo, custo ou compromisso de disponibilidade.`;
  }
  return `${context}, confirme como a conexão de quem participa à distância será verificada, sem prometer estabilidade, ferramenta ou tempo de resposta.`;
}

function receptionDetail(
  profile: (typeof PROFILES)[number],
  format: (typeof FORMATS)[number],
  audience: (typeof AUDIENCES)[number],
) {
  const context = contextPhrase(profile, format, audience);
  if (format.id === 'online') {
    return `${context}, confirme se haverá conferência de presença à distância e como ela será descrita, sem coletar dado pessoal nesta página.`;
  }
  if (profile.id === 'entretenimento') {
    return `${context}, confirme como a recepção e o credenciamento reconhecem o público na entrada, sem definir equipe nem fluxo operacional.`;
  }
  if (profile.id === 'feira') {
    return `${context}, confirme como recepção e credenciamento reconhecem visitantes, sem inferir operação de estandes ou equipe.`;
  }
  if (profile.id === 'cientifico') {
    return `${context}, confirme como o credenciamento reconhece participantes, sem abrir ficha real nem pedir dado pessoal aqui.`;
  }
  return `${context}, confirme como a recepção identifica as pessoas convidadas, sem pedir dado pessoal nesta página.`;
}

function accessibilityDetail(
  profile: (typeof PROFILES)[number],
  format: (typeof FORMATS)[number],
  audience: (typeof AUDIENCES)[number],
) {
  const context = contextPhrase(profile, format, audience);
  if (audience.id === 'grande-circulacao') {
    return `${context}, confirme se as informações de acessibilidade cobrem chegada e permanência, sem estimar lotação nem certificar WCAG.`;
  }
  return `${context}, confirme informações mínimas de acessibilidade do formato escolhido — caminho, conteúdo ou participação — sem certificar WCAG e sem inferir adequação do local.`;
}

function contingencyDetail(
  profile: (typeof PROFILES)[number],
  format: (typeof FORMATS)[number],
  audience: (typeof AUDIENCES)[number],
) {
  const context = contextPhrase(profile, format, audience);
  if (format.id === 'hibrido') {
    return `${context}, confirme o que acontece se uma das frentes falhar, sem prometer continuidade, prazo, custo ou equipe.`;
  }
  return `${context}, confirme um plano simples se local, acesso ou conexão falhar, sem prazo, custo, equipe ou obrigação jurídica.`;
}

function ownerDetail(
  profile: (typeof PROFILES)[number],
  format: (typeof FORMATS)[number],
  audience: (typeof AUDIENCES)[number],
) {
  return `${contextPhrase(profile, format, audience)}, confirme quem decide o próximo passo. Esta leitura não configura, não homologa e não publica evento. Não informe nome, e-mail ou telefone aqui.`;
}

const DETAIL_FOR: Record<
  TopicId,
  (
    profile: (typeof PROFILES)[number],
    format: (typeof FORMATS)[number],
    audience: (typeof AUDIENCES)[number],
  ) => string
> = {
  place: placeDetail,
  connectivity: connectivityDetail,
  reception: receptionDetail,
  accessibility: accessibilityDetail,
  contingency: contingencyDetail,
  owner: ownerDetail,
};

export function planFormat(choices: PlannerChoices) {
  const profile = PROFILES.find((option) => option.id === choices.profile);
  const format = FORMATS.find((option) => option.id === choices.format);
  const audience = AUDIENCES.find((option) => option.id === choices.audience);
  if (!profile || !format || !audience) return null;

  const checkpoints = CHECKPOINT_TOPICS.map((topic) => {
    const attentionId = attentionFor(topic.id, format.id);
    const attention = ATTENTION[attentionId];
    return {
      id: topic.id,
      title: topic.title,
      attention: attentionId,
      attentionLabel: attention.label,
      icon: attention.icon,
      detail: DETAIL_FOR[topic.id](profile, format, audience),
    };
  });

  return {
    summary: [
      { key: 'Perfil amplo', value: profile.label },
      { key: 'Formato', value: format.label },
      { key: 'Faixa de público', value: audience.label },
    ],
    checkpoints,
    announcement:
      `Resumo atualizado: ${profile.label}, ${format.label}, ${audience.label}. ${checkpoints.length} pontos a confirmar. Este resultado não configura, não homologa e não publica evento.`,
  };
}

export default function FormatPlanner() {
  const [choices, setChoices] = useState(emptyChoices);
  const [restarted, setRestarted] = useState(false);

  const plan = useMemo(() => planFormat(choices), [choices]);

  const announcement = useMemo(() => {
    if (!choices.profile && !choices.format && !choices.audience) {
      return restarted
        ? 'Escolhas reiniciadas. Nenhum resumo está visível.'
        : INITIAL_ANNOUNCEMENT;
    }
    if (!plan) {
      return 'Atualização: ainda faltam escolhas. O resumo aparece quando perfil, formato e faixa de público estiverem definidos.';
    }
    return plan.announcement;
  }, [choices, plan, restarted]);

  function select(dimension: keyof PlannerChoices, value: string) {
    setChoices((current) => ({ ...current, [dimension]: value }));
  }

  function restart() {
    setChoices(emptyChoices());
    setRestarted(true);
  }

  return <section className={styles.planner} aria-labelledby="planner-title">
    <h2 id="planner-title">Comparar formato e faixa de público</h2>
    <p className={styles.plannerLead}>
      As três dimensões usam opções fechadas. Não há campo livre.
      O resultado só aparece depois das três escolhas e permanece só na memória desta página.
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
          <dl className={styles.summaryList}>
            {plan.summary.map((item) => <div key={item.key}>
              <dt>{item.key}</dt>
              <dd>{item.value}</dd>
            </div>)}
          </dl>

          <p className={styles.resultNote}>
            Lista contextual de pontos a confirmar. Os três níveis de atenção
            aparecem por texto, ícone e estilo de borda, nunca só por cor.
            Nada disso configura, homologa ou publica evento.
          </p>

          <ul className={styles.levelLegend} aria-label="Níveis de atenção">
            {Object.values(ATTENTION).map((level) => <li
              key={level.id}
              className={`${styles.levelItem} ${ATTENTION_CLASS[level.id]}`}
            >
              <span className={styles.attentionIcon} aria-hidden="true">{level.icon}</span>
              <span>{level.label}</span>
            </li>)}
          </ul>

          <ol className={styles.checkpoints}>
            {plan.checkpoints.map((item) => <li
              key={item.id}
              className={`${styles.checkpoint} ${ATTENTION_CLASS[item.attention]}`}
              data-attention={item.attention}
            >
              <p className={styles.checkpointHead}>
                <span className={styles.attentionIcon} aria-hidden="true">{item.icon}</span>
                <span className={styles.attentionLabel}>{item.attentionLabel}</span>
                <span className={styles.checkpointTitle}>{item.title}</span>
              </p>
              <p className={styles.checkpointDetail}>{item.detail}</p>
            </li>)}
          </ol>
        </> : <p className={styles.resultNote}>
          Escolha as três dimensões para ver o resumo determinístico e a lista de preparações essenciais.
        </p>}
      </div>
    </div>
  </section>;
}
