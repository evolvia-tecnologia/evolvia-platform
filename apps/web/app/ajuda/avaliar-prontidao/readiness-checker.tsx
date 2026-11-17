'use client';

import { useMemo, useState } from 'react';
import styles from './avaliar-prontidao.module.css';

export const RESULT_LABELS = Object.freeze({
  start: 'começar revisão',
  review: 'revisão necessária',
  ready: 'pronto para decisão humana',
});

export const READINESS_GROUPS = Object.freeze([
  {
    id: 'identity',
    legend: 'Identidade e público',
    items: [
      {
        id: 'identity-name',
        label: 'Nome e tipo do evento estão definidos',
        help: 'A pessoa visitante consegue entender o que é o evento sem sigla interna nem nome de projeto.',
        critical: false,
      },
      {
        id: 'identity-audience',
        label: 'Público-alvo está descrito',
        help: 'Está claro se o evento é aberto, restrito ou por convite, sem listar pessoas.',
        critical: false,
      },
    ],
  },
  {
    id: 'schedule',
    legend: 'Data, local e fuso',
    items: [
      {
        id: 'schedule-coherent',
        label: 'Data, horário, local e fuso estão coerentes',
        help: 'Os mesmos dados aparecem juntos, sem conflito entre canais. Pendência neste critério crítico impede o estado final.',
        critical: true,
      },
      {
        id: 'schedule-format',
        label: 'Formato e acesso estão descritos',
        help: 'Presencial, online ou híbrido está explícito, com local ou meio de acesso previsto.',
        critical: false,
      },
    ],
  },
  {
    id: 'content',
    legend: 'Conteúdo e programação',
    items: [
      {
        id: 'content-program',
        label: 'Conteúdo ou programação mínima está descrita',
        help: 'Há o suficiente para a pessoa decidir se o evento lhe diz respeito, sem prometer grade ainda inexistente.',
        critical: false,
      },
      {
        id: 'content-honest',
        label: 'O texto não promete o que ainda não existe',
        help: 'Não afirme inscrição aberta, homologação concluída ou publicação feita sem evidência humana.',
        critical: false,
      },
    ],
  },
  {
    id: 'privacy',
    legend: 'Ficha mínima e privacidade',
    items: [
      {
        id: 'privacy-minimum',
        label: 'A ficha prevista pede só o necessário',
        help: 'Planeje campos proporcionais à finalidade. Esta página não coleta dado e não abre a ficha real.',
        critical: false,
      },
      {
        id: 'privacy-review',
        label: 'Avisos de privacidade foram revisados localmente',
        help: 'Esta marcação não certifica LGPD. Confirme se a minuta pública e a finalidade dos dados foram lidas.',
        critical: true,
      },
    ],
  },
  {
    id: 'media',
    legend: 'Mídia e acessibilidade',
    items: [
      {
        id: 'media-alt',
        label: 'Mídia prevista tem alternativa textual',
        help: 'Imagens de divulgação devem ter texto alternativo antes de qualquer publicação.',
        critical: false,
      },
      {
        id: 'a11y-minimum',
        label: 'Acessibilidade mínima foi conferida localmente',
        help: 'Teclado, foco visível, contraste e alternativa de mídia. Esta marcação não certifica WCAG.',
        critical: true,
      },
    ],
  },
  {
    id: 'owners',
    legend: 'Responsáveis e contatos',
    items: [
      {
        id: 'owner-defined',
        label: 'Há pessoa responsável pela decisão',
        help: 'Alguém autorizado vai revisar e decidir. Não informe nome, e-mail ou telefone nesta página.',
        critical: true,
      },
      {
        id: 'contact-planned',
        label: 'Canal de contato público está previsto',
        help: 'O canal deve existir na página do evento, não aqui. Não invente contato nesta ferramenta.',
        critical: false,
      },
    ],
  },
  {
    id: 'authorization',
    legend: 'Prévia e autorização humana',
    items: [
      {
        id: 'preview-reviewed',
        label: 'A prévia foi conferida por uma pessoa',
        help: 'Ler a prévia não homologa e não publica. A prévia só mostra o que o público veria.',
        critical: false,
      },
      {
        id: 'human-auth',
        label: 'Há autorização humana explícita para o próximo passo',
        help: 'Só uma pessoa autorizada pode homologar ou publicar. Esta ferramenta não faz nenhuma das duas ações.',
        critical: true,
      },
    ],
  },
]);

export function emptyAnswers(): Record<string, boolean> {
  const answers: Record<string, boolean> = {};
  for (const group of READINESS_GROUPS) {
    for (const item of group.items) {
      answers[item.id] = false;
    }
  }
  return answers;
}

export function evaluateReadiness(answers: Record<string, boolean>) {
  const items = READINESS_GROUPS.flatMap((group) => group.items);
  const pending = items.filter((item) => answers[item.id] !== true);
  const pendingCritical = pending.filter((item) => item.critical);
  const checkedCount = items.length - pending.length;
  const totalCount = items.length;
  let status: 'start' | 'review' | 'ready' = 'review';
  if (checkedCount === 0) {
    status = 'start';
  } else if (pendingCritical.length > 0) {
    status = 'review';
  } else if (pending.length > 0) {
    status = 'review';
  } else {
    status = 'ready';
  }
  return {
    status,
    label: RESULT_LABELS[status],
    checkedCount,
    totalCount,
    pending: pending.map((item) => ({ id: item.id, label: item.label, critical: item.critical })),
    pendingCritical: pendingCritical.map((item) => ({ id: item.id, label: item.label, critical: item.critical })),
  };
}

const RESULT_ICONS = {
  start: '○',
  review: '!',
  ready: '✓',
} as const;

const RESULT_CLASS = {
  start: styles.resultStart,
  review: styles.resultReview,
  ready: styles.resultReady,
};

export default function ReadinessChecker() {
  const [answers, setAnswers] = useState(emptyAnswers);

  const result = useMemo(() => evaluateReadiness(answers), [answers]);

  function toggle(id: string) {
    setAnswers((current) => ({ ...current, [id]: !current[id] }));
  }

  function clearAnswers() {
    setAnswers(emptyAnswers());
  }

  return <section className={styles.checker} aria-labelledby="checker-title">
    <h2 id="checker-title">Checklist local de prontidão</h2>
    <p className={styles.checkerLead}>
      Cada item tem um rótulo e uma explicação curta. Não há campo livre.
      Marcar um critério crítico é leitura local, não certificado.
    </p>

    <div className={`${styles.result} ${RESULT_CLASS[result.status]}`}>
      <div className={styles.resultHead}>
        <h3 id="summary-title">Resultado orientativo</h3>
        <button type="button" className={styles.clearButton} onClick={clearAnswers}>
          Limpar respostas
        </button>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" aria-labelledby="summary-title">
        <p className={styles.resultLabel} data-result={result.status}>
          <span className={styles.resultIcon} aria-hidden="true">{RESULT_ICONS[result.status]}</span>
          {result.label}
        </p>
        <p className={styles.resultCount}>
          {result.checkedCount} de {result.totalCount} critérios marcados.
          {result.pending.length === 0
            ? ' Não há pendências neste checklist local.'
            : ` ${result.pending.length} pendência(s).`}
        </p>
        {result.status === 'ready' ? <p className={styles.resultNote}>
          Estado final apenas desta leitura: pronto para decisão humana.
          Continua sem homologar, sem certificar WCAG ou LGPD e sem publicar.
        </p> : null}
        {result.pending.length > 0 ? <ul className={styles.pendingList}>
          {result.pending.map((item) => <li key={item.id}>
            {item.label}
            {item.critical ? ' — critério crítico' : ''}
          </li>)}
        </ul> : null}
      </div>
    </div>

    {READINESS_GROUPS.map((group) => <fieldset key={group.id} className={styles.group}>
      <legend>{group.legend}</legend>
      {group.items.map((item) => <div key={item.id} className={styles.item}>
        <input
          id={item.id}
          type="checkbox"
          checked={answers[item.id] === true}
          onChange={() => toggle(item.id)}
        />
        <label htmlFor={item.id}>
          <span className={styles.itemTitle}>
            {item.label}
            {item.critical ? <span className={styles.critical}>Critério crítico</span> : null}
          </span>
          <span className={styles.itemHelp}>{item.help}</span>
        </label>
      </div>)}
    </fieldset>)}
  </section>;
}
