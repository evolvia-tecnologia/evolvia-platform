'use client';

import { useMemo, useState } from 'react';
import styles from './planejar-comunicacao.module.css';

export type MomentId = 'confirmacao' | 'lembrete' | 'alteracao' | 'acesso' | 'pos-evento';
export type ChannelId = 'email' | 'area-participante' | 'mensagem-instantanea';
export type NeedId =
  | 'assunto'
  | 'data-horario-fuso'
  | 'local-ou-link'
  | 'contato-responsavel'
  | 'acessibilidade'
  | 'privacidade'
  | 'alternativa-falha';
export type ActionLevelId = 'essential' | 'confirm' | 'human';
export type RiskId = 'consent' | 'missing-critical' | 'unreviewed-link' | 'no-accessible-alt';

export type PlannerSelection = {
  moments: readonly MomentId[];
  channels: readonly ChannelId[];
  needs: readonly NeedId[];
};

export const ACTION_LEVELS = Object.freeze({
  essential: Object.freeze({ id: 'essential', label: 'Conteúdo essencial', icon: '●' }),
  confirm: Object.freeze({ id: 'confirm', label: 'Confirmar antes de enviar', icon: '○' }),
  human: Object.freeze({ id: 'human', label: 'Decisão humana', icon: '!' }),
});

export const MOMENTS = Object.freeze([
  {
    id: 'confirmacao',
    label: 'Confirmação',
    help: 'Avisar que a inscrição ou a reserva foi reconhecida. Não dispara confirmação real.',
    essential: 'Descrever o que está sendo confirmado, sem prometer envio automático nem recibo.',
  },
  {
    id: 'lembrete',
    label: 'Lembrete',
    help: 'Lembrar a participação antes do encontro. Não agenda disparo.',
    essential: 'Lembrar data, horário e fuso sem criar urgência artificial nem prometer entrega.',
  },
  {
    id: 'alteracao',
    label: 'Alteração importante',
    help: 'Comunicar mudança relevante já decidida pela organização. Não altera o evento aqui.',
    essential: 'Dizer o que mudou e o que permanece, sem tratar a mudança como publicada por esta página.',
  },
  {
    id: 'acesso',
    label: 'Instruções de acesso ou participação',
    help: 'Orientar como chegar ou entrar. Não gera credencial nem caminho real.',
    essential: 'Indicar local ou caminho de acesso já conhecido, sem inventar endereço nem credencial.',
  },
  {
    id: 'pos-evento',
    label: 'Pós-evento',
    help: 'Orientar o que acontece depois. Não coleta avaliação nem dado pessoal aqui.',
    essential: 'Descrever o próximo passo público, sem pedir resposta, dado pessoal ou nova inscrição nesta página.',
  },
] as const);

export const CHANNELS = Object.freeze([
  {
    id: 'email',
    label: 'E-mail',
    help: 'Canal só de planejamento. Disponibilidade e configuração serão confirmadas depois. Esta página não envia e-mail.',
    confirm: 'E-mail permanece escolha de planejamento. Confirme depois se existirá configuração; nada aqui envia mensagem.',
  },
  {
    id: 'area-participante',
    label: 'Área do participante',
    help: 'Canal só de planejamento para aviso no espaço da pessoa inscrita. Não abre área autenticada nem publica aviso.',
    confirm: 'Área do participante permanece escolha de planejamento. Confirme depois se esse espaço existirá; nada aqui publica aviso.',
  },
  {
    id: 'mensagem-instantanea',
    label: 'Mensagem instantânea',
    help: 'Canal só de planejamento para aviso curto. Não configura aplicativo, fila ou número e não envia mensagem.',
    confirm: 'Mensagem instantânea permanece escolha de planejamento. Confirme depois se o canal existirá; nada aqui dispara aviso.',
  },
] as const);

export const NEEDS = Object.freeze([
  {
    id: 'assunto',
    label: 'Assunto claro',
    help: 'Marcar se o aviso precisa de um propósito em uma linha. Não escreva o texto da mensagem aqui.',
    essential: 'Incluir um assunto que diga o motivo do aviso, sem redigir a mensagem nesta página.',
  },
  {
    id: 'data-horario-fuso',
    label: 'Data, horário e fuso',
    help: 'Marcar se o aviso precisa do quando. Não informe data real aqui.',
    essential: 'Incluir data, horário e fuso já conhecidos, sem criar calendário nem disparo.',
  },
  {
    id: 'local-ou-link',
    label: 'Local ou link',
    help: 'Marcar se o aviso precisa de lugar ou caminho. Não cole endereço nesta página.',
    essential: 'Incluir local ou caminho já revisado pela organização. Esta página não valida endereço.',
  },
  {
    id: 'contato-responsavel',
    label: 'Contato responsável',
    help: 'Marcar se o aviso precisa dizer quem responde. Não informe nome, e-mail ou telefone aqui.',
    essential: 'Indicar que haverá um contato responsável, sem registrar dado pessoal nesta página.',
  },
  {
    id: 'acessibilidade',
    label: 'Acessibilidade',
    help: 'Marcar se o aviso precisa de informação de acesso acessível. Não certifica WCAG.',
    essential: 'Incluir orientação de acessibilidade já conhecida, sem certificar conformidade.',
  },
  {
    id: 'privacidade',
    label: 'Privacidade',
    help: 'Marcar se o aviso precisa lembrar finalidade e cuidado com dados. Não registra aceite.',
    essential: 'Lembrar que o aviso deve ter finalidade e não deve pedir dado além do necessário.',
  },
  {
    id: 'alternativa-falha',
    label: 'Alternativa em caso de falha',
    help: 'Marcar se existe outro caminho se o canal falhar. Não promete continuidade nem SLA.',
    essential: 'Descrever um caminho alternativo já previsto, sem prometer disponibilidade contínua.',
  },
] as const);

export const RISKS = Object.freeze([
  {
    id: 'consent',
    title: 'Envio sem consentimento ou finalidade',
    text: 'Planejar um canal de envio não autoriza contato. Sem finalidade e base adequadas, um envio futuro pode ocorrer sem consentimento. Isto é orientação, não certificação nem decisão automática.',
  },
  {
    id: 'missing-critical',
    title: 'Informação crítica ausente',
    text: 'Falta marcar um cuidado essencial para o momento escolhido. O plano não completa a mensagem e não substitui revisão humana.',
  },
  {
    id: 'unreviewed-link',
    title: 'Link não revisado',
    text: 'Local ou caminho precisa de revisão humana antes de qualquer uso. Esta ferramenta não abre, não valida e não encurta endereço.',
  },
  {
    id: 'no-accessible-alt',
    title: 'Ausência de alternativa acessível',
    text: 'Sem marcar acessibilidade e alternativa em caso de falha, o plano não descreve um caminho acessível. Isto não certifica WCAG e não decide o envio.',
  },
] as const);

const GROUPS = Object.freeze([
  {
    id: 'moments',
    legend: 'Momentos da comunicação',
    hintId: 'moments-hint',
    hint: 'Marque um ou mais momentos genéricos. Eles descrevem quando comunicar, sem agendar envio.',
    options: MOMENTS,
  },
  {
    id: 'channels',
    legend: 'Canais de planejamento',
    hintId: 'channels-hint',
    hint: 'Marque canais só como planejamento. Disponibilidade e configuração serão confirmadas depois.',
    options: CHANNELS,
  },
  {
    id: 'needs',
    legend: 'Cuidados de conteúdo',
    hintId: 'needs-hint',
    hint: 'Marque necessidades sem texto livre. Não escreva mensagem, não informe destinatário e não cole endereço.',
    options: NEEDS,
  },
] as const);

const ACTION_CLASS = {
  essential: styles.actionEssential,
  confirm: styles.actionConfirm,
  human: styles.actionHuman,
} as const;

const INITIAL_ANNOUNCEMENT =
  'Nenhuma escolha feita. O resumo aparece quando ao menos um momento e um canal estiverem selecionados.';

function has<T extends string>(values: readonly T[], id: T) {
  return values.includes(id);
}

function toggleOrdered<T extends string>(current: readonly T[], id: T, catalog: readonly { id: T }[]) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return catalog.map((item) => item.id).filter((itemId) => next.has(itemId));
}

export function emptySelection(): PlannerSelection {
  return { moments: [], channels: [], needs: [] };
}

export function isCompleteSelection(selection: PlannerSelection) {
  return selection.moments.length > 0 && selection.channels.length > 0;
}

export function needsDatetime(moments: readonly MomentId[]) {
  return has(moments, 'lembrete') || has(moments, 'confirmacao') || has(moments, 'alteracao');
}

export function needsPlace(moments: readonly MomentId[]) {
  return has(moments, 'acesso') || has(moments, 'alteracao');
}

export function isMissingCritical(selection: PlannerSelection) {
  if (!has(selection.needs, 'assunto')) return true;
  if (needsDatetime(selection.moments) && !has(selection.needs, 'data-horario-fuso')) return true;
  if (needsPlace(selection.moments) && !has(selection.needs, 'local-ou-link')) return true;
  return false;
}

export function riskIdsFor(selection: PlannerSelection): RiskId[] {
  const risks: RiskId[] = [];
  if (has(selection.channels, 'email') || has(selection.channels, 'mensagem-instantanea')) {
    risks.push('consent');
  }
  if (isMissingCritical(selection)) {
    risks.push('missing-critical');
  }
  if (has(selection.needs, 'local-ou-link') || has(selection.moments, 'acesso') || has(selection.moments, 'alteracao')) {
    risks.push('unreviewed-link');
  }
  if (!has(selection.needs, 'acessibilidade') || !has(selection.needs, 'alternativa-falha')) {
    risks.push('no-accessible-alt');
  }
  return risks;
}

export function planCommunication(selection: PlannerSelection) {
  const moments = MOMENTS.filter((item) => has(selection.moments, item.id));
  const channels = CHANNELS.filter((item) => has(selection.channels, item.id));
  const needs = NEEDS.filter((item) => has(selection.needs, item.id));
  if (moments.length === 0 || channels.length === 0) return null;

  const essential = [
    ...moments.map((item) => ({
      id: `moment-${item.id}`,
      title: item.label,
      detail: item.essential,
    })),
    ...needs.map((item) => ({
      id: `need-${item.id}`,
      title: item.label,
      detail: item.essential,
    })),
  ];

  const confirm = [
    {
      id: 'channel-later',
      title: 'Disponibilidade do canal',
      detail: 'A disponibilidade e a configuração dos canais serão confirmadas depois. Esta página não ativa e-mail, área do participante nem mensagem instantânea.',
    },
    ...channels.map((item) => ({
      id: `channel-${item.id}`,
      title: item.label,
      detail: item.confirm,
    })),
  ];

  if (!has(selection.needs, 'assunto')) {
    confirm.push({
      id: 'confirm-assunto',
      title: 'Assunto ainda não marcado',
      detail: 'Assunto claro ainda não foi marcado como cuidado. Confirme o propósito antes de qualquer envio futuro.',
    });
  }
  if (needsDatetime(selection.moments) && !has(selection.needs, 'data-horario-fuso')) {
    confirm.push({
      id: 'confirm-datetime',
      title: 'Quando ainda não marcado',
      detail: 'Data, horário e fuso ainda não foram marcados. Confirme essa informação crítica antes de qualquer envio futuro.',
    });
  }
  if (needsPlace(selection.moments) && !has(selection.needs, 'local-ou-link')) {
    confirm.push({
      id: 'confirm-place',
      title: 'Local ou caminho ainda não marcado',
      detail: 'Local ou link ainda não foi marcado. Confirme o caminho com revisão humana; esta página não valida endereço.',
    });
  }
  if (!has(selection.needs, 'contato-responsavel')) {
    confirm.push({
      id: 'confirm-owner',
      title: 'Contato responsável ainda não marcado',
      detail: 'Confirme depois quem responde pelo aviso. Não informe nome, e-mail ou telefone aqui.',
    });
  }

  const human = [
    {
      id: 'eva-scope',
      title: 'A EVA só orienta',
      detail: 'A EVA pode orientar este plano, mas não aprova nem dispara comunicação nesta ferramenta.',
    },
    {
      id: 'human-send',
      title: 'Envio continua humano',
      detail: 'A pessoa organizadora decide se a comunicação deve existir, quando e por qual finalidade. Não informe destinatário aqui.',
    },
    {
      id: 'no-dispatch',
      title: 'Nada é disparado aqui',
      detail: 'Este resultado não envia, não agenda, não configura template e não coleta contato.',
    },
  ];

  if (has(selection.channels, 'email') || has(selection.channels, 'mensagem-instantanea')) {
    human.push({
      id: 'human-consent',
      title: 'Consentimento e finalidade',
      detail: 'Consentimento e finalidade de um envio futuro continuam decisão humana. Esta página não registra aceite.',
    });
  }

  const risks = RISKS.filter((item) => riskIdsFor(selection).includes(item.id));

  return {
    summary: [
      { key: 'Momentos', value: moments.map((item) => item.label).join(', ') },
      { key: 'Canais', value: channels.map((item) => item.label).join(', ') },
      { key: 'Cuidados', value: needs.length > 0 ? needs.map((item) => item.label).join(', ') : 'Nenhum cuidado marcado' },
    ],
    sections: [
      { ...ACTION_LEVELS.essential, items: essential },
      { ...ACTION_LEVELS.confirm, items: confirm },
      { ...ACTION_LEVELS.human, items: human },
    ],
    risks,
    announcement:
      `Resumo atualizado: ${moments.length} ${moments.length === 1 ? 'momento' : 'momentos'}, ${channels.length} ${channels.length === 1 ? 'canal' : 'canais'}, ${needs.length} ${needs.length === 1 ? 'cuidado' : 'cuidados'}. ${risks.length} ${risks.length === 1 ? 'orientação de risco' : 'orientações de risco'}. Este resultado não envia, não agenda e não configura comunicação.`,
  };
}

export default function CommunicationPlanner() {
  const [selection, setSelection] = useState(emptySelection);
  const [restarted, setRestarted] = useState(false);

  const plan = useMemo(() => planCommunication(selection), [selection]);

  const announcement = useMemo(() => {
    if (selection.moments.length === 0 && selection.channels.length === 0 && selection.needs.length === 0) {
      return restarted
        ? 'Planejamento reiniciado. Nenhum resumo está visível.'
        : INITIAL_ANNOUNCEMENT;
    }
    if (!plan) {
      return 'Atualização: ainda faltam escolhas. Selecione ao menos um momento e um canal.';
    }
    return plan.announcement;
  }, [selection, plan, restarted]);

  function toggle(groupId: 'moments' | 'channels' | 'needs', id: string) {
    setSelection((current) => {
      if (groupId === 'moments') {
        return { ...current, moments: toggleOrdered(current.moments, id as MomentId, MOMENTS) };
      }
      if (groupId === 'channels') {
        return { ...current, channels: toggleOrdered(current.channels, id as ChannelId, CHANNELS) };
      }
      return { ...current, needs: toggleOrdered(current.needs, id as NeedId, NEEDS) };
    });
  }

  function restart() {
    setSelection(emptySelection());
    setRestarted(true);
  }

  return <section className={styles.planner} aria-labelledby="planner-title">
    <h2 id="planner-title">Montar o plano mínimo de comunicação</h2>
    <p className={styles.plannerLead}>
      Use opções fechadas. Não há campo livre, destinatário ou texto da mensagem.
      O resultado só aparece depois de um momento e um canal e permanece só na memória desta página.
    </p>

    {GROUPS.map((group) => <fieldset key={group.id} className={styles.group} aria-describedby={group.hintId}>
      <legend>{group.legend}</legend>
      <p className={styles.fieldHint} id={group.hintId}>{group.hint}</p>
      {group.options.map((option) => {
        const selected = has(selection[group.id], option.id as never);
        return <div key={option.id} className={styles.option}>
          <input
            id={`${group.id}-${option.id}`}
            type="checkbox"
            checked={selected}
            onChange={() => toggle(group.id, option.id)}
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
        <h3 id="summary-title">Resumo do plano</h3>
        <button type="button" className={styles.resetButton} onClick={restart}>
          Reiniciar planejamento
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
            O resumo separa conteúdo essencial, o que confirmar antes de enviar
            e a decisão humana. Os três níveis aparecem por texto, ícone e estilo
            de borda, nunca só por cor. Nada disso envia ou configura comunicação.
          </p>

          <ul className={styles.levelLegend} aria-label="Níveis de ação">
            {Object.values(ACTION_LEVELS).map((level) => <li
              key={level.id}
              className={`${styles.levelItem} ${ACTION_CLASS[level.id]}`}
            >
              <span className={styles.attentionIcon} aria-hidden="true">{level.icon}</span>
              <span>{level.label}</span>
            </li>)}
          </ul>

          {plan.sections.map((section) => <section
            key={section.id}
            className={`${styles.actionSection} ${ACTION_CLASS[section.id]}`}
            data-nivel={section.id}
            aria-labelledby={`nivel-${section.id}-title`}
          >
            <h4 id={`nivel-${section.id}-title`} className={styles.checkpointHead}>
              <span className={styles.attentionIcon} aria-hidden="true">{section.icon}</span>
              <span className={styles.attentionLabel}>{section.label}</span>
            </h4>
            <ol className={styles.checkpoints}>
              {section.items.map((item) => <li key={item.id} className={styles.checkpoint}>
                <p className={styles.checkpointTitle}>{item.title}</p>
                <p className={styles.checkpointDetail}>{item.detail}</p>
              </li>)}
            </ol>
          </section>)}

          <section className={styles.risks} aria-labelledby="risks-title">
            <h4 id="risks-title">Orientações de risco</h4>
            {plan.risks.length > 0 ? <ul className={styles.riskList}>
              {plan.risks.map((risk) => <li key={risk.id} className={styles.risk} data-risk={risk.id}>
                <p className={styles.checkpointHead}>
                  <span className={styles.attentionIcon} aria-hidden="true">!</span>
                  <span className={styles.attentionLabel}>Orientação de risco</span>
                  <span className={styles.checkpointTitle}>{risk.title}</span>
                </p>
                <p className={styles.checkpointDetail}>{risk.text}</p>
              </li>)}
            </ul> : <p className={styles.resultNote}>
              Nenhum risco automático foi sinalizado. A ausência de alerta não
              certifica o envio nem a conformidade.
            </p>}
          </section>
        </> : <p className={styles.resultNote}>
          Selecione ao menos um momento e um canal para ver o resumo determinístico.
          Os cuidados de conteúdo são opcionais e alteram riscos e confirmações.
        </p>}
      </div>
    </div>
  </section>;
}
