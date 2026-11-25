'use client';

import { useMemo, useState } from 'react';
import styles from './planejar-acessibilidade.module.css';

type PlanStatus = 'empty' | 'planned';
type ActionLevel = 'plan' | 'confirm' | 'validate';

export const ACTION_LEVELS = Object.freeze({
  plan: 'planejar',
  confirm: 'confirmar com fornecedor/local',
  validate: 'validar com pessoa responsável',
} satisfies Record<ActionLevel, string>);

export const PLANNER_GROUPS = Object.freeze([
  {
    id: 'communication',
    legend: 'Comunicação',
    purpose: 'Antecipar como o público acompanha falas, avisos e informações orais, sem pedir idioma pessoal nem diagnóstico.',
    items: [
      {
        id: 'comm-libras',
        label: 'Interpretação em Libras está prevista',
        help: 'Trate Libras como língua, não como laudo. Esta marcação não garante intérprete nem certifica qualidade.',
        action: 'confirm',
        planLabel: 'Confirmar com o fornecedor ou o local se haverá interpretação em Libras e em quais momentos.',
      },
      {
        id: 'comm-captions',
        label: 'Legendas para falas e vídeos estão previstas',
        help: 'Legendas ao vivo ou gravadas ajudam muita gente. Não prometa precisão automática só por marcar este item.',
        action: 'plan',
        planLabel: 'Planejar legendas para falas, avisos e vídeos essenciais, sem depender só de geração automática.',
      },
    ],
  },
  {
    id: 'digital',
    legend: 'Conteúdo digital',
    purpose: 'Antecipar alternativas para imagens, vídeos, documentos e texto da divulgação, sem upload nesta página.',
    items: [
      {
        id: 'digital-alt',
        label: 'Alternativas textuais para imagens e documentos',
        help: 'Texto equivalente descreve o que a imagem ou o arquivo comunica. Não envie arquivo aqui.',
        action: 'plan',
        planLabel: 'Planejar alternativas textuais para imagens, gráficos e documentos da divulgação.',
      },
      {
        id: 'digital-ad',
        label: 'Audiodescrição do conteúdo visual essencial',
        help: 'Audiodescrição é orientação, não selo. Defina o que é essencial sem coletar condição de saúde.',
        action: 'plan',
        planLabel: 'Planejar audiodescrição ou narração equivalente do conteúdo visual essencial.',
      },
      {
        id: 'digital-contrast',
        label: 'Contraste e tamanho de texto foram revisados',
        help: 'Contraste e tamanho legíveis ajudam a leitura. Marcar isto não certifica WCAG.',
        action: 'validate',
        planLabel: 'Validar com a pessoa responsável se contraste e tamanho do texto permanecem legíveis.',
      },
    ],
  },
  {
    id: 'mobility',
    legend: 'Mobilidade e local',
    purpose: 'Antecipar deslocamento, permanência e uso do espaço físico, sem pedir laudo ou dado de saúde.',
    items: [
      {
        id: 'mobility-routes',
        label: 'Rotas acessíveis até o espaço e entre áreas',
        help: 'Confirme percursos contínuos e sinalizados. Não peça mapa pessoal nem condição médica.',
        action: 'confirm',
        planLabel: 'Confirmar com o local se as rotas de chegada, circulação e saída são acessíveis.',
      },
      {
        id: 'mobility-seats',
        label: 'Assentos reservados e circulação prevista',
        help: 'Reserve espaço de circulação e assentos sem expor quem vai usá-los.',
        action: 'confirm',
        planLabel: 'Confirmar com o local a reserva de assentos e o espaço de circulação.',
      },
      {
        id: 'mobility-restrooms',
        label: 'Banheiros acessíveis no local',
        help: 'Pergunte ao local sobre banheiro acessível, rota e sinalização. Não colete condição médica.',
        action: 'confirm',
        planLabel: 'Confirmar com o local a existência, a rota e a sinalização de banheiros acessíveis.',
      },
    ],
  },
  {
    id: 'sensory',
    legend: 'Recursos sensoriais',
    purpose: 'Antecipar ritmo, pausas e menor sobrecarga sensorial, sem diagnosticar ninguém.',
    items: [
      {
        id: 'sensory-breaks',
        label: 'Pausas e ritmo da programação estão previstos',
        help: 'Pausas regulares reduzem cansaço. Isto é planejamento, não protocolo clínico.',
        action: 'plan',
        planLabel: 'Planejar pausas e um ritmo de programação que permita descanso sem expor ninguém.',
      },
      {
        id: 'sensory-low',
        label: 'Opção de ambiente com menor estímulo',
        help: 'Uma sala mais calma ou um recuo pode ajudar. Confirme o espaço com o local, sem pedir diagnóstico.',
        action: 'confirm',
        planLabel: 'Confirmar com o local se existe um ambiente ou recuo com menor estímulo sensorial.',
      },
    ],
  },
  {
    id: 'support',
    legend: 'Apoio humano',
    purpose: 'Antecipar quem responde e como pedir ajuda no evento, sem cadastrar nome, contato ou condição.',
    items: [
      {
        id: 'support-channel',
        label: 'Canal humano de apoio no evento está previsto',
        help: 'O canal deve existir no evento, não nesta página. Não informe e-mail, telefone ou nome aqui.',
        action: 'validate',
        planLabel: 'Validar com a pessoa responsável qual canal humano de apoio estará disponível no evento.',
      },
      {
        id: 'support-owner',
        label: 'Há pessoa responsável pela acessibilidade',
        help: 'Alguém autorizado acompanha as confirmações. Não escreva nome, documento ou contato nesta ferramenta.',
        action: 'validate',
        planLabel: 'Validar com a pessoa responsável quem acompanha o plano sem registrar dado pessoal aqui.',
      },
    ],
  },
]);

export function emptySelections(): Record<string, boolean> {
  const selections: Record<string, boolean> = {};
  for (const group of PLANNER_GROUPS) {
    for (const item of group.items) {
      selections[item.id] = false;
    }
  }
  return selections;
}

export function buildAccessibilityPlan(selections: Record<string, boolean>) {
  const items = PLANNER_GROUPS.flatMap((group) => group.items);
  const selected = items.filter((item) => selections[item.id] === true);
  const selectedCount = selected.length;
  const status: PlanStatus = selectedCount === 0 ? 'empty' : 'planned';

  return {
    status,
    selectedCount,
    totalCount: items.length,
    headline: status === 'empty'
      ? 'Nenhuma necessidade marcada. Use os grupos para antecipar o plano local.'
      : `Plano local com ${selectedCount} necessidade(s) marcada(s).`,
    levels: {
      plan: selected.filter((item) => item.action === 'plan'),
      confirm: selected.filter((item) => item.action === 'confirm'),
      validate: selected.filter((item) => item.action === 'validate'),
    },
  };
}

const STATUS_ICONS: Record<PlanStatus, string> = {
  empty: '○',
  planned: '≡',
};

const LEVEL_ICONS: Record<ActionLevel, string> = {
  plan: '1',
  confirm: '2',
  validate: '3',
};

const STATUS_CLASS: Record<PlanStatus, string> = {
  empty: styles.planEmpty,
  planned: styles.planActive,
};

const LEVEL_CLASS: Record<ActionLevel, string> = {
  plan: styles.levelPlan,
  confirm: styles.levelConfirm,
  validate: styles.levelValidate,
};

const LEVEL_ORDER: readonly ActionLevel[] = ['plan', 'confirm', 'validate'];

export default function AccessibilityPlanner() {
  const [selections, setSelections] = useState(emptySelections);

  const plan = useMemo(() => buildAccessibilityPlan(selections), [selections]);

  function toggle(id: string) {
    setSelections((current) => ({ ...current, [id]: !current[id] }));
  }

  function resetPlan() {
    setSelections(emptySelections());
  }

  return <section className={styles.planner} aria-labelledby="planner-title">
    <h2 id="planner-title">Necessidades genéricas do evento</h2>
    <p className={styles.plannerLead}>
      Cada grupo tem um propósito e opções genéricas. Não há campo livre, nome
      de pessoa nem condição médica. Marcar um item só atualiza o plano local.
    </p>

    <div className={`${styles.summary} ${STATUS_CLASS[plan.status]}`}>
      <div className={styles.summaryHead}>
        <h3 id="summary-title">Plano de confirmação</h3>
        <button type="button" className={styles.resetButton} onClick={resetPlan}>
          Reiniciar planejamento
        </button>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" aria-labelledby="summary-title">
        <p className={styles.summaryLabel} data-plan-status={plan.status}>
          <span className={styles.statusIcon} aria-hidden="true">{STATUS_ICONS[plan.status]}</span>
          {plan.headline}
        </p>
        <p className={styles.summaryCount}>
          {plan.selectedCount} de {plan.totalCount} necessidades marcadas.
          {plan.status === 'empty'
            ? ' Marque os grupos abaixo para separar o que planejar, o que confirmar com o fornecedor ou o local e o que validar com a pessoa responsável. Esta leitura não certifica acessibilidade, não substitui a escuta das pessoas e não altera o evento.'
            : ' O resumo abaixo separa as ações em três níveis. Continua sem certificar acessibilidade, sem substituir a escuta das pessoas e sem alterar o evento.'}
        </p>
        <div className={styles.levels}>
          {LEVEL_ORDER.map((level) => {
            const items = plan.levels[level];
            return <section
              key={level}
              className={`${styles.level} ${LEVEL_CLASS[level]}`}
              aria-labelledby={`level-${level}-title`}
              data-level={level}
            >
              <h4 id={`level-${level}-title`} className={styles.levelTitle}>
                <span className={styles.levelIcon} aria-hidden="true">{LEVEL_ICONS[level]}</span>
                {ACTION_LEVELS[level]}
              </h4>
              {items.length === 0 ? <p className={styles.levelEmpty}>
                Nenhuma ação neste nível ainda.
              </p> : <ul className={styles.levelList}>
                {items.map((item) => <li key={item.id}>{item.planLabel}</li>)}
              </ul>}
            </section>;
          })}
        </div>
      </div>
    </div>

    {PLANNER_GROUPS.map((group) => <fieldset key={group.id} className={styles.group}>
      <legend>{group.legend}</legend>
      <p className={styles.purpose}>{group.purpose}</p>
      {group.items.map((item) => <div key={item.id} className={styles.item}>
        <input
          id={item.id}
          type="checkbox"
          checked={selections[item.id] === true}
          onChange={() => toggle(item.id)}
        />
        <label htmlFor={item.id}>
          <span className={styles.itemTitle}>{item.label}</span>
          <span className={styles.itemHelp}>{item.help}</span>
        </label>
      </div>)}
    </fieldset>)}
  </section>;
}
