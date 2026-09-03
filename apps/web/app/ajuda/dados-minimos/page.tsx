import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import styles from './dados-minimos.module.css';

export const metadata: Metadata = {
  title: 'Dados mínimos da ficha',
  description: 'Roteiro público e estático para planejar uma ficha de inscrição mínima e proporcional, sem coletar dados nem oferecer aconselhamento jurídico.',
  robots: { index: false, follow: false },
};

const SCRIPT = [
  {
    id: 'finalidade',
    title: 'Finalidade',
    summary: 'Escreva para que o dado existe. Sem finalidade clara, o campo não entra na ficha.',
  },
  {
    id: 'necessidade',
    title: 'Necessidade',
    summary: 'Pergunte se o dado é indispensável para essa finalidade ou apenas conveniente.',
  },
  {
    id: 'publico',
    title: 'Público',
    summary: 'Descreva quem responde a ficha — aberto, restrito ou por convite — sem coletar esse dado aqui.',
  },
  {
    id: 'obrigatorio-opcional',
    title: 'Dado obrigatório ou opcional',
    summary: 'Obrigatório fica só o mínimo. O restante, se existir, permanece opcional e explicado.',
  },
  {
    id: 'transparencia',
    title: 'Transparência',
    summary: 'Explique por que pede, em linguagem simples. Aponte os documentos institucionais já existentes.',
  },
  {
    id: 'acesso',
    title: 'Acesso',
    summary: 'Defina quem na organização verá o dado. Sem canal oficial confirmado, não invente contato.',
  },
  {
    id: 'retencao',
    title: 'Retenção',
    summary: 'Combine até quando o dado precisa existir. Retenção indefinida é regra de parada.',
  },
  {
    id: 'revisao',
    title: 'Revisão antes de publicar',
    summary: 'Releia o planejamento antes de qualquer publicação. Esta página não publica e não configura a ficha.',
  },
] as const;

const KINDS = [
  {
    id: 'cadastral',
    title: 'Dado cadastral',
    why: 'Reconhecer quem se inscreve e devolver a confirmação combinada, quando essa comunicação fizer parte da finalidade.',
    whenNot: 'Quando um identificador extra não serve à finalidade — documento, foto ou endereço completo por hábito.',
    confirm: 'Se o campo é mesmo necessário e se está obrigatório só porque “sempre foi assim”.',
  },
  {
    id: 'operacional',
    title: 'Dado operacional',
    why: 'Organizar o fluxo do evento no dia — categoria de inscrição ou atividade já oferecida — não para formar um cadastro extra.',
    whenNot: 'Quando a operação ainda não existe, o campo não será lido por ninguém ou a resposta não altera o atendimento.',
    confirm: 'Se a equipe vai de fato usar o campo no dia e se ele pode ficar opcional.',
  },
  {
    id: 'sensivel',
    title: 'Dado sensível',
    why: 'Somente com necessidade comprovada e autorização correspondente. Saúde, biometria e documento de identificação não são padrão.',
    whenNot: 'Na dúvida, não peça CPF, documento, dado de saúde ou biometria. Conveniência não substitui necessidade.',
    confirm: 'Finalidade, autorização e quem terá acesso, antes de qualquer campo desta natureza entrar no planejamento.',
  },
  {
    id: 'desnecessario',
    title: 'Dado desnecessário',
    why: 'Na prática, não peça. Se não há finalidade, o campo não entra na ficha.',
    whenNot: 'Sempre que a resposta não alterar a inscrição, a comunicação combinada nem a operação do dia.',
    confirm: 'Remover o campo do planejamento. “Pode ser útil um dia” não é finalidade.',
  },
] as const;

const EXAMPLES = [
  {
    id: 'nome',
    title: 'Nome',
    summary: 'Um nome visível na lista pode ser suficiente. Nome completo só entra se a finalidade exigir identificação inequívoca.',
  },
  {
    id: 'tratamento',
    title: 'Como deseja ser chamado',
    summary: 'Respeita o tratamento da pessoa na credencial e no atendimento. Não substitui documento e não precisa ser obrigatório por hábito.',
  },
  {
    id: 'email',
    title: 'E-mail',
    summary: 'Só planeje este campo se houver finalidade de contato confirmada, como devolver a inscrição. Esta página não mostra endereço eletrônico de exemplo.',
  },
  {
    id: 'contextual',
    title: 'Campos contextuais',
    summary: 'Peça só o que aquele evento realmente usa — uma atividade já oferecida ou uma categoria de inscrição. Não copie uma matriz de tipos.',
  },
] as const;

const STOPS = [
  {
    id: 'finalidade-ausente',
    title: 'Finalidade ausente',
    summary: 'Campo sem finalidade escrita fica de fora. Ausência de finalidade é regra de parada, não um detalhe a preencher depois.',
  },
  {
    id: 'dado-sensivel',
    title: 'Dado sensível',
    summary: 'CPF, documento, saúde ou biometria sem necessidade e autorização comprovadas. Na dúvida, não peça.',
  },
  {
    id: 'contato-nao-confirmado',
    title: 'Contato não confirmado',
    summary: 'Sem canal oficial conferido, não invente e-mail, telefone ou chat. Também não planeje coletar contato da pessoa participante sem finalidade confirmada.',
  },
  {
    id: 'retencao-indefinida',
    title: 'Retenção indefinida',
    summary: 'Dado sem prazo de guarda não segue. Combine até quando ele precisa existir antes de qualquer publicação da ficha.',
  },
] as const;

export default function PublicMinimumDataGuidePage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main id="main-content" className={styles.main} tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>GUIA PÚBLICO DE DADOS MÍNIMOS</p>
        <h1>Planeje uma ficha de inscrição mínima e proporcional</h1>
        <p className={styles.lead}>
          Esta página é uma orientação estática, em português do Brasil, para a
          organização planejar quais dados pedir na ficha de inscrição — antes de
          configurá-la. Não há formulário, coleta, cookies nem aconselhamento
          jurídico aqui. O mesmo critério vale de forma genérica para os 19 tipos
          de evento, nas 6 famílias do catálogo, sem repetir a taxonomia.
        </p>

        <div className={styles.notice} role="status">
          <strong>Planejamento público — sem coleta e sem declaração de conformidade.</strong>
          <span>
            Este roteiro reforça a minimização e o self-service. Não coleta dado
            pessoal, não configura a ficha real e não afirma conformidade. Não
            substitui a minuta de Privacidade e não oferece aconselhamento jurídico.
            A LGPD continua a exigir decisão humana, finalidade e documentos
            próprios — esta página não os substitui.
          </span>
        </div>

        <section aria-labelledby="roteiro-title">
          <h2 id="roteiro-title">Roteiro antes de configurar a ficha</h2>
          <p className={styles.sectionLead}>
            Percorra os oito passos na ordem. É um lembrete visual para a
            conferência humana: nada aqui fica gravado, enviado ou publicado.
          </p>
          <ol className={styles.blocks}>
            {SCRIPT.map((step, index) => <li key={step.id}>
              <section className={styles.block} aria-labelledby={`${step.id}-title`}>
                <p className={styles.blockIndex} aria-hidden="true">{index + 1}</p>
                <h3 id={`${step.id}-title`}>{step.title}</h3>
                <p>{step.summary}</p>
              </section>
            </li>)}
          </ol>
        </section>

        <section aria-labelledby="tipos-title">
          <h2 id="tipos-title">Como distinguir o que pedir</h2>
          <p className={styles.sectionLead}>
            Cada categoria traz por que pedir, quando não pedir e o que confirmar
            antes. Use as três perguntas em todo campo, inclusive nos 19 tipos de
            evento, sem montar uma matriz por tipo.
          </p>
          <ul className={styles.legend} aria-label="Três perguntas de cada categoria">
            <li className={styles.why}>
              <span className={`${styles.facetBadge} ${styles.why}`}>Por que pedir</span>
              <span>A finalidade precisa existir antes do campo.</span>
            </li>
            <li className={styles.whenNot}>
              <span className={`${styles.facetBadge} ${styles.whenNot}`}>Quando não pedir</span>
              <span>Se a resposta não altera a inscrição nem a operação, não peça.</span>
            </li>
            <li className={styles.confirm}>
              <span className={`${styles.facetBadge} ${styles.confirm}`}>O que confirmar antes</span>
              <span>Necessidade, acesso e retenção ficam explícitos no planejamento.</span>
            </li>
          </ul>
          <ul className={styles.kinds}>
            {KINDS.map((kind) => <li key={kind.id}>
              <article className={styles.kind} aria-labelledby={`${kind.id}-title`}>
                <h3 id={`${kind.id}-title`}>{kind.title}</h3>
                <dl className={styles.facets}>
                  <div>
                    <dt>Por que pedir</dt>
                    <dd>{kind.why}</dd>
                  </div>
                  <div>
                    <dt>Quando não pedir</dt>
                    <dd>{kind.whenNot}</dd>
                  </div>
                  <div>
                    <dt>O que confirmar antes</dt>
                    <dd>{kind.confirm}</dd>
                  </div>
                </dl>
              </article>
            </li>)}
          </ul>
        </section>

        <section aria-labelledby="exemplos-title">
          <h2 id="exemplos-title">Exemplos conservadores de planejamento</h2>
          <p className={styles.sectionLead}>
            Os exemplos abaixo são lembretes de planejamento, não campos de coleta
            nesta página. Não há PII real, endereço eletrônico de exemplo nem
            documento ilustrativo.
          </p>
          <ul className={styles.examples}>
            {EXAMPLES.map((example) => <li key={example.id}>
              <article className={styles.example} aria-labelledby={`${example.id}-title`}>
                <h3 id={`${example.id}-title`}>{example.title}</h3>
                <p>{example.summary}</p>
              </article>
            </li>)}
          </ul>
        </section>

        <section className={styles.stop} aria-labelledby="parada-title">
          <h2 id="parada-title">Regras explícitas de parada</h2>
          <p>
            Nestes quatro casos a orientação é parar o planejamento do campo, com
            ícone e texto, até o ponto estar conferível:
          </p>
          <ul className={styles.stopList}>
            {STOPS.map((stop) => <li key={stop.id}>
              <span className={`${styles.stateBadge} ${styles.stopBadge}`}>
                <span className={styles.stateIcon} aria-hidden="true">×</span>
                Parar
              </span>
              <span>
                <strong>{stop.title}.</strong>
                {' '}{stop.summary}
              </span>
            </li>)}
          </ul>
        </section>

        <section className={styles.checklist} aria-labelledby="checklist-title">
          <h2 id="checklist-title">Checklist imprimível de revisão</h2>
          <p className={styles.sectionLead}>
            Leia ou imprima esta lista antes de configurar a ficha. Ela não envia
            dado, não grava estado e não substitui a revisão humana.
          </p>
          <ol className={styles.checkItems}>
            <li>A finalidade de cada campo está escrita?</li>
            <li>Cada campo obrigatório é realmente necessário?</li>
            <li>O público da ficha está descrito sem coletar dado extra?</li>
            <li>Opcional e obrigatório estão distintos e compreensíveis?</li>
            <li>A pessoa que responde entende por que aquele dado é pedido?</li>
            <li>Quem acessa o dado na organização está definido?</li>
            <li>Há prazo de retenção, sem guarda indefinida?</li>
            <li>A ficha planejada foi relida antes de qualquer publicação?</li>
          </ol>
        </section>

        <nav className={styles.next} aria-label="Próximos passos públicos">
          <h2 id="proximos-title">Próximos passos</h2>
          <p>
            Continue pelas rotas públicas já existentes. Nada nesta página coleta
            dados, abre formulário, configura a ficha ou substitui Termos e
            Privacidade.
          </p>
          <ul className={styles.nextLinks}>
            <li><Link href="/eventos">Explorar eventos</Link></li>
            <li><Link href="/">Voltar ao início</Link></li>
            <li><Link href="/privacidade">Ler a minuta de Privacidade</Link></li>
            <li><Link href="/termos-de-uso">Ler a minuta de Termos de Uso</Link></li>
          </ul>
        </nav>
      </article>
    </main>
  </>;
}
