import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import styles from './revisao-da-pagina.module.css';

export const metadata: Metadata = {
  title: 'Revisão da página do evento',
  description: 'Checklist público e estático para revisar o conteúdo da página de divulgação antes da prévia, da homologação e de qualquer publicação, sem editar evento real.',
  robots: { index: false, follow: false },
};

const STATES = [
  {
    id: 'confere',
    badge: 'confere',
    icon: '✓',
    label: 'Confere',
    meaning: 'O bloco está conferido na prévia. Isso não homologa nem publica o evento.',
  },
  {
    id: 'revisar',
    badge: 'revisar',
    icon: '!',
    label: 'Revisar',
    meaning: 'Há lacuna, ambiguidade ou erro comum. Ajuste o conteúdo antes de homologar.',
  },
  {
    id: 'nao-homologar',
    badge: 'naoHomologar',
    icon: '×',
    label: 'Não homologar',
    meaning: 'Regra de parada. Não avance para homologação enquanto este ponto bloquear.',
  },
] as const;

const STAGES = [
  {
    id: 'previa',
    title: 'Prévia',
    summary: 'Mostra o que o público veria se a página fosse publicada. Conferir a prévia é leitura, não homologação e não publicação.',
  },
  {
    id: 'homologacao',
    title: 'Homologação',
    summary: 'Pessoa autorizada confirma o conteúdo congelado da página. A EVA aponta lacunas, mas não homologa sozinha.',
  },
  {
    id: 'publicacao',
    title: 'Publicação',
    summary: 'Ação separada, depois da homologação, só com pessoa autorizada. Esta página não publica e não afirma que a publicação esteja habilitada.',
  },
] as const;

const CHECKLIST = [
  {
    id: 'titulo',
    title: 'Título',
    check: 'O título público identifica o evento com clareza, sem sigla solta ou nome interno de projeto.',
    error: 'Título genérico, diferente da prévia, ou só uma sigla que a pessoa visitante não reconhece.',
    evidence: 'O mesmo título aparece no cabeçalho da página, na prévia e nos canais oficiais já existentes, conferível lado a lado.',
    stop: 'Título ausente, ilegível ou contraditório entre canais — não homologar.',
  },
  {
    id: 'resumo',
    title: 'Resumo',
    check: 'O resumo curto diz o que é o evento, para quem existe e o que a pessoa encontra, em linguagem simples.',
    error: 'Texto promocional vazio, recorte de outro evento ou resumo que contradiz o título.',
    evidence: 'Resumo visível na página e na prévia, coerente com o título, sem dado pessoal.',
    stop: 'Resumo ausente quando a página pública depende dele, ou resumo com dado sensível — não homologar.',
  },
  {
    id: 'publico',
    title: 'Público',
    check: 'A página diz para quem o evento existe — aberto, restrito ou por convite — de forma compreensível.',
    error: 'Público vago em evento restrito, ou restrição sem explicação que a pessoa consiga usar.',
    evidence: 'Público-alvo descrito na ficha pública, conferível sem cadastro nesta página de ajuda.',
    stop: 'Público ausente quando a divulgação depende desse dado — não homologar.',
  },
  {
    id: 'data-horario',
    title: 'Data e horário',
    check: 'Início e, quando couber, término estão visíveis, sem ambiguidade de dia.',
    error: 'Só o dia sem hora, horário de outro ensaio, ou data que contradiz a programação.',
    evidence: 'Data e horário da página coincidem com a prévia e com a programação em texto.',
    stop: 'Data ou horário ausentes, ou data conflitante com o local ou a programação — não homologar.',
  },
  {
    id: 'fuso',
    title: 'Fuso',
    check: 'O fuso aparece junto do horário, sobretudo em evento online ou híbrido.',
    error: 'Horário sem fuso, fuso implícito da sede, ou conversão diferente em cada canal.',
    evidence: 'Fuso nomeado na página e na prévia, conferível sem adivinhar a cidade da organização.',
    stop: 'Horário público sem fuso conferível, ou fusos diferentes entre canais — não homologar.',
  },
  {
    id: 'local-acesso',
    title: 'Local ou acesso online',
    check: 'Presencial, online ou híbrido traz o dado correspondente, visível para quem consulta a página.',
    error: 'Sala sem endereço, instrução só interna, ou local que contradiz a data.',
    evidence: 'Endereço presencial ou instrução pública de acesso, alinhada ao formato declarado.',
    stop: 'Formato sem local nem acesso, ou data e local conflitantes — não homologar.',
  },
  {
    id: 'programacao',
    title: 'Programação',
    check: 'Se a página mostra programação, horários e atividades precisam bater com data, fuso e local.',
    error: 'Sessão em horário incompatível, sala diferente do local, ou grade só na arte.',
    evidence: 'Grade ou resumo de programação conferível em texto, alinhado à data, ao fuso e ao local.',
    stop: 'Programação em conflito com data ou local, ou informação só em imagem sem texto — não homologar.',
  },
  {
    id: 'responsaveis',
    title: 'Responsáveis',
    check: 'Quem aparece como responsável ou contato na página é canal oficial confirmado pela organização.',
    error: 'Nome sem papel, contato ainda interno, ou pessoa que a organização não confirmou.',
    evidence: 'Nome e papel públicos conferidos na prévia, sem documento, endereço residencial ou identificador extra.',
    stop: 'Contato não confirmado, ou responsável ausente quando a página o exige — não homologar.',
  },
  {
    id: 'imagens-alt',
    title: 'Imagens e texto alternativo',
    check: 'Toda imagem informativa tem alternativa textual. Arte decorativa não esconde dado essencial.',
    error: 'Texto alternativo genérico, informação só na arte, ou arquivo sem equivalente em texto.',
    evidence: 'Logo, capa e demais mídias da prévia descrevem o conteúdo ou estão marcadas como decorativas de fato.',
    stop: 'Mídia sem alternativa — não homologar.',
  },
  {
    id: 'links',
    title: 'Links',
    check: 'Cada link da página leva ao destino anunciado e permanece acessível publicamente.',
    error: 'Rótulo vago, endereço interno, ou destino diferente do que o texto promete.',
    evidence: 'Links conferidos na prévia, com rótulo descritivo e destino público.',
    stop: 'Link quebrado ou destino privado na página pública — não homologar.',
  },
  {
    id: 'acessibilidade',
    title: 'Acessibilidade',
    check: 'Há resumo público do que a pessoa encontra — acesso, intérprete, legendas — sem pretender selo.',
    error: 'Frase genérica sem recurso concreto, ou declaração de conformidade no lugar de informação útil.',
    evidence: 'Resumo de acessibilidade visível na prévia, honesto e conferível, sem certificação.',
    stop: 'Acessibilidade não informada, ou mídia essencial sem alternativa — não homologar.',
  },
  {
    id: 'privacidade',
    title: 'Privacidade',
    check: 'A página não expõe dado pessoal indevido nem pede dado extra fora da ficha própria.',
    error: 'Documento, saúde, endereço residencial ou identificador interno visível na divulgação.',
    evidence: 'Só canais oficiais e textos institucionais. As minutas de Privacidade e Termos permanecem acessíveis.',
    stop: 'Dado sensível exposto — não homologar. Esta página não oferece validação jurídica.',
  },
  {
    id: 'coerencia',
    title: 'Coerência entre canais',
    check: 'Título, data, local, links e imagens da página batem com a prévia e com os canais oficiais já existentes.',
    error: 'Cartaz com outra data, rede com outro local, ou título diferente na prévia.',
    evidence: 'Comparação lado a lado da página, da prévia e dos canais oficiais, sem editar evento real aqui.',
    stop: 'Contradição entre canais em data, local ou identidade — não homologar.',
  },
] as const;

const STOPS = [
  {
    id: 'data-local',
    title: 'Data ou local conflitante',
    summary: 'Calendário, fuso, endereço ou acesso online não batem entre si, com a programação ou com outro canal. Contradição não se resolve por suposição.',
  },
  {
    id: 'link-quebrado',
    title: 'Link quebrado',
    summary: 'Destino inexistente, privado ou diferente do rótulo. Link quebrado na página pública é regra de parada.',
  },
  {
    id: 'midia-sem-alternativa',
    title: 'Mídia sem alternativa',
    summary: 'Imagem informativa sem texto alternativo, ou dado essencial só na arte. Sem equivalente textual, não homologar.',
  },
  {
    id: 'contato-nao-confirmado',
    title: 'Contato não confirmado',
    summary: 'Sem canal oficial conferido, não invente endereço eletrônico, telefone ou chat. Use só o que a organização já tornou público.',
  },
  {
    id: 'dado-sensivel',
    title: 'Dado sensível exposto',
    summary: 'Documento, saúde, dado biométrico, endereço residencial ou identificador interno visível na divulgação. Exposição é regra de parada.',
  },
] as const;

export default function PublicEventPageReviewGuidePage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main id="main-content" className={styles.main} tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>REVISÃO PÚBLICA DA PÁGINA DO EVENTO</p>
        <h1>Revisar o conteúdo da página de divulgação</h1>
        <p className={styles.lead}>
          Esta página é uma orientação estática e imprimível, em português do
          Brasil, para a revisão humana do conteúdo da página de divulgação
          antes da prévia, da homologação e de qualquer publicação. Não há
          formulário, upload, estado salvo nem edição de evento real aqui. O
          mesmo critério vale de forma genérica para os 19 tipos de evento, nas
          6 famílias do catálogo, sem repetir a taxonomia nem a política de
          capabilities.
        </p>

        <div className={styles.notice} role="status">
          <strong>A EVA auxilia; a decisão permanece humana e autorizada.</strong>
          <span>
            A EVA pode apontar lacunas na leitura da prévia. Conferir, homologar
            e publicar são ações distintas, feitas por pessoa autorizada, em
            fluxos próprios. Esta página não edita, não homologa, não publica,
            não executa deploy e não afirma que a publicação esteja habilitada.
            Também não declara certificação, SLA nem validação jurídica.
          </span>
        </div>

        <section aria-labelledby="estagios-title">
          <h2 id="estagios-title">Prévia, homologação e publicação não são a mesma ação</h2>
          <p className={styles.sectionLead}>
            Pular uma etapa é regra de parada. Nada nesta página substitui a
            prévia autenticada, o gate de homologação nem a confirmação de
            publicação.
          </p>
          <ol className={styles.stages}>
            {STAGES.map((stage, index) => <li key={stage.id}>
              <p className={styles.blockIndex} aria-hidden="true">{index + 1}</p>
              <h3>{stage.title}</h3>
              <p>{stage.summary}</p>
            </li>)}
          </ol>
        </section>

        <section aria-labelledby="estados-title">
          <h2 id="estados-title">Como ler Confere, Revisar e Não homologar</h2>
          <p className={styles.sectionLead}>
            Cada estado tem ícone, texto e borda — nunca apenas cor. Nada aqui
            fica gravado: é só um lembrete visual para a conferência humana.
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
          <h2 id="blocos-title">Treze blocos de verificação</h2>
          <p className={styles.sectionLead}>
            Percorra os treze pontos na ordem. Cada bloco traz o que verificar,
            o erro comum, a evidência esperada e a regra de parada. Se um item
            cair em Não homologar, pare.
          </p>
          <ol className={styles.blocks}>
            {CHECKLIST.map((block, index) => <li key={block.id}>
              <section className={styles.block} aria-labelledby={`${block.id}-title`}>
                <p className={styles.blockIndex} aria-hidden="true">{index + 1}</p>
                <h3 id={`${block.id}-title`}>{block.title}</h3>
                <p>
                  <strong>O que verificar.</strong>
                  {' '}{block.check}
                </p>
                <ul className={styles.criteria}>
                  <li>
                    <span className={`${styles.stateBadge} ${styles.confere}`}>
                      <span className={styles.stateIcon} aria-hidden="true">✓</span>
                      Confere
                    </span>
                    <span>
                      <strong>Evidência esperada.</strong>
                      {' '}{block.evidence}
                    </span>
                  </li>
                  <li>
                    <span className={`${styles.stateBadge} ${styles.revisar}`}>
                      <span className={styles.stateIcon} aria-hidden="true">!</span>
                      Revisar
                    </span>
                    <span>
                      <strong>Erro comum.</strong>
                      {' '}{block.error}
                    </span>
                  </li>
                  <li>
                    <span className={`${styles.stateBadge} ${styles.naoHomologar}`}>
                      <span className={styles.stateIcon} aria-hidden="true">×</span>
                      Não homologar
                    </span>
                    <span>
                      <strong>Regra de parada.</strong>
                      {' '}{block.stop}
                    </span>
                  </li>
                </ul>
              </section>
            </li>)}
          </ol>
        </section>

        <section className={styles.stop} aria-labelledby="parada-title">
          <h2 id="parada-title">Regras explícitas de parada</h2>
          <p>
            Nestes cinco casos a orientação é Não homologar, com ícone, texto e
            borda, até o ponto estar conferível na prévia:
          </p>
          <ul className={styles.stopList}>
            {STOPS.map((item) => <li key={item.id}>
              <span className={`${styles.stateBadge} ${styles.naoHomologar}`}>
                <span className={styles.stateIcon} aria-hidden="true">×</span>
                Não homologar
              </span>
              <span>
                <strong>{item.title}.</strong>
                {' '}{item.summary}
              </span>
            </li>)}
          </ul>
        </section>

        <nav className={styles.next} aria-label="Próximos passos públicos">
          <h2 id="proximos-title">Próximos passos</h2>
          <p>
            Continue pelas rotas públicas já existentes. Nada nesta página
            coleta dados, abre formulário, edita evento, homologa ou publica.
            Também não substitui as minutas de Termos e Privacidade.
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
