import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import styles from './midias-acessiveis.module.css';

export const metadata: Metadata = {
  title: 'Mídias acessíveis',
  description: 'Orientação prática e estática para preparar imagens, vídeos, áudio e documentos acessíveis na divulgação de eventos, sem upload nem conformidade automática.',
  robots: { index: false, follow: false },
};

const STATES = [
  {
    id: 'preparar',
    badge: 'preparar',
    icon: '✎',
    label: 'Preparar',
    meaning: 'A mídia tem texto, legenda ou equivalente conferível. Siga com a divulgação só depois da revisão humana.',
  },
  {
    id: 'revisar',
    badge: 'revisar',
    icon: '!',
    label: 'Revisar',
    meaning: 'Há lacuna, ambiguidade ou contraste duvidoso. Ajuste o arquivo original antes da prévia.',
  },
  {
    id: 'nao-publicar',
    badge: 'naoPublicar',
    icon: '×',
    label: 'Não publicar ainda',
    meaning: 'Regra de parada. Falta equivalente textual, o flash não foi avaliado ou o PDF não é legível.',
  },
] as const;

const TOPICS = [
  {
    id: 'alt',
    title: 'Texto alternativo',
    summary: 'Toda imagem que informa precisa de um texto curto que descreva o conteúdo, não o nome do arquivo.',
    prepare: 'Escreva o que a pessoa veria se a arte não carregasse. Ex.: “Auditório com palco iluminado e intérprete à frente”.',
    review: 'Alt genérico (“imagem”, “foto1”) ou repetição do título do evento sem descrever a cena.',
    stop: 'Imagem informativa sem texto alternativo — não publique ainda.',
  },
  {
    id: 'decorativa',
    title: 'Imagens decorativas',
    summary: 'Ornamento, faixa ou textura que não acrescenta informação deve ser marcada como decorativa.',
    prepare: 'Use texto alternativo vazio só quando a imagem não transmite dado. O restante da página já explica o evento.',
    review: 'Arte “de fundo” que na verdade mostra data, local ou nome — isso não é decorativo.',
    stop: 'Informação só na arte, sem equivalente em texto — não publique ainda.',
  },
  {
    id: 'contraste',
    title: 'Contraste dentro da arte',
    summary: 'Texto, ícone e mapa sobrepostos à imagem precisam permanecer legíveis, inclusive em sol ou tela pequena.',
    prepare: 'Coloque data, horário e local em área de alto contraste. Não dependa só de cor para distinguir trilhas.',
    review: 'Texto claro sobre foto clara, ou vermelho e verde como único jeito de separar presencial e online.',
    stop: 'Dado essencial ilegível na arte e ausente no texto da ficha — não publique ainda.',
  },
  {
    id: 'legendas',
    title: 'Legendas',
    summary: 'Vídeo falado precisa de legendas sincronizadas. Fala, ruído relevante e identificação de quem fala entram no texto.',
    prepare: 'Revise as legendas com o áudio. Elas devem acompanhar o vídeo, não resumir depois.',
    review: 'Legenda automática sem conferência, atraso visível ou fala cortada.',
    stop: 'Vídeo com fala e sem legendas — não publique ainda.',
  },
  {
    id: 'transcricao',
    title: 'Transcrição',
    summary: 'Áudio avulso (recado, podcast curto, mensagem da organização) precisa de transcrição completa em texto.',
    prepare: 'Publique a transcrição junto do recado. Inclua o que foi dito, não só um título.',
    review: 'Resumo no lugar da transcrição, ou transcrição que omite trechos falados.',
    stop: 'Áudio sem transcrição — não publique ainda.',
  },
  {
    id: 'audiodescricao',
    title: 'Audiodescrição',
    summary: 'Quando a imagem do vídeo informa o que o áudio não diz, descreva as ações visuais em faixa ou texto equivalente.',
    prepare: 'Descreva o que aparece no palco, nos slides ou na demonstração quando isso não está falado.',
    review: 'Só o áudio original em um vídeo em que a cena carrega o conteúdo (experimentos, coreografia, slides mudos).',
    stop: 'Conteúdo só visual, sem audiodescrição nem texto equivalente — não publique ainda.',
  },
  {
    id: 'movimento',
    title: 'Movimento',
    summary: 'Arte em loop, carrossel ou vídeo em autoplay distrai e pode impedir a leitura. Prefira estático na divulgação.',
    prepare: 'Use cartaz parado ou um quadro inicial. Se houver movimento, ele deve poder ser evitado na própria arte.',
    review: 'Loop infinito, autoplay com som ou animação que não tem equivalente estático.',
    stop: 'Movimento obrigatório para entender o recado — não publique ainda.',
  },
  {
    id: 'flashes',
    title: 'Flashes',
    summary: 'Estroboscópio, recorte rápido ou efeito de palco em vídeo precisa ser avaliado antes de qualquer divulgação.',
    prepare: 'Prefira cortes suaves. Se o registro tem flash, avalie o trecho com quem organiza o evento.',
    review: 'Efeito piscante sem nota na ficha, ou incerteza se o vídeo contém flash.',
    stop: 'Flash não avaliado — não publique ainda.',
  },
  {
    id: 'pdfs',
    title: 'PDFs',
    summary: 'Programa, circular e mapa em PDF precisam ser texto selecionável, com títulos e ordem de leitura.',
    prepare: 'Exporte de um documento com títulos, listas e idioma. Confira se o texto pode ser copiado.',
    review: 'PDF só com páginas escaneadas, colunas embaralhadas ou formulário sem rótulo.',
    stop: 'PDF inacessível (imagem sem texto, sem títulos ou ilegível com leitor de tela) — não publique ainda.',
  },
  {
    id: 'links',
    title: 'Links descritivos',
    summary: 'O texto do link deve dizer o destino. Evite “clique aqui”, “leia o PDF” sem nome do arquivo.',
    prepare: 'Use “Programa do evento em PDF” ou “Lista pública de eventos”. O destino precisa ser uma rota já pública.',
    review: 'Link cujo sentido só existe na cor, ou âncora que aponta para arquivo sem descrição.',
    stop: 'Link sem texto compreensível ou só com URL crua no lugar do rótulo — não publique ainda.',
  },
] as const;

export default function AccessibleMediaGuidePage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main id="main-content" className={styles.main} tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>GUIA PÚBLICO DE MÍDIAS ACESSÍVEIS</p>
        <h1>Prepare imagens, vídeos, áudio e documentos antes de divulgar</h1>
        <p className={styles.lead}>
          Esta página é uma orientação prática e estática, em português do Brasil,
          para quem organiza a divulgação de um evento. Ela não recebe arquivo,
          não processa mídia e não afirma conformidade automática. O mesmo critério
          vale de forma genérica para os 19 tipos de evento, em formato presencial,
          online ou híbrido, sem repetir o catálogo.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação humana — sem upload e sem selo.</strong>
          <span>
            Nada aqui habilita envio, transcodificação, player ou publicação.
            Revisão humana e teste com tecnologia assistiva continuam necessários
            depois desta leitura. Esta página não declara conformidade normativa
            nem recurso operacional ligado.
          </span>
        </div>

        <section aria-labelledby="estados-title">
          <h2 id="estados-title">Como ler Preparar, Revisar e Não publicar ainda</h2>
          <p className={styles.sectionLead}>
            Cada estado tem ícone e texto, nunca só cor. Nada é gravado: é um
            lembrete visual para a conferência antes da prévia e da homologação.
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

        <section aria-labelledby="midias-title">
          <h2 id="midias-title">Imagens, vídeos, áudio e documentos</h2>
          <p className={styles.sectionLead}>
            Percorra cada tipo de mídia. Se um item cair em Não publicar ainda, pare
            e ajuste o original. Esta página não substitui a prévia nem o teste com
            tecnologia assistiva.
          </p>
          <ol className={styles.blocks}>
            {TOPICS.map((topic, index) => <li key={topic.id}>
              <section className={styles.block} aria-labelledby={`${topic.id}-title`}>
                <p className={styles.blockIndex} aria-hidden="true">{index + 1}</p>
                <h3 id={`${topic.id}-title`}>{topic.title}</h3>
                <p>{topic.summary}</p>
                <ul className={styles.criteria}>
                  <li>
                    <span className={`${styles.stateBadge} ${styles.preparar}`}>
                      <span className={styles.stateIcon} aria-hidden="true">✎</span>
                      Preparar
                    </span>
                    <span>{topic.prepare}</span>
                  </li>
                  <li>
                    <span className={`${styles.stateBadge} ${styles.revisar}`}>
                      <span className={styles.stateIcon} aria-hidden="true">!</span>
                      Revisar
                    </span>
                    <span>{topic.review}</span>
                  </li>
                  <li>
                    <span className={`${styles.stateBadge} ${styles.naoPublicar}`}>
                      <span className={styles.stateIcon} aria-hidden="true">×</span>
                      Não publicar ainda
                    </span>
                    <span>{topic.stop}</span>
                  </li>
                </ul>
              </section>
            </li>)}
          </ol>
        </section>

        <section aria-labelledby="formatos-title">
          <h2 id="formatos-title">Exemplos seguros por formato</h2>
          <p className={styles.sectionLead}>
            Os exemplos abaixo servem a qualquer um dos 19 tipos. Eles não listam o
            catálogo e não prometem um recurso da plataforma.
          </p>
          <ul className={styles.formats}>
            <li>
              <h3>Presencial</h3>
              <p>
                Cartaz da entrada, foto do palco e mapa do prédio. O texto
                alternativo descreve a cena; o endereço continua escrito na ficha;
                o PDF do programa precisa ser texto, não só imagem.
              </p>
            </li>
            <li>
              <h3>Online</h3>
              <p>
                Vídeo de abertura da sala e recado em áudio. O vídeo leva legendas
                conferidas; o áudio leva transcrição completa; o quadro inicial
                substitui o autoplay.
              </p>
            </li>
            <li>
              <h3>Híbrido</h3>
              <p>
                Arte que distingue quem vai ao local e quem entra à distância com
                palavras, não só com cor. O mesmo vídeo leva legendas; a
                audiodescrição cobre o que só aparece no palco.
              </p>
            </li>
          </ul>
        </section>

        <section aria-labelledby="checklist-title">
          <h2 id="checklist-title">Checklist antes da prévia e da homologação</h2>
          <p className={styles.sectionLead}>
            Use esta lista na conferência humana, ainda sem enviar arquivo por
            aqui. Marcar um item não publica o evento e não substitui o teste com
            tecnologia assistiva.
          </p>
          <ol className={styles.checklist}>
            <li>Toda imagem informativa tem texto alternativo; as decorativas não escondem dado.</li>
            <li>Contraste da arte foi conferido; data e local também existem em texto.</li>
            <li>Vídeo com fala tem legendas; áudio avulso tem transcrição.</li>
            <li>Cenas só visuais têm audiodescrição ou texto equivalente.</li>
            <li>Não há movimento obrigatório nem flash não avaliado.</li>
            <li>PDF é texto selecionável, com títulos e ordem de leitura.</li>
            <li>Links descrevem o destino e apontam só para rotas públicas já existentes.</li>
            <li>Uma pessoa revisou o conjunto e outra tentou ler com tecnologia assistiva, quando disponível.</li>
          </ol>
        </section>

        <section className={styles.stop} aria-labelledby="parada-title">
          <h2 id="parada-title">Regras explícitas de parada</h2>
          <p>
            Nestes três casos a orientação é Não publicar ainda, com ícone e texto,
            até o equivalente existir de forma conferível:
          </p>
          <ul className={styles.stopList}>
            <li>
              <span className={`${styles.stateBadge} ${styles.naoPublicar}`}>
                <span className={styles.stateIcon} aria-hidden="true">×</span>
                Não publicar ainda
              </span>
              <span>
                <strong>Legenda, transcrição ou texto alternativo ausente.</strong>
                {' '}Vídeo falado sem legendas, áudio sem transcrição ou imagem
                informativa sem alt. Ausência não se resolve por suposição.
              </span>
            </li>
            <li>
              <span className={`${styles.stateBadge} ${styles.naoPublicar}`}>
                <span className={styles.stateIcon} aria-hidden="true">×</span>
                Não publicar ainda
              </span>
              <span>
                <strong>Flash não avaliado.</strong>
                {' '}Estrobo, corte rápido ou efeito piscante sem avaliação. Enquanto
                houver dúvida, o material não segue para a prévia.
              </span>
            </li>
            <li>
              <span className={`${styles.stateBadge} ${styles.naoPublicar}`}>
                <span className={styles.stateIcon} aria-hidden="true">×</span>
                Não publicar ainda
              </span>
              <span>
                <strong>PDF inacessível.</strong>
                {' '}Arquivo só em imagem, sem títulos ou ilegível com leitor de tela.
                Reexporte o documento antes de qualquer divulgação.
              </span>
            </li>
          </ul>
        </section>

        <nav className={styles.next} aria-label="Próximos passos públicos">
          <h2 id="proximos-title">Próximos passos</h2>
          <p>
            Continue pelas rotas públicas já existentes. Nada nesta página coleta
            dados, abre formulário, envia mídia ou substitui Termos e Privacidade.
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
