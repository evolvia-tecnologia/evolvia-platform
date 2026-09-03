import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import styles from './participantes.module.css';

export const metadata: Metadata = {
  title: 'Guia da pessoa participante',
  description: 'Como encontrar um evento, ler a ficha pública, conferir acessibilidade e pedir ajuda — sem cadastro nesta página.',
  robots: { index: false, follow: false },
};

export default function ParticipantPublicGuidePage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main id="main-content" className={styles.main} tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>GUIA PÚBLICO DA PESSOA PARTICIPANTE</p>
        <h1>Como uma pessoa participante se orienta na Evolvia</h1>
        <p className={styles.lead}>
          Esta página explica, em português do Brasil e em linguagem simples, como
          encontrar um evento publicado, ler a ficha pública, conferir data, local e
          acessibilidade, e o que fazer quando alguma informação ainda não aparece.
          Não é preciso criar conta nem enviar dados pessoais aqui.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação pública — sem cadastro e sem promessa de atendimento.</strong>
          <span>
            Este texto não garante vaga, prazo de resposta nem certificação. Não há SLA
            e não declaramos que um evento seja acessível. A ficha pública mostra só o
            que a organização já divulgou.
          </span>
        </div>

        <div className={styles.journey}>
          <section className={styles.step} aria-labelledby="antes-title">
            <p className={styles.stepIndex} aria-hidden="true">1</p>
            <h2 id="antes-title">Antes de consultar um evento</h2>
            <ul className={styles.list}>
              <li>
                Comece pela{' '}
                <Link href="/">página inicial</Link>
                {' '}ou pela{' '}
                <Link href="/eventos">lista pública de eventos</Link>.
              </li>
              <li>
                A lista reúne eventos que a organização já publicou. Não é necessário
                entrar na área do organizador para ler o que é público.
              </li>
              <li>
                Se o evento não aparecer, ele pode ainda não estar publicado ou estar
                indisponível neste momento. Isso não significa que a pessoa tenha errado
                a busca.
              </li>
            </ul>
          </section>

          <section className={styles.step} aria-labelledby="durante-title">
            <p className={styles.stepIndex} aria-hidden="true">2</p>
            <h2 id="durante-title">Durante a consulta da ficha pública</h2>
            <ul className={styles.list}>
              <li>
                Abra a ficha pública do evento para ler nome, tipo, formato e a
                descrição divulgada pela organização.
              </li>
              <li>
                Confirme data, horário e local somente quando esses campos existirem
                na ficha. Eventos presenciais, online ou híbridos seguem o formato
                publicado.
              </li>
              <li>
                Procure o resumo de acessibilidade na própria ficha. A ausência desse
                resumo não prova que o recurso exista ou deixe de existir.
              </li>
            </ul>
          </section>

          <section className={styles.step} aria-labelledby="depois-title">
            <p className={styles.stepIndex} aria-hidden="true">3</p>
            <h2 id="depois-title">Depois de consultar</h2>
            <ul className={styles.list}>
              <li>
                Use somente o contato oficial publicado na ficha, quando a organização
                o tiver informado. Esta página não inventa e-mail, telefone ou chat.
              </li>
              <li>
                Não envie senha, documento, token ou dado extra por conta própria.
                A orientação pública não pede identificador interno nem dado pessoal.
              </li>
              <li>
                A minuta de{' '}
                <Link href="/privacidade">Privacidade</Link>
                {' '}descreve o estado institucional atual, ainda em homologação.
              </li>
            </ul>
          </section>
        </div>

        <section className={styles.missing} aria-labelledby="ausente-title">
          <h2 id="ausente-title">Quando a informação não aparece</h2>
          <ul className={styles.missingList}>
            <li>
              <strong>Informação ausente.</strong>
              {' '}Se data, local, acessibilidade ou contato não estão na ficha, a
              organização ainda não publicou esse dado. Confirme com a organização
              apenas pelo canal oficial, quando houver.
            </li>
            <li>
              <strong>Evento não encontrado ou indisponível.</strong>
              {' '}A ficha pode não existir, ter sido removida ou ainda não estar
              pública. Volte à{' '}
              <Link href="/eventos">lista de eventos</Link>
              {' '}ou ao{' '}
              <Link href="/">início</Link>
              {' '}para continuar.
            </li>
            <li>
              <strong>Sem canal publicado.</strong>
              {' '}Se a ficha não mostra contato, não há e-mail, telefone ou prazo
              inventado nesta página. Os documentos institucionais de{' '}
              <Link href="/termos-de-uso">Termos de Uso</Link>
              {' '}e{' '}
              <Link href="/privacidade">Privacidade</Link>
              {' '}permanecem o canal público já canônico da Evolvia.
            </li>
          </ul>
        </section>

        <nav className={styles.next} aria-label="Próximos passos públicos">
          <h2 id="proximos-title">Próximos passos</h2>
          <p>
            Continue pelas rotas públicas já existentes. Nada nesta página coleta
            dados, abre formulário ou substitui a ficha do evento.
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
