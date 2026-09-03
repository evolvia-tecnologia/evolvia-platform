import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './cronograma-essencial.module.css';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Cronograma essencial',
  description:
    'Linha do tempo pública e estática para montar um cronograma mínimo de preparação do evento self-service, da definição inicial à prévia e à homologação, sem criar agenda nem publicar.',
  robots: { index: false, follow: false },
};

const STATES = [
  {
    id: 'planejado',
    icon: '○',
    label: 'Planejado',
    meaning:
      'O marco está na ordem recomendada, mas ainda não foi conferido. Isso não grava prazo nem cria tarefa.',
  },
  {
    id: 'em-revisao',
    icon: '◑',
    label: 'Em revisão',
    meaning:
      'Alguém está conferindo a entrada e a evidência. Revisar não homologa e não publica.',
  },
  {
    id: 'pronto',
    icon: '✓',
    label: 'Pronto para decisão',
    meaning:
      'A evidência existe e uma pessoa pode decidir o próximo passo. Pronto não é publicação.',
  },
] as const;

const MILESTONES = [
  {
    id: 'objetivo-publico',
    title: 'Definir objetivo e público',
    owner: 'Pessoa organizadora.',
    input:
      'O propósito do encontro e para quem ele existe: aberto, restrito ou por convite.',
    evidence:
      'Uma frase de objetivo e um público descrito, sem dado pessoal de participante.',
    stop:
      'Seguir sem objetivo ou sem público. Ausência desses dois pontos é regra de parada.',
    planned: 'Objetivo e público ainda só pretendidos.',
    reviewing: 'A frase e o público estão sendo conferidos por outra pessoa.',
    ready: 'Objetivo e público descritos e compreensíveis o bastante para escolher o tipo.',
  },
  {
    id: 'perfil-tipo',
    title: 'Escolher perfil e tipo',
    owner: 'Pessoa organizadora.',
    input:
      'Objetivo e público já descritos, para escolher no catálogo público existente.',
    evidence:
      'Um perfil e um tipo reconhecíveis no catálogo. A escolha inicial pode ser ajustada depois.',
    stop:
      'Inventar um tipo paralelo ao catálogo, ou tratar a escolha como se já publicasse o evento.',
    planned: 'A escolha de perfil e tipo ainda não foi feita.',
    reviewing: 'A escolha está sendo comparada com o objetivo e o público.',
    ready: 'Perfil e tipo escolhidos; a fundação ainda não foi publicada.',
  },
  {
    id: 'dados-minimos',
    title: 'Reunir dados mínimos',
    owner: 'Pessoa organizadora. Pessoa colaboradora só no recorte combinado.',
    input:
      'Nome público, formato presencial, online ou híbrido, previsão de período e fuso, e local ou acesso.',
    evidence:
      'Lista do que já existe e do que falta. O que ainda não estiver definido permanece pendente.',
    stop:
      'Avançar com nome, formato ou local/acesso ausentes quando a ficha pública depender desses dados.',
    planned: 'Os dados mínimos ainda não foram reunidos.',
    reviewing: 'A lista do que existe e do que falta está em conferência.',
    ready: 'O mínimo conferível está reunido ou explicitamente marcado como pendente.',
  },
  {
    id: 'configurar-recursos',
    title: 'Configurar recursos',
    owner: 'Pessoa organizadora. Pessoa colaboradora só no recorte combinado.',
    input:
      'Dados mínimos reunidos ou marcados como pendentes, e autorização da organização para configurar.',
    evidence:
      'Fundação registrada em ambiente autenticado. Salvar a fundação não torna o evento visível.',
    stop:
      'Configurar sem autorização explícita da organização, ou tratar o salvamento como publicação.',
    planned: 'A configuração ainda não começou.',
    reviewing: 'Os recursos configurados estão sendo conferidos no recorte combinado.',
    ready: 'A fundação está conferível e permanece inédita ao público.',
  },
  {
    id: 'conteudo-midias',
    title: 'Preparar conteúdo e mídias',
    owner: 'Pessoa organizadora ou pessoa colaboradora no recorte combinado.',
    input:
      'Textos, imagens e materiais que a ficha pública precisará mostrar, sem coletar dado extra aqui.',
    evidence:
      'Conteúdo conferível e mídias com alternativa textual quando a imagem transmite informação.',
    stop:
      'Usar mídia informativa sem descrição, ou incluir dado pessoal de participante no material.',
    planned: 'Textos e mídias ainda não foram preparados.',
    reviewing: 'Conteúdo e alternativas textuais estão em conferência.',
    ready: 'Textos e mídias essenciais existem e podem ir para a revisão de acessibilidade.',
  },
  {
    id: 'acessibilidade-privacidade',
    title: 'Revisar acessibilidade e privacidade',
    owner: 'Pessoa revisora. A pessoa organizadora acompanha.',
    input:
      'Conteúdo, mídias e o que a ficha pediria de quem participa, se vier a pedir.',
    evidence:
      'Resumo público de acessibilidade informado e coleta justificada por finalidade. Informar não é selo.',
    stop:
      'Acessibilidade não informada, ou pedido de dado sem finalidade. Na dúvida, não peça o dado.',
    planned: 'A revisão de acessibilidade e privacidade ainda não começou.',
    reviewing: 'Resumo de acessibilidade e finalidade da coleta estão em conferência.',
    ready: 'O que será informado ao público está descrito, sem pretender certificação.',
  },
  {
    id: 'previa',
    title: 'Conferir a prévia',
    owner: 'Pessoa organizadora e, se houver, pessoa revisora.',
    input:
      'Fundação, conteúdo e mídias já montados para ver como a ficha poderia aparecer.',
    evidence:
      'Prévia conferida e alinhada com identidade, período, local ou acesso, textos e mídias.',
    stop:
      'Tratar a prévia como página pública, ou avançar sem conferi-la. A prévia não publica o evento.',
    planned: 'A prévia ainda não foi aberta.',
    reviewing: 'A prévia está sendo comparada com os dados e o conteúdo.',
    ready: 'A prévia foi conferida e ainda não é a página pública.',
  },
  {
    id: 'homologar',
    title: 'Homologar',
    owner: 'Pessoa homologadora — sempre humana. A EVA não ocupa este papel.',
    input:
      'Prévia conferida e conteúdo congelado para uma conferência responsável.',
    evidence:
      'Confirmação humana explícita, ou devolução para ajuste. Homologar não é publicar.',
    stop:
      'Homologação pela EVA, por fila automática ou sem pessoa responsável. Homologar sem prévia também para.',
    planned: 'A homologação ainda não foi pedida.',
    reviewing: 'A pessoa homologadora está conferindo o conteúdo congelado.',
    ready: 'Há confirmação humana, ou uma devolução explícita para ajuste.',
  },
  {
    id: 'decidir-publicacao',
    title: 'Decidir a publicação',
    owner: 'Pessoa autorizada pela organização, depois da homologação.',
    input:
      'Homologação aprovada e prévia conferida. Publicar é outra ação, em outro fluxo.',
    evidence:
      'Decisão humana explícita fora desta página. Este guia não executa, não habilita e não promete publicação.',
    stop:
      'Confirmar sem homologação, sem pessoa autorizada, ou tratar esta página como se publicasse. A EVA não confirma publicação.',
    planned: 'A decisão de publicar ainda não foi pedida.',
    reviewing: 'Uma pessoa autorizada está conferindo se nenhum bloqueio restante impede seguir.',
    ready: 'A decisão pode ser pedida em fluxo separado. Pronto aqui não publica o evento.',
  },
] as const;

export default function PublicEssentialTimelineGuidePage() {
  return (
    <>
      <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
      <main id="main-content" className={styles.page} tabIndex={-1}>
        <article className={styles.article}>
          <p className={styles.eyebrow}>Guia público do organizador</p>
          <h1 className={styles.title}>Cronograma essencial de preparação do evento</h1>
          <p className={styles.lead}>
            Esta página descreve, em português do Brasil, uma linha do tempo
            estática e adaptável: da definição inicial à prévia e à homologação.
            Não cria agenda, não grava datas e não publica o evento.
          </p>

          <p className={styles.notice} role="status">
            <strong>A EVA orienta; não homologa nem publica.</strong>
            {' '}
            A assistente sugere a ordem e lembra o que falta. Homologar e
            decidir a publicação são ações humanas, explícitas e posteriores.
            Esta página não afirma que a publicação já está habilitada, não
            executa deploy e não promete prazo.
          </p>

          <section className={styles.section} aria-labelledby="estados-title" id="estados">
            <h2 id="estados-title">Como ler Planejado, Em revisão e Pronto para decisão</h2>
            <p className={styles.sectionLead}>
              Cada estado tem ícone e texto, não só cor. Nada aqui fica gravado:
              é um lembrete visual para a conferência humana, sem calendário
              interativo e sem progresso salvo.
            </p>
            <ul className={styles.states}>
              {STATES.map((state) => (
                <li className={styles[state.id]} key={state.id}>
                  <span className={`${styles.stateBadge} ${styles[state.id]}`}>
                    <span className={styles.stateIcon} aria-hidden="true">{state.icon}</span>
                    {state.label}
                  </span>
                  <span>{state.meaning}</span>
                </li>
              ))}
            </ul>
          </section>

          <nav className={styles.toc} aria-labelledby="indice-title">
            <h2 id="indice-title">Nove marcos na ordem recomendada</h2>
            <ol>
              {MILESTONES.map((milestone, index) => (
                <li key={milestone.id}>
                  <a href={`#${milestone.id}`}>
                    <span className={styles.tocIndex}>{index + 1}</span>
                    {milestone.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <ol className={styles.milestones}>
            {MILESTONES.map((milestone, index) => (
              <li id={milestone.id} key={milestone.id}>
                <section className={styles.milestone} aria-labelledby={`${milestone.id}-title`}>
                  <p className={styles.milestoneIndex} aria-hidden="true">{index + 1}</p>
                  <h2 id={`${milestone.id}-title`}>{milestone.title}</h2>
                  <dl className={styles.facets}>
                    <div>
                      <dt>Responsável sugerido</dt>
                      <dd>{milestone.owner}</dd>
                    </div>
                    <div>
                      <dt>Entrada necessária</dt>
                      <dd>{milestone.input}</dd>
                    </div>
                    <div>
                      <dt>Evidência de conclusão</dt>
                      <dd>{milestone.evidence}</dd>
                    </div>
                    <div>
                      <dt>Regra de parada</dt>
                      <dd>{milestone.stop}</dd>
                    </div>
                  </dl>
                  <h3 className={styles.stateReadingTitle}>Como ler o estado deste marco</h3>
                  <ul className={styles.stateReading}>
                    <li>
                      <span className={`${styles.stateBadge} ${styles.planejado}`}>
                        <span className={styles.stateIcon} aria-hidden="true">○</span>
                        Planejado
                      </span>
                      <span>{milestone.planned}</span>
                    </li>
                    <li>
                      <span className={`${styles.stateBadge} ${styles['em-revisao']}`}>
                        <span className={styles.stateIcon} aria-hidden="true">◑</span>
                        Em revisão
                      </span>
                      <span>{milestone.reviewing}</span>
                    </li>
                    <li>
                      <span className={`${styles.stateBadge} ${styles.pronto}`}>
                        <span className={styles.stateIcon} aria-hidden="true">✓</span>
                        Pronto para decisão
                      </span>
                      <span>{milestone.ready}</span>
                    </li>
                  </ul>
                </section>
              </li>
            ))}
          </ol>

          <section className={styles.section} aria-labelledby="perfis-title" id="perfis">
            <h2 id="perfis-title">Quatro perfis e 19 tipos, sem prazo por tipo</h2>
            <p className={styles.sectionLead}>
              O mesmo roteiro vale de forma genérica para os quatro perfis
              públicos e para qualquer um dos 19 tipos de evento. Não repetimos
              a taxonomia aqui e não criamos prazo, fila ou garantia por perfil
              ou tipo. Ajuste a profundidade de cada marco à realidade do
              encontro, sem inventar data absoluta.
            </p>
          </section>

          <section className={styles.stop} aria-labelledby="parada-title" id="parada">
            <h2 id="parada-title">Regras explícitas de parada</h2>
            <p>
              Nestes casos a orientação é parar, com ícone e texto, até existir
              evidência humana conferível:
            </p>
            <ul className={styles.stopList}>
              <li>
                <span className={`${styles.stateBadge} ${styles['em-revisao']}`}>
                  <span className={styles.stateIcon} aria-hidden="true">◑</span>
                  Em revisão
                </span>
                <span>
                  <strong>Prévia não conferida.</strong>
                  {' '}
                  Sem prévia revisada, não peça homologação. A prévia não é a
                  página pública.
                </span>
              </li>
              <li>
                <span className={`${styles.stateBadge} ${styles.planejado}`}>
                  <span className={styles.stateIcon} aria-hidden="true">○</span>
                  Planejado
                </span>
                <span>
                  <strong>Homologação sem pessoa.</strong>
                  {' '}
                  A EVA não homologa. Sem pessoa responsável, o marco permanece
                  apenas planejado.
                </span>
              </li>
              <li>
                <span className={`${styles.stateBadge} ${styles.pronto}`}>
                  <span className={styles.stateIcon} aria-hidden="true">✓</span>
                  Pronto para decisão
                </span>
                <span>
                  <strong>Publicação sem autorização.</strong>
                  {' '}
                  Mesmo pronto para decisão, publicar exige pessoa autorizada em
                  fluxo separado. Esta página não executa essa ação.
                </span>
              </li>
            </ul>
          </section>

          <section className={styles.checklistBlock} aria-labelledby="impressao-title" id="impressao">
            <h2 id="impressao-title">Leitura imprimível</h2>
            <p>
              Leia ou imprima esta linha do tempo. A lista não é salva, não usa
              JavaScript, não envia dados e não cria agenda.
            </p>
            <ol className={styles.checklist}>
              {MILESTONES.map((milestone) => (
                <li key={`${milestone.id}-print`}>{milestone.title}</li>
              ))}
            </ol>
          </section>

          <nav className={styles.footerNav} aria-label="Destinos públicos">
            <Link className="btn btn-primary" href="/">Voltar ao início</Link>
            <Link className="btn btn-secondary" href="/eventos">Explorar eventos</Link>
          </nav>

          <nav className={styles.legalNav} aria-label="Documentos jurídicos">
            <Link href="/termos-de-uso">Termos de Uso</Link>
            <Link href="/privacidade">Privacidade</Link>
          </nav>
        </article>
      </main>
    </>
  );
}
