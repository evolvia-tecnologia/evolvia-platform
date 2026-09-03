import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import styles from './publicacao-segura.module.css';

export const metadata: Metadata = {
  title: 'Publicação segura',
  description: 'Checklist público e estático de Go/No-Go para conferir um evento self-service antes de qualquer publicação, sem executar essa ação aqui.',
  robots: { index: false, follow: false },
};

const STATES = [
  {
    id: 'pronto',
    badge: 'pronto',
    icon: '✓',
    label: 'Pronto',
    meaning: 'O item está conferido e pode seguir no checklist. Isso não publica o evento.',
  },
  {
    id: 'revisar',
    badge: 'revisar',
    icon: '!',
    label: 'Revisar',
    meaning: 'Há lacuna ou ambiguidade. Ajuste antes de avançar. Não é um estado salvo.',
  },
  {
    id: 'nao-publicar',
    badge: 'naoPublicar',
    icon: '×',
    label: 'Não publicar',
    meaning: 'Regra de parada. Não siga para publicação enquanto este ponto bloquear.',
  },
] as const;

const CHECKLIST = [
  {
    id: 'identidade',
    title: 'Identidade do evento',
    summary: 'Nome público, tipo e identidade precisam estar reconhecíveis para quem encontra a ficha.',
    ready: 'Nome público claro e tipo reconhecível, sem sigla solta.',
    review: 'Nome genérico, identidade ambígua ou tipo ainda indefinido.',
    stop: 'Nome ausente ou identidade incompleta — dado ausente é regra de parada.',
  },
  {
    id: 'data-horario',
    title: 'Data e horário',
    summary: 'Quem consulta a ficha precisa ver quando o evento acontece, com fuso.',
    ready: 'Início, horário e fuso definidos; término informado quando o evento dura mais de um dia.',
    review: 'Horário sem conferência de fuso ou término indefinido em evento de vários dias.',
    stop: 'Data ou horário ausentes — não publique com calendário incompleto.',
  },
  {
    id: 'local-acesso',
    title: 'Local ou acesso online',
    summary: 'Presencial, online ou híbrido exigem o dado correspondente, visível na ficha.',
    ready: 'Endereço presencial ou instrução pública de acesso online/híbrido.',
    review: 'Local parcial, sala sem endereço ou acesso ainda só interno.',
    stop: 'Formato sem local nem acesso público — dado ausente é regra de parada.',
  },
  {
    id: 'publico',
    title: 'Público',
    summary: 'A ficha deve dizer para quem o evento existe, sem exigir cadastro nesta página.',
    ready: 'Público-alvo descrito (aberto, restrito ou por convite) de forma compreensível.',
    review: 'Público vago quando o evento é restrito, ou restrição sem explicação.',
    stop: 'Público ausente quando a ficha pública depende desse dado.',
  },
  {
    id: 'ficha-minima',
    title: 'Ficha mínima',
    summary: 'Descrição curta e mídia pública (logo ou capa) formam o mínimo visível.',
    ready: 'Descrição curta conferida e logo ou capa pública presente.',
    review: 'Descrição incompleta ou mídia ainda provisória.',
    stop: 'Ficha mínima ausente — sem descrição ou sem mídia pública.',
  },
  {
    id: 'privacidade',
    title: 'Privacidade',
    summary: 'A orientação pública não coleta dado pessoal e aponta os documentos institucionais já existentes.',
    ready: 'A ficha não pede dado extra indevido e os documentos institucionais estão acessíveis.',
    review: 'Avisos de tratamento incompletos ou linguagem que exige dado sem necessidade.',
    stop: 'Coleta de dado pessoal sem informação pública correspondente.',
  },
  {
    id: 'acessibilidade',
    title: 'Acessibilidade',
    summary: 'Informar o que existe não é o mesmo que declarar conformidade ou selo.',
    ready: 'Resumo público de acessibilidade informado, sem pretender certificação.',
    review: 'Resumo genérico, sem recurso concreto que a pessoa consiga conferir.',
    stop: 'Acessibilidade não informada — regra de parada, mesmo sem selo ou norma.',
  },
  {
    id: 'contatos',
    title: 'Contatos oficiais',
    summary: 'Só vale o canal que a organização confirmar na ficha. Esta página não inventa e-mail ou telefone.',
    ready: 'Canal oficial da organização confirmado na ficha pública.',
    review: 'Contato incompleto ou canal ainda não conferido por quem organiza.',
    stop: 'Contato não confirmado — regra de parada. Não substitua por canal inventado.',
  },
  {
    id: 'previa',
    title: 'Prévia',
    summary: 'A prévia mostra o que o público veria. Conferir a prévia não publica o evento.',
    ready: 'Prévia conferida e alinhada com identidade, data, local e ficha mínima.',
    review: 'Prévia vista só por quem editou, sem segunda conferência.',
    stop: 'Prévia não conferida ou ainda exibe dado ausente.',
  },
  {
    id: 'autorizacao',
    title: 'Autorização final',
    summary: 'Publicar é decisão de pessoa autorizada, depois deste checklist, em um fluxo separado.',
    ready: 'Pessoa autorizada revisou o Go/No-Go e nenhum bloqueio restante impede seguir.',
    review: 'Autorização pendente de outra pessoa ou checklist ainda em revisão.',
    stop: 'Sem autorização final. Esta página não substitui essa ação nem a habilita.',
  },
] as const;

export default function PublicationSafetyChecklistPage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main id="main-content" className={styles.main} tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>CHECKLIST PÚBLICO DE GO/NO-GO</p>
        <h1>Publicação segura de um evento self-service</h1>
        <p className={styles.lead}>
          Esta página é uma orientação estática, em português do Brasil, para conferir
          um evento antes de qualquer publicação. Não há formulário, estado salvo nem
          botão de publicar aqui. O mesmo critério vale de forma genérica para os 19
          tipos de evento, nas 6 famílias do catálogo, sem repetir a taxonomia.
        </p>

        <div className={styles.notice} role="status">
          <strong>Publicar é uma ação separada, autorizada e reversível.</strong>
          <span>
            Esta página não publica, não executa deploy e não afirma que a publicação
            esteja habilitada. A decisão acontece depois, só com pessoa autorizada, e
            pode ser revertida no fluxo próprio — não neste guia.
          </span>
        </div>

        <section aria-labelledby="estados-title">
          <h2 id="estados-title">Como ler Pronto, Revisar e Não publicar</h2>
          <p className={styles.sectionLead}>
            Cada estado tem ícone e texto, não só cor. Nada aqui fica gravado: é só
            um lembrete visual para a conferência humana.
          </p>
          <ul className={styles.states}>
            {STATES.map((state) => <li className={styles[state.id]} key={state.id}>
              <span className={`${styles.stateBadge} ${styles[state.badge]}`}>
                <span className={styles.stateIcon} aria-hidden="true">{state.icon}</span>
                {state.label}
              </span>
              <span>{state.meaning}</span>
            </li>)}
          </ul>
        </section>

        <section aria-labelledby="blocos-title">
          <h2 id="blocos-title">Dez blocos de verificação</h2>
          <p className={styles.sectionLead}>
            Percorra os dez pontos na ordem. Se um item cair em Não publicar, pare.
            Conferir o checklist não substitui a prévia nem a autorização final.
          </p>
          <ol className={styles.blocks}>
            {CHECKLIST.map((block, index) => <li key={block.id}>
              <section className={styles.block} aria-labelledby={`${block.id}-title`}>
                <p className={styles.blockIndex} aria-hidden="true">{index + 1}</p>
                <h3 id={`${block.id}-title`}>{block.title}</h3>
                <p>{block.summary}</p>
                <ul className={styles.criteria}>
                  <li>
                    <span className={`${styles.stateBadge} ${styles.pronto}`}>
                      <span className={styles.stateIcon} aria-hidden="true">✓</span>
                      Pronto
                    </span>
                    <span>{block.ready}</span>
                  </li>
                  <li>
                    <span className={`${styles.stateBadge} ${styles.revisar}`}>
                      <span className={styles.stateIcon} aria-hidden="true">!</span>
                      Revisar
                    </span>
                    <span>{block.review}</span>
                  </li>
                  <li>
                    <span className={`${styles.stateBadge} ${styles.naoPublicar}`}>
                      <span className={styles.stateIcon} aria-hidden="true">×</span>
                      Não publicar
                    </span>
                    <span>{block.stop}</span>
                  </li>
                </ul>
              </section>
            </li>)}
          </ol>
        </section>

        <section className={styles.stop} aria-labelledby="parada-title">
          <h2 id="parada-title">Regras explícitas de parada</h2>
          <p>
            Nestes três casos a orientação é Não publicar, com ícone e texto, até o
            dado existir de forma conferível na ficha:
          </p>
          <ul className={styles.stopList}>
            <li>
              <span className={`${styles.stateBadge} ${styles.naoPublicar}`}>
                <span className={styles.stateIcon} aria-hidden="true">×</span>
                Não publicar
              </span>
              <span>
                <strong>Dado ausente.</strong>
                {' '}Nome, data, local/acesso, público ou ficha mínima sem o campo
                correspondente. Ausência não se resolve por suposição.
              </span>
            </li>
            <li>
              <span className={`${styles.stateBadge} ${styles.naoPublicar}`}>
                <span className={styles.stateIcon} aria-hidden="true">×</span>
                Não publicar
              </span>
              <span>
                <strong>Contato não confirmado.</strong>
                {' '}Sem canal oficial conferido na ficha, não invente e-mail, telefone
                ou chat. Use só o que a organização já tornou público.
              </span>
            </li>
            <li>
              <span className={`${styles.stateBadge} ${styles.naoPublicar}`}>
                <span className={styles.stateIcon} aria-hidden="true">×</span>
                Não publicar
              </span>
              <span>
                <strong>Acessibilidade não informada.</strong>
                {' '}Falta de resumo público impede a publicação segura. Informar o
                recurso não declara conformidade, selo ou certificação.
              </span>
            </li>
          </ul>
        </section>

        <nav className={styles.next} aria-label="Próximos passos públicos">
          <h2 id="proximos-title">Próximos passos</h2>
          <p>
            Continue pelas rotas públicas já existentes. Nada nesta página coleta
            dados, abre formulário, publica evento ou substitui Termos e Privacidade.
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
