'use client';

import { useMemo, useState } from 'react';
import styles from './planejar-ficha.module.css';

export const PLAN_LABELS = Object.freeze({
  minimum: 'só o mínimo recomendado',
  optional: 'mínimo e categorias opcionais',
  justify: 'há itens que exigem justificativa',
});

export const MINIMUM_FIELDS = Object.freeze([
  {
    id: 'nome-completo',
    label: 'Nome completo',
    purpose: 'Identificar a pessoa inscrita na lista e no atendimento, quando o evento precisa desse reconhecimento.',
  },
  {
    id: 'tratamento',
    label: 'Como deseja ser chamado',
    purpose: 'Respeitar o tratamento na credencial e na comunicação, sem substituir documento.',
  },
  {
    id: 'email',
    label: 'E-mail',
    purpose: 'Devolver a inscrição e enviar avisos operacionais do próprio evento, se essa finalidade existir.',
  },
]);

export const OPTIONAL_GROUPS = Object.freeze([
  {
    id: 'operacao',
    legend: 'Operação do evento',
    items: [
      {
        id: 'categoria-inscricao',
        label: 'Categoria de inscrição',
        purpose: 'Distinguir lotes ou públicos que o evento já oferece, sem inventar categorias nesta página.',
        sensitive: false,
        excessive: false,
      },
      {
        id: 'instituicao',
        label: 'Instituição ou vínculo',
        purpose: 'Apoiar crachá ou programação quando o evento realmente usa esse dado no dia.',
        sensitive: false,
        excessive: false,
      },
      {
        id: 'trilha',
        label: 'Atividade ou trilha já oferecida',
        purpose: 'Alocar vaga em atividade existente. Não peça preferência genérica sem oferta correspondente.',
        sensitive: false,
        excessive: false,
      },
      {
        id: 'acessibilidade',
        label: 'Necessidade de acessibilidade',
        purpose: 'Preparar atendimento concreto. Não serve para perfilar nem para declarar conformidade.',
        sensitive: false,
        excessive: false,
      },
    ],
  },
  {
    id: 'logistica',
    legend: 'Logística e contato extra',
    items: [
      {
        id: 'alimentacao',
        label: 'Restrição alimentar',
        purpose: 'Só faz sentido se houver refeição oferecida. Sem refeição, o pedido tende a ser excessivo.',
        sensitive: false,
        excessive: true,
      },
      {
        id: 'telefone',
        label: 'Telefone',
        purpose: 'Contato urgente além do e-mail. Sem operação que dependa de ligação, o pedido tende a ser excessivo.',
        sensitive: false,
        excessive: true,
      },
      {
        id: 'endereco',
        label: 'Endereço ou CEP',
        purpose: 'Logística presencial ou envio físico. Sem essa finalidade, o pedido tende a ser excessivo.',
        sensitive: false,
        excessive: true,
      },
    ],
  },
  {
    id: 'justificativa',
    legend: 'Dados que exigem justificativa',
    items: [
      {
        id: 'documento',
        label: 'Documento de identificação',
        purpose: 'CPF, RG ou passaporte só entram com necessidade e autorização comprovadas. Na dúvida, não peça.',
        sensitive: true,
        excessive: true,
      },
      {
        id: 'nascimento',
        label: 'Data de nascimento',
        purpose: 'Idade só entra se houver restrição etária real. Caso contrário, o pedido tende a ser excessivo.',
        sensitive: false,
        excessive: true,
      },
      {
        id: 'foto',
        label: 'Foto da pessoa',
        purpose: 'Imagem da pessoa inscrita. Sem credencial com foto ou finalidade equivalente, o pedido tende a ser excessivo.',
        sensitive: false,
        excessive: true,
      },
      {
        id: 'genero',
        label: 'Gênero ou identidade',
        purpose: 'Dado que pode ser sensível. Só planeje se a finalidade for explícita e proporcional.',
        sensitive: true,
        excessive: false,
      },
      {
        id: 'saude',
        label: 'Saúde ou biometria',
        purpose: 'Saúde, condição clínica ou biometria. Sem necessidade e autorização comprovadas, não peça.',
        sensitive: true,
        excessive: true,
      },
    ],
  },
]);

export function emptySelection(): Record<string, boolean> {
  const selected: Record<string, boolean> = {};
  for (const group of OPTIONAL_GROUPS) {
    for (const item of group.items) {
      selected[item.id] = false;
    }
  }
  return selected;
}

export function requiresJustification(item: { sensitive: boolean; excessive: boolean }) {
  return item.sensitive === true || item.excessive === true;
}

export function buildPlan(selected: Record<string, boolean>) {
  const optionals = OPTIONAL_GROUPS.flatMap((group) => group.items);
  const chosen = optionals.filter((item) => selected[item.id] === true);
  const optional = chosen.filter((item) => !requiresJustification(item));
  const justification = chosen.filter((item) => requiresJustification(item));
  let status: 'minimum' | 'optional' | 'justify' = 'minimum';
  if (justification.length > 0) {
    status = 'justify';
  } else if (optional.length > 0) {
    status = 'optional';
  }
  return {
    status,
    label: PLAN_LABELS[status],
    minimum: MINIMUM_FIELDS,
    optional,
    justification,
    minimumCount: MINIMUM_FIELDS.length,
    optionalCount: optional.length,
    justificationCount: justification.length,
    selectedCount: chosen.length,
  };
}

const PLAN_ICONS = {
  minimum: '○',
  optional: '✓',
  justify: '!',
} as const;

const PLAN_CLASS = {
  minimum: styles.planMinimum,
  optional: styles.planOptional,
  justify: styles.planJustify,
};

function flagLabel(item: { sensitive: boolean; excessive: boolean }) {
  if (item.sensitive && item.excessive) return 'Sensível e potencialmente excessivo';
  if (item.sensitive) return 'Coleta sensível';
  if (item.excessive) return 'Potencialmente excessivo';
  return '';
}

export default function RegistrationPlanner() {
  const [selected, setSelected] = useState(emptySelection);

  const plan = useMemo(() => buildPlan(selected), [selected]);

  function toggle(id: string) {
    setSelected((current) => ({ ...current, [id]: !current[id] }));
  }

  function resetPlan() {
    setSelected(emptySelection());
  }

  return <section className={styles.planner} aria-labelledby="planner-title">
    <h2 id="planner-title">Planejador local da ficha mínima</h2>
    <p className={styles.plannerLead}>
      Os três campos mínimos permanecem no resumo. Marque só categorias
      contextuais com finalidade. Não há campo de texto nem envio.
    </p>

    <div className={`${styles.summary} ${PLAN_CLASS[plan.status]}`}>
      <div className={styles.summaryHead}>
        <h3 id="summary-title">Resumo do plano</h3>
        <button type="button" className={styles.resetButton} onClick={resetPlan}>
          Reiniciar plano
        </button>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" aria-labelledby="summary-title">
        <p className={styles.planLabel} data-plan={plan.status}>
          <span className={styles.planIcon} aria-hidden="true">{PLAN_ICONS[plan.status]}</span>
          {plan.label}
        </p>
        <p className={styles.planCount}>
          {plan.minimumCount} campos mínimos.
          {' '}{plan.optionalCount} {plan.optionalCount === 1 ? 'categoria opcional' : 'categorias opcionais'}.
          {' '}{plan.justificationCount} {plan.justificationCount === 1 ? 'item exige justificativa' : 'itens exigem justificativa'}.
        </p>
        {plan.justificationCount > 0 ? <p className={styles.planWarning}>
          Há itens selecionados que pedem justificativa de finalidade. O aviso
          não bloqueia o planejamento e não é aconselhamento jurídico.
        </p> : null}
        <p className={styles.listHeading}>Mínimo recomendado — Não pode ser removido</p>
        <ul className={styles.planList}>
          {plan.minimum.map((item) => <li key={item.id}>{item.label}</li>)}
        </ul>
        {plan.optional.length > 0 ? <>
          <p className={styles.listHeading}>Opcional com finalidade operacional</p>
          <ul className={styles.planList}>
            {plan.optional.map((item) => <li key={item.id}>{item.label}</li>)}
          </ul>
        </> : null}
        {plan.justification.length > 0 ? <>
          <p className={styles.listHeading}>Exige justificativa — não bloqueia o uso</p>
          <ul className={styles.planList}>
            {plan.justification.map((item) => <li key={item.id}>
              {item.label}
              {item.sensitive ? ' — coleta sensível' : ''}
              {item.excessive ? ' — potencialmente excessivo' : ''}
            </li>)}
          </ul>
        </> : null}
      </div>
    </div>

    <fieldset className={styles.group}>
      <legend>Campos mínimos recomendados</legend>
      <p className={styles.groupLead}>
        Estes três campos já entram no plano de planejamento. Não podem ser
        removidos do resumo. Não são campos para preencher dados reais aqui.
      </p>
      {MINIMUM_FIELDS.map((item) => <div key={item.id} className={styles.item}>
        <span className={styles.lockMark} aria-hidden="true">●</span>
        <div>
          <p className={styles.itemTitle}>
            {item.label}
            <span className={styles.fixedBadge}>Fixo no plano mínimo</span>
          </p>
          <p className={styles.itemHelp}>{item.purpose}</p>
        </div>
      </div>)}
    </fieldset>

    {OPTIONAL_GROUPS.map((group) => <fieldset key={group.id} className={styles.group}>
      <legend>{group.legend}</legend>
      {group.items.map((item) => <div key={item.id} className={styles.item}>
        <input
          id={item.id}
          type="checkbox"
          checked={selected[item.id] === true}
          onChange={() => toggle(item.id)}
        />
        <label htmlFor={item.id}>
          <span className={styles.itemTitle}>
            {item.label}
            {item.sensitive ? <span className={styles.sensitiveBadge}>Coleta sensível</span> : null}
            {item.excessive ? <span className={styles.excessiveBadge}>Potencialmente excessivo</span> : null}
          </span>
          <span className={styles.itemHelp}>{item.purpose}</span>
          {requiresJustification(item) ? <span className={styles.itemFlag}>
            {flagLabel(item)}. Peça justificativa de finalidade sem bloquear o planejamento.
          </span> : null}
        </label>
      </div>)}
    </fieldset>)}
  </section>;
}
