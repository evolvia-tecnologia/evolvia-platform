import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import VisualIdentityPlanner from './visual-identity-planner';
import styles from './planejar-identidade-visual.module.css';

export const metadata: Metadata = {
  title: 'Planejar identidade visual — orientação local',
  description: 'Planejador público e local para a pessoa organizadora avaliar a preparação da identidade visual antes de abrir o Wizard, sem enviar arquivo, escolher cor real ou alterar o evento.',
  robots: { index: false, follow: false },
};

export default function PublicVisualIdentityPlannerPage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main className={styles.main} id="main-content" tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>AJUDA PÚBLICA · ORIENTAÇÃO LOCAL</p>
        <h1>Planejar identidade visual do evento</h1>
        <p className={styles.lead}>
          Marque o estado de preparação de elementos genéricos — nome público,
          logotipo, paleta, tipografia, imagem principal, alternativas textuais,
          direitos de uso e versões para fundos claro e escuro — antes de abrir
          o Wizard. As escolhas são fechadas, ficam só nesta página, em
          português do Brasil, e somem ao recarregar.
          Esta ferramenta não valida marca, não certifica acessibilidade, não faz upload e não altera o evento.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação local — sem arquivo, sem persistência e sem decisão automática.</strong>
          <span>
            Não envie logotipo, imagem, paleta, fonte, URL, nome da marca, contato ou dado pessoal.
            Não há campo livre, recorte, conversão, armazenamento ou download.
            O plano vive só na memória desta página. A EVA não decide;
            a autorização de uso e a revisão humana continuam fora desta tela.
          </span>
        </div>

        <VisualIdentityPlanner />

        <section className={styles.guidance} aria-labelledby="orientacoes-title">
          <h2 id="orientacoes-title">Orientações genéricas e não conclusivas</h2>
          <p>
            Estas notas lembram proporção, legibilidade, consistência e contraste.
            Elas não inventam dimensão, paleta, fonte ou requisito proprietário,
            não criam guideline oficial e não certificam marca, copyright ou WCAG.
          </p>
          <ul>
            <li>Proporção: preserve a relação visual do logotipo e da imagem principal em recortes e fundos diferentes, sem medir em pixels nem definir margem segura.</li>
            <li>Legibilidade: confira se nome, logotipo e texto previsto permanecem reconhecíveis, sem escolher família tipográfica ou tamanho.</li>
            <li>Consistência: use a mesma linguagem visual nos materiais previstos, sem publicar manual de marca nesta página.</li>
            <li>Contraste: revise a leitura em fundo claro e fundo escuro, sem número de razão e sem selo de conformidade.</li>
          </ul>
        </section>

        <section className={styles.stopGuide} aria-labelledby="paradas-title">
          <h2 id="paradas-title">Regras de parada para confirmar com a pessoa responsável</h2>
          <p>
            Se alguma combinação abaixo aparecer no resumo, pare e confirme antes
            de avançar. A lista não bloqueia a página, não analisa o arquivo e
            não substitui revisão jurídica ou de acessibilidade.
          </p>
          <ul>
            <li>Imagem sem direito de uso: logotipo ou imagem marcada como pronta sem autorização confirmada.</li>
            <li>Informação transmitida só por imagem ou cor: paleta ou imagem pronta sem equivalente em texto.</li>
            <li>Contraste não verificado: paleta, tipografia ou logotipo prontos sem versões para os dois fundos.</li>
            <li>Logotipo ilegível: logotipo marcado como pronto sem versão prevista para fundo claro e fundo escuro.</li>
            <li>Ausência de alternativa textual: logotipo ou imagem prontos sem texto equivalente confirmado.</li>
          </ul>
        </section>

        <section className={styles.next} aria-labelledby="limites-title">
          <h2 id="limites-title">Limites desta página</h2>
          <p>
            O resumo não valida marca, não certifica acessibilidade, não faz upload, não escolhe cor real, não altera o design system e não publica o evento.
            Continue pelas rotas públicas já existentes; nada aqui abre o Wizard nem substitui Termos e Privacidade.
          </p>
          <ul className={styles.nextLinks}>
            <li><Link href="/eventos">Explorar eventos</Link></li>
            <li><Link href="/">Voltar ao início</Link></li>
            <li><Link href="/privacidade">Ler a minuta de Privacidade</Link></li>
            <li><Link href="/termos-de-uso">Ler a minuta de Termos de Uso</Link></li>
          </ul>
        </section>
      </article>
    </main>
  </>;
}
