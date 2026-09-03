import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import styles from './briefing-do-evento.module.css';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Briefing do evento',
  description:
    'Roteiro público e estático para estruturar o briefing mínimo de um evento antes da jornada guiada de configuração. Não coleta dados, não abre formulário e não publica o evento.',
  robots: { index: false, follow: false },
};

const STATES = {
  now: { id: 'now', label: 'Definir agora', icon: '✓' },
  later: { id: 'later', label: 'Pode decidir depois', icon: '○' },
  stop: { id: 'stop', label: 'Pare e confirme', icon: '×' },
} as const;

const BLOCKS = [
  {
    id: 'objetivo',
    title: 'Objetivo',
    state: 'now',
    question: 'Qual resultado este encontro deve produzir para quem participa?',
    example: 'Alinhar a equipe em torno de um tema comum, sem ainda listar cada sessão ou convidar pessoas nominais.',
    evidence: 'Uma frase de propósito, conferível por quem organiza. Sem preço, prazo prometido ou data de publicação.',
  },
  {
    id: 'publico',
    title: 'Público',
    state: 'now',
    question: 'Quem deve participar e quem permanece de fora, em linguagem genérica?',
    example: 'Pessoas da área técnica de uma organização, em um encontro interno — sem nomes, listas nominais ou canal de contato neste briefing.',
    evidence: 'Descrição do público-alvo sem dado pessoal. Este roteiro não coleta quem participa.',
  },
  {
    id: 'perfil-tipo',
    title: 'Perfil e tipo',
    state: 'now',
    question: 'Qual perfil e tipo mais se aproximam da realidade, sem copiar um catálogo?',
    example: 'Um encontro científico de médio porte, ou um ciclo interno de capacitação. A escolha mais próxima pode ser ajustada depois.',
    evidence: 'Anotação do perfil e do tipo aproximados. Não fixa capabilities e não replica a taxonomia.',
  },
  {
    id: 'formato',
    title: 'Formato',
    state: 'now',
    question: 'O encontro é presencial, online ou híbrido?',
    example: 'Presencial em um único espaço; online com acesso ainda a combinar; híbrido com os dois recortes descritos.',
    evidence: 'Formato escolhido, coerente com o local ou o canal de acesso — ou a pendência explícita.',
  },
  {
    id: 'data-aproximada',
    title: 'Data aproximada',
    state: 'later',
    question: 'Em que período o encontro deve acontecer, mesmo que o dia ainda não exista?',
    example: 'No segundo semestre, ou em um mês aproximado. Não é calendário público nem canal de atendimento prometido.',
    evidence: 'Período aproximado ou a marca explícita de “ainda indefinido”. Sem canal de atendimento prometido e sem data de publicação.',
  },
  {
    id: 'local',
    title: 'Local',
    state: 'later',
    question: 'Onde as pessoas estarão, de acordo com o formato escolhido?',
    example: 'Um auditório da organização, ou um canal online ainda a confirmar — sem endereço de pessoa, telefone ou URL inventada.',
    evidence: 'Lugar ou canal compatível com o formato, ou a pendência explícita. Incoerência com data ou formato é regra de parada.',
  },
  {
    id: 'capacidade',
    title: 'Capacidade',
    state: 'later',
    question: 'Quantas pessoas o encontro comporta, em ordem de grandeza?',
    example: 'Dezenas em uma sala; centenas em uma mostra com visitantes. É uma estimativa de planejamento, não uma venda.',
    evidence: 'Faixa aproximada ou “a confirmar”. Sem preço e sem ingresso anunciado.',
  },
  {
    id: 'recursos-desejados',
    title: 'Recursos desejados',
    state: 'later',
    question: 'Quais apoios o encontro precisa, sem tratar desejo como recurso já ligado?',
    example: 'Inscrições, espaço para trabalhos ou um controle de entrada — descritos como intenção, não como recurso já ligado no sistema.',
    evidence: 'Lista de intenções. Esta página não ativa capability, catálogo nem configuração real.',
  },
  {
    id: 'responsaveis',
    title: 'Responsáveis',
    state: 'now',
    question: 'Quem responde pelo briefing, pela revisão e pela confirmação humana posterior?',
    example: 'Uma pessoa organizadora pelo propósito; outra pela revisão. São papéis desejados, sem afirmar acesso já atribuído.',
    evidence: 'Papel responsável indicado por função. Ausência de responsável é regra de parada.',
  },
  {
    id: 'conteudo-essencial',
    title: 'Conteúdo essencial',
    state: 'later',
    question: 'O que precisa estar claro para quem participa, mesmo em rascunho?',
    example: 'Tema, o que acontece no dia e o que ainda não será divulgado. Sem texto final de página pública.',
    evidence: 'Notas do conteúdo mínimo, marcadas como rascunho. Não substituem revisão humana.',
  },
  {
    id: 'acessibilidade',
    title: 'Acessibilidade',
    state: 'stop',
    question: 'Quais barreiras o público pode encontrar e o que já está planejado para reduzi-las?',
    example: 'Desnível no espaço presencial, ausência de legendas no online, ou falta de alternativa em texto para imagens.',
    evidence: 'Pelo menos um plano escrito, ainda que inicial. Acessibilidade não planejada é regra de parada.',
  },
  {
    id: 'privacidade',
    title: 'Privacidade',
    state: 'stop',
    question: 'Este briefing ou a ficha prevista pedem dado desnecessário ou sensível?',
    example: 'Um nome visível pode bastar. Documento de identificação, dado de saúde ou biometria não entram por hábito.',
    evidence: 'Confirmação de que não há dado sensível sem necessidade. Na dúvida, não peça e não anote.',
  },
  {
    id: 'evidencias-revisao',
    title: 'Evidências para revisão',
    state: 'stop',
    question: 'O que a pessoa revisora precisa ver para conferir este briefing antes da jornada guiada?',
    example: 'As respostas dos blocos, as pendências e as paradas em aberto. A EVA não substitui essa revisão.',
    evidence: 'Pacote conferível do próprio briefing. Sugestão da EVA não conta como aprovação, homologação ou publicação.',
  },
] as const;

const PROFILES = [
  {
    id: 'cientifico',
    title: 'Encontro científico ou acadêmico',
    text: 'Anote o tema e se haverá trabalhos, sem ligar módulo científico nem copiar nomes de tipos. O critério vale de forma genérica para os 19 tipos de evento.',
  },
  {
    id: 'corporativo',
    title: 'Encontro corporativo ou de capacitação',
    text: 'Anote o objetivo de aprendizagem e o público interno ou convidado, sem prometer certificado, preço ou recurso já habilitado.',
  },
  {
    id: 'feira',
    title: 'Mostra com expositores e visitantes',
    text: 'Anote o fluxo de visitantes e o espaço, sem afirmar credenciamento, catálogo de estandes ou publicação da ficha.',
  },
  {
    id: 'entretenimento',
    title: 'Encontro de entretenimento com público amplo',
    text: 'Anote a experiência pretendida e a ordem de grandeza do público, sem afirmar ingresso, controle de acesso já ligado ou página pública.',
  },
] as const;

const STOPS = [
  {
    id: 'responsavel-ausente',
    title: 'Responsável ausente',
    summary: 'Sem pessoa organizadora ou revisora indicada por função, o briefing não segue. A EVA não ocupa esse papel e não decide no lugar de ninguém.',
  },
  {
    id: 'local-data-incoerentes',
    title: 'Local e data incoerentes',
    summary: 'Formato presencial sem lugar; online sem canal de acesso; híbrido com um recorte vazio; ou período incompatível com o formato. Pare e alinhe antes da jornada guiada.',
  },
  {
    id: 'dado-sensivel',
    title: 'Dado sensível',
    summary: 'Documento de identificação, dado de saúde ou biometria neste briefing ou na ficha prevista, sem necessidade comprovada. Na dúvida, não peça e não registre.',
  },
  {
    id: 'acessibilidade-nao-planejada',
    title: 'Acessibilidade não planejada',
    summary: 'Nenhuma nota sobre barreiras ou alternativas. Ausência de plano, mesmo inicial, é regra de parada — não um detalhe para depois.',
  },
] as const;

function stateClass(state: keyof typeof STATES) {
  if (state === 'now') return styles.stateNow;
  if (state === 'later') return styles.stateLater;
  return styles.stateStop;
}

export default function PublicEventBriefGuidePage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main id="main-content" className={styles.main} tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>GUIA PÚBLICO DE BRIEFING DO EVENTO</p>
        <h1>Estruture o briefing mínimo antes da jornada guiada</h1>
        <p className={styles.lead}>
          Esta página é uma orientação estática, em português do Brasil, para a
          pessoa organizadora reunir o briefing mínimo — objetivo, público,
          perfil, formato, data, local e o restante do roteiro — antes de abrir
          a jornada guiada de configuração. Não há formulário, coleta, cookies,
          download gerado nem persistência. A EVA orienta e sugere; não decide,
          não homologa e não publica.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação pública — sem Wizard nesta página, sem permissão comprovada e sem publicação.</strong>
          <span>
            Use este roteiro como lembrete visual. Nada aqui grava estado, envia
            dado, configura o evento ou substitui revisão humana. Não invente
            prazo, preço, canal de atendimento, contato, permissão ou publicação.
            Links abaixo apontam só para destinos públicos já existentes.
          </span>
        </div>

        <nav className={styles.toc} aria-label="Seções deste guia">
          <h2 id="indice-title">Navegar neste guia</h2>
          <ul className={styles.tocList}>
            <li><a href="#estados">Como ler os estados</a></li>
            <li><a href="#roteiro">Roteiro do briefing</a></li>
            <li><a href="#perfis">Perfis e tipos</a></li>
            <li><a href="#paradas">Regras de parada</a></li>
            <li><a href="#checklist">Checklist imprimível</a></li>
          </ul>
        </nav>

        <section className={styles.section} id="estados" aria-labelledby="estados-title">
          <h2 id="estados-title">Como ler cada bloco: texto e ícone, não só cor</h2>
          <p className={styles.sectionLead}>
            Três estados separam o que precisa existir agora, o que pode ficar
            pendente e o que exige parar para confirmar. Cada estado traz ícone,
            texto e borda distinta.
          </p>
          <ul className={styles.legend} aria-label="Estados do briefing">
            <li className={styles.stateNow}>
              <span className={`${styles.stateBadge} ${styles.stateNow}`}>
                <span className={styles.stateIcon} aria-hidden="true">{STATES.now.icon}</span>
                {STATES.now.label}
              </span>
              <span>Responda antes de abrir a jornada guiada. Sem isso, o briefing fica incompleto.</span>
            </li>
            <li className={styles.stateLater}>
              <span className={`${styles.stateBadge} ${styles.stateLater}`}>
                <span className={styles.stateIcon} aria-hidden="true">{STATES.later.icon}</span>
                {STATES.later.label}
              </span>
              <span>Pode permanecer pendente, desde que a pendência esteja explícita e coerente.</span>
            </li>
            <li className={styles.stateStop}>
              <span className={`${styles.stateBadge} ${styles.stateStop}`}>
                <span className={styles.stateIcon} aria-hidden="true">{STATES.stop.icon}</span>
                {STATES.stop.label}
              </span>
              <span>Não avance com lacuna neste ponto. Confirmação humana é obrigatória.</span>
            </li>
          </ul>
        </section>

        <section className={styles.section} id="roteiro" aria-labelledby="roteiro-title">
          <h2 id="roteiro-title">Roteiro estático do briefing mínimo</h2>
          <p className={styles.sectionLead}>
            Percorra os treze blocos na ordem. Cada um traz pergunta orientadora,
            exemplo genérico e evidência esperada. Nada aqui fica gravado, baixado
            ou publicado.
          </p>
          <ol className={styles.blocks}>
            {BLOCKS.map((block, index) => {
              const state = STATES[block.state];
              return (
                <li key={block.id} id={block.id}>
                  <article className={styles.block} aria-labelledby={`${block.id}-title`}>
                    <p className={styles.blockIndex} aria-hidden="true">{index + 1}</p>
                    <span className={`${styles.stateBadge} ${stateClass(block.state)}`}>
                      <span className={styles.stateIcon} aria-hidden="true">{state.icon}</span>
                      {state.label}
                    </span>
                    <h3 id={`${block.id}-title`}>{block.title}</h3>
                    <dl className={styles.facets}>
                      <div>
                        <dt>Pergunta orientadora</dt>
                        <dd>{block.question}</dd>
                      </div>
                      <div>
                        <dt>Exemplo genérico</dt>
                        <dd>{block.example}</dd>
                      </div>
                      <div>
                        <dt>Evidência esperada</dt>
                        <dd>{block.evidence}</dd>
                      </div>
                    </dl>
                  </article>
                </li>
              );
            })}
          </ol>
        </section>

        <section className={styles.section} id="perfis" aria-labelledby="perfis-title">
          <h2 id="perfis-title">Exemplos genéricos em quatro perfis</h2>
          <p className={styles.sectionLead}>
            Os quatro recortes abaixo ilustram o mesmo briefing. O critério vale
            de forma genérica para os 19 tipos de evento, sem repetir a taxonomia
            e sem fixar capabilities por tipo.
          </p>
          <ul className={styles.profiles}>
            {PROFILES.map((profile) => (
              <li key={profile.id} className={styles.profile} id={profile.id}>
                <h3 id={`${profile.id}-title`}>{profile.title}</h3>
                <p>{profile.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.stop} id="paradas" aria-labelledby="parada-title">
          <h2 id="parada-title">Regras explícitas de parada</h2>
          <p>
            Nestes quatro casos a orientação é parar, com ícone e texto, até o
            ponto estar conferível. A EVA sugere o próximo passo; não decide,
            não homologa e não publica.
          </p>
          <ul className={styles.stopList}>
            {STOPS.map((stop) => (
              <li key={stop.id}>
                <span className={`${styles.stateBadge} ${styles.stateStop}`}>
                  <span className={styles.stateIcon} aria-hidden="true">{STATES.stop.icon}</span>
                  {STATES.stop.label}
                </span>
                <span>
                  <strong>{stop.title}.</strong>
                  {' '}{stop.summary}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.checklist} id="checklist" aria-labelledby="checklist-title">
          <h2 id="checklist-title">Checklist imprimível de revisão</h2>
          <p className={styles.sectionLead}>
            Leia ou imprima esta lista antes de abrir a jornada guiada. Ela não
            envia dado, não gera arquivo, não grava estado e não substitui a
            revisão humana.
          </p>
          <ol className={styles.checkItems}>
            <li>O objetivo está em uma frase conferível?</li>
            <li>O público está descrito sem dado pessoal?</li>
            <li>O perfil e o tipo aproximados foram anotados, sem copiar taxonomia?</li>
            <li>O formato presencial, online ou híbrido está explícito?</li>
            <li>Data aproximada e local são coerentes com o formato, ou a pendência está escrita?</li>
            <li>Há responsável por função, sem tratar isso como acesso já atribuído?</li>
            <li>Há plano inicial de acessibilidade, ainda que incompleto?</li>
            <li>Não há dado sensível sem necessidade?</li>
            <li>As evidências do briefing estão prontas para uma pessoa revisora?</li>
            <li>Ninguém tratou a sugestão da EVA como decisão, homologação ou publicação?</li>
          </ol>
        </section>

        <nav className={styles.next} aria-label="Próximos passos públicos">
          <h2 id="proximos-title">Próximos passos</h2>
          <p>
            Continue pelas rotas públicas já existentes. Nada nesta página coleta
            dados, abre formulário, configura o evento, homologa ou publica.
          </p>
          <ul className={styles.nextLinks}>
            <li><Link href="/">Voltar ao início</Link></li>
            <li><Link href="/eventos">Explorar eventos</Link></li>
            <li><Link href="/privacidade">Ler a minuta de Privacidade</Link></li>
            <li><Link href="/termos-de-uso">Ler a minuta de Termos de Uso</Link></li>
          </ul>
        </nav>
      </article>
    </main>
  </>;
}
