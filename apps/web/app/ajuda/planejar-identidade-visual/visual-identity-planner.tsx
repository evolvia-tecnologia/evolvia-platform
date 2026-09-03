'use client';

import { useMemo, useState } from 'react';
import styles from './planejar-identidade-visual.module.css';

export type ElementId =
  | 'nome-publico'
  | 'logotipo'
  | 'paleta'
  | 'tipografia'
  | 'imagem-principal'
  | 'alternativas-textuais'
  | 'direitos-de-uso'
  | 'versoes-fundos';

export type ReadinessId = 'pronto-para-revisar' | 'ainda-falta' | 'nao-se-aplica';
export type PlannerChoices = Record<ElementId, ReadinessId | ''>;
export type StopRuleId =
  | 'imagem-sem-direito'
  | 'info-so-imagem-cor'
  | 'contraste-nao-verificado'
  | 'logotipo-ilegivel'
  | 'ausencia-alternativa-textual';

export const BUCKETS = Object.freeze({
  ready: Object.freeze({ id: 'ready', label: 'Pronto para revisão', icon: '✓' }),
  adjust: Object.freeze({ id: 'adjust', label: 'Precisa de ajuste', icon: '○' }),
  stop: Object.freeze({ id: 'stop', label: 'Pare e confirme', icon: '!' }),
});

export const READINESS_OPTIONS = Object.freeze([
  {
    id: 'pronto-para-revisar',
    label: 'Pronto para revisar',
    help: 'Há material genérico separado para a revisão humana. Isso não valida marca nem acessibilidade.',
  },
  {
    id: 'ainda-falta',
    label: 'Ainda falta',
    help: 'O elemento ainda não está separado ou ainda precisa de ajuste antes da revisão.',
  },
  {
    id: 'nao-se-aplica',
    label: 'Não se aplica',
    help: 'Este elemento não entra no planejamento deste evento. A escolha não configura o evento.',
  },
] as const);

export const IDENTITY_ELEMENTS = Object.freeze([
  {
    id: 'nome-publico',
    legend: 'Nome público',
    purpose: 'Confirme se o nome que o público lê já está separado para revisão. Não escreva o nome da marca nesta página.',
  },
  {
    id: 'logotipo',
    legend: 'Logotipo',
    purpose: 'Confirme se há um logotipo genérico separado para revisão. Não envie arquivo e não descreva o desenho.',
  },
  {
    id: 'paleta',
    legend: 'Paleta',
    purpose: 'Confirme se há cores previstas para revisão humana. Não informe código de cor nem escolha paleta aqui.',
  },
  {
    id: 'tipografia',
    legend: 'Tipografia',
    purpose: 'Confirme se há família tipográfica prevista para revisão. Não nomeie fonte nem tamanho.',
  },
  {
    id: 'imagem-principal',
    legend: 'Imagem principal',
    purpose: 'Confirme se há imagem de divulgação prevista para revisão. Não envie arquivo, recorte ou endereço.',
  },
  {
    id: 'alternativas-textuais',
    legend: 'Alternativas textuais',
    purpose: 'Confirme se o essencial das imagens já tem texto equivalente. Não escreva a alternativa aqui.',
  },
  {
    id: 'direitos-de-uso',
    legend: 'Direitos de uso',
    purpose: 'Confirme se logotipo e imagem têm autorização de uso. Esta página não analisa direito autoral.',
  },
  {
    id: 'versoes-fundos',
    legend: 'Versões para fundos claro e escuro',
    purpose: 'Confirme se logotipo e cores foram previstos para fundo claro e fundo escuro. Não invente contraste numérico.',
  },
] as const);

export const STOP_RULES = Object.freeze([
  {
    id: 'imagem-sem-direito',
    title: 'Imagem sem direito de uso',
    detail: 'Há logotipo ou imagem marcada como pronta sem direito de uso confirmado. Pare e confirme a autorização com a pessoa responsável. Esta página não analisa copyright e não libera o arquivo.',
  },
  {
    id: 'info-so-imagem-cor',
    title: 'Informação transmitida só por imagem ou cor',
    detail: 'A paleta ou a imagem principal foi marcada como pronta, mas a alternativa textual ainda não foi confirmada. Informação só por cor ou imagem pode excluir quem não vê o visual. Confirme um equivalente em texto, sem certificar acessibilidade.',
  },
  {
    id: 'contraste-nao-verificado',
    title: 'Contraste não verificado',
    detail: 'Há paleta, tipografia ou logotipo marcado como pronto, mas as versões para fundo claro e escuro ainda faltam. Verifique a leitura nos dois fundos, sem número de contraste e sem selo WCAG.',
  },
  {
    id: 'logotipo-ilegivel',
    title: 'Logotipo ilegível',
    detail: 'O logotipo foi marcado como pronto, mas ainda faltam versões para fundo claro e fundo escuro. Confirme se o sinal permanece reconhecível nos dois fundos, sem inventar dimensão ou recorte.',
  },
  {
    id: 'ausencia-alternativa-textual',
    title: 'Ausência de alternativa textual',
    detail: 'Há logotipo ou imagem marcada como pronta sem alternativa textual confirmada. Pare e confirme um equivalente em texto antes de avançar. Esta leitura não certifica acessibilidade.',
  },
] as const);

const BUCKET_CLASS = {
  ready: styles.bucketReady,
  adjust: styles.bucketAdjust,
  stop: styles.bucketStop,
} as const;

const INITIAL_ANNOUNCEMENT =
  'Nenhuma escolha feita. Marque o estado de cada elemento para separar o que está pronto para revisão, o que precisa de ajuste e o que pede para parar e confirmar.';

export function emptyChoices(): PlannerChoices {
  return {
    'nome-publico': '',
    logotipo: '',
    paleta: '',
    tipografia: '',
    'imagem-principal': '',
    'alternativas-textuais': '',
    'direitos-de-uso': '',
    'versoes-fundos': '',
  };
}

function isReady(choices: PlannerChoices, id: ElementId) {
  return choices[id] === 'pronto-para-revisar';
}

function isMissing(choices: PlannerChoices, id: ElementId) {
  return choices[id] === 'ainda-falta';
}

function lacksConfirmation(choices: PlannerChoices, id: ElementId) {
  return choices[id] === 'ainda-falta' || choices[id] === 'nao-se-aplica';
}

function hasVisualAssetReady(choices: PlannerChoices) {
  return isReady(choices, 'imagem-principal') || isReady(choices, 'logotipo');
}

export function stopRuleActive(id: StopRuleId, choices: PlannerChoices) {
  if (id === 'imagem-sem-direito') {
    return hasVisualAssetReady(choices) && lacksConfirmation(choices, 'direitos-de-uso');
  }
  if (id === 'info-so-imagem-cor') {
    return (isReady(choices, 'paleta') || isReady(choices, 'imagem-principal'))
      && lacksConfirmation(choices, 'alternativas-textuais');
  }
  if (id === 'contraste-nao-verificado') {
    return (isReady(choices, 'paleta') || isReady(choices, 'tipografia') || isReady(choices, 'logotipo'))
      && isMissing(choices, 'versoes-fundos');
  }
  if (id === 'logotipo-ilegivel') {
    return isReady(choices, 'logotipo') && isMissing(choices, 'versoes-fundos');
  }
  return hasVisualAssetReady(choices) && lacksConfirmation(choices, 'alternativas-textuais');
}

export function planVisualIdentity(choices: PlannerChoices) {
  const ready = IDENTITY_ELEMENTS.filter((element) => choices[element.id] === 'pronto-para-revisar');
  const adjust = IDENTITY_ELEMENTS.filter((element) => choices[element.id] === 'ainda-falta');
  const skipped = IDENTITY_ELEMENTS.filter((element) => choices[element.id] === 'nao-se-aplica');
  const pending = IDENTITY_ELEMENTS.filter((element) => choices[element.id] === '');
  const stop = STOP_RULES.filter((rule) => stopRuleActive(rule.id, choices));
  const answered = IDENTITY_ELEMENTS.length - pending.length;

  return {
    ready,
    adjust,
    skipped,
    pending,
    stop,
    answered,
    announcement:
      `Resumo atualizado: ${ready.length} pronto para revisão, ${adjust.length} precisa de ajuste, ${stop.length} pare e confirme. Esta ferramenta não valida marca, não certifica acessibilidade, não faz upload e não altera o evento.`,
  };
}

export default function VisualIdentityPlanner() {
  const [choices, setChoices] = useState(emptyChoices);
  const [restarted, setRestarted] = useState(false);

  const plan = useMemo(() => planVisualIdentity(choices), [choices]);

  const announcement = useMemo(() => {
    if (plan.answered === 0) {
      return restarted
        ? 'Planejamento reiniciado. Nenhuma escolha permanece visível.'
        : INITIAL_ANNOUNCEMENT;
    }
    return plan.announcement;
  }, [plan, restarted]);

  function select(elementId: ElementId, value: ReadinessId) {
    setChoices((current) => ({ ...current, [elementId]: value }));
  }

  function restart() {
    setChoices(emptyChoices());
    setRestarted(true);
  }

  return <section className={styles.planner} aria-labelledby="planner-title">
    <h2 id="planner-title">Preparação da identidade visual</h2>
    <p className={styles.plannerLead}>
      Cada grupo usa só três escolhas fechadas: pronto para revisar, ainda falta
      e não se aplica. Não há campo livre, envio de arquivo nem persistência.
      O resumo permanece só na memória desta página.
    </p>

    <div className={`${styles.result} ${plan.answered > 0 ? styles.resultReady : styles.resultStart}`}>
      <div className={styles.resultHead}>
        <h3 id="summary-title">Resumo do planejamento</h3>
        <button type="button" className={styles.resetButton} onClick={restart}>
          Reiniciar planejamento
        </button>
      </div>

      <div role="status" aria-live="polite" aria-atomic="true" aria-labelledby="summary-title">
        <p className={styles.announcement}>{announcement}</p>

        <p className={styles.resultNote}>
          Os três estados aparecem por texto, ícone e estilo de borda, nunca só por cor.
          Itens em não se aplica não entram nos grupos de revisão.
          Nada disso valida marca, certifica acessibilidade, faz upload ou altera o evento.
        </p>

        <ul className={styles.levelLegend} aria-label="Estados do resumo">
          {Object.values(BUCKETS).map((bucket) => <li
            key={bucket.id}
            className={`${styles.levelItem} ${BUCKET_CLASS[bucket.id]}`}
          >
            <span className={styles.bucketIcon} aria-hidden="true">{bucket.icon}</span>
            <span>{bucket.label}</span>
          </li>)}
        </ul>

        <div className={styles.buckets}>
          <section
            className={`${styles.bucket} ${styles.bucketReady}`}
            aria-labelledby="bucket-ready-title"
            data-bucket="ready"
          >
            <h4 id="bucket-ready-title" className={styles.bucketTitle}>
              <span className={styles.bucketIcon} aria-hidden="true">{BUCKETS.ready.icon}</span>
              {BUCKETS.ready.label}
            </h4>
            {plan.ready.length === 0 ? <p className={styles.bucketEmpty}>
              Nenhum elemento pronto para revisão ainda.
            </p> : <ul className={styles.bucketList}>
              {plan.ready.map((item) => <li key={item.id}>{item.legend}</li>)}
            </ul>}
          </section>

          <section
            className={`${styles.bucket} ${styles.bucketAdjust}`}
            aria-labelledby="bucket-adjust-title"
            data-bucket="adjust"
          >
            <h4 id="bucket-adjust-title" className={styles.bucketTitle}>
              <span className={styles.bucketIcon} aria-hidden="true">{BUCKETS.adjust.icon}</span>
              {BUCKETS.adjust.label}
            </h4>
            {plan.adjust.length === 0 ? <p className={styles.bucketEmpty}>
              Nenhum elemento precisa de ajuste neste momento.
            </p> : <ul className={styles.bucketList}>
              {plan.adjust.map((item) => <li key={item.id}>{item.legend}</li>)}
            </ul>}
          </section>

          <section
            className={`${styles.bucket} ${styles.bucketStop}`}
            aria-labelledby="bucket-stop-title"
            data-bucket="stop"
          >
            <h4 id="bucket-stop-title" className={styles.bucketTitle}>
              <span className={styles.bucketIcon} aria-hidden="true">{BUCKETS.stop.icon}</span>
              {BUCKETS.stop.label}
            </h4>
            {plan.stop.length === 0 ? <p className={styles.bucketEmpty}>
              Nenhuma regra de parada ativa neste momento.
            </p> : <ul className={styles.stopList}>
              {plan.stop.map((rule) => <li key={rule.id} data-stop-rule={rule.id}>
                <span className={styles.stopTitle}>{rule.title}</span>
                <span className={styles.stopDetail}>{rule.detail}</span>
              </li>)}
            </ul>}
          </section>
        </div>
      </div>
    </div>

    {IDENTITY_ELEMENTS.map((element) => <fieldset
      key={element.id}
      className={styles.group}
      aria-describedby={`${element.id}-purpose`}
    >
      <legend>{element.legend}</legend>
      <p className={styles.fieldHint} id={`${element.id}-purpose`}>{element.purpose}</p>
      {READINESS_OPTIONS.map((option) => {
        const selected = choices[element.id] === option.id;
        return <div key={option.id} className={styles.option}>
          <input
            id={`${element.id}-${option.id}`}
            type="radio"
            name={`visual-identity-${element.id}`}
            checked={selected}
            onChange={() => select(element.id, option.id)}
          />
          <label htmlFor={`${element.id}-${option.id}`}>
            <span className={styles.optionTitle}>
              {option.label}
              {selected ? <span className={styles.selectedMark}>Selecionado</span> : null}
            </span>
            <span className={styles.optionHelp}>{option.help}</span>
          </label>
        </div>;
      })}
    </fieldset>)}
  </section>;
}
