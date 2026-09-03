import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './primeiros-passos.module.css';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Primeiros passos do organizador',
  description:
    'Guia público, em português do Brasil, para planejar, configurar e revisar a prévia de um evento. Não publica o evento e não afirma que a publicação já está habilitada.',
  robots: { index: false, follow: false },
};

const STEPS = [
  { id: 'objetivo', title: 'Definir o objetivo' },
  { id: 'tipo', title: 'Escolher o tipo' },
  { id: 'dados', title: 'Preparar dados mínimos' },
  { id: 'configurar', title: 'Configurar' },
  { id: 'previa', title: 'Revisar a prévia' },
  { id: 'validar', title: 'Validar antes de publicar' },
] as const;

export default function OrganizerFirstStepsPage() {
  return (
    <>
      <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
      <main id="main-content" className={styles.page} tabIndex={-1}>
        <article className={styles.article}>
          <p className={styles.eyebrow}>Guia público do organizador</p>
          <h1 className={styles.title}>Primeiros passos para organizar um evento</h1>
          <p className={styles.lead}>
            Este guia descreve, em português do Brasil, a ordem recomendada do planejamento
            inicial até a prévia do evento. A página é estática: não grava checklist, não
            pede dados pessoais e não publica o evento.
          </p>

          <p className={styles.notice} role="status">
            <strong>Limite desta página.</strong> Criar conta e explorar o catálogo público
            são ações disponíveis sem autorização extra. Configurar o evento, abrir a prévia
            e qualquer publicação dependem de autenticação e, em alguns casos, de um papel
            autorizado. Esta página não afirma que a publicação já está habilitada e não
            executa deploy.
          </p>

          <nav className={styles.toc} aria-labelledby="jornada-title">
            <h2 id="jornada-title">Jornada em seis etapas</h2>
            <ol>
              {STEPS.map((step, index) => (
                <li key={step.id}>
                  <a href={`#${step.id}`}>
                    <span className={styles.tocIndex}>{index + 1}</span>
                    {step.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <ul className={styles.legend} aria-label="Como ler cada etapa">
            <li>
              <span className={styles.chipAvailable}>Disponível agora</span>
              Preparação ou destino público, sem autorização extra.
            </li>
            <li>
              <span className={styles.chipValidation}>Validação</span>
              Conferência obrigatória, sem efeito colateral nesta página.
            </li>
            <li>
              <span className={styles.chipAuth}>Autorização</span>
              Só avança com papel permitido. Este guia não concede permissão.
            </li>
          </ul>

          <ol className={styles.steps}>
            <li id="objetivo">
              <p className={styles.stepKind}>
                <span className={styles.chipAvailable}>Disponível agora</span>
                Preparação
              </p>
              <h2>Definir o objetivo</h2>
              <p>
                Antes de abrir qualquer ferramenta, descreva o propósito do encontro: o que
                as pessoas devem aprender, decidir ou vivenciar. Isso não cria o evento e
                não exige conta. Um objetivo claro evita escolher um tipo inadequado depois.
              </p>
            </li>

            <li id="tipo">
              <p className={styles.stepKind}>
                <span className={styles.chipAvailable}>Disponível agora</span>
                Ação pública
              </p>
              <h2>Escolher o tipo</h2>
              <p>
                Na <Link href="/">página inicial</Link>, a EVA pede o perfil mais próximo da
                realidade. As famílias públicas visíveis ali incluem científicos e acadêmicos,
                corporativos e capacitação, feiras e exposições, entretenimento, comunidades
                e outros. Escolha o tipo mais próximo; a escolha inicial pode ser ajustada
                depois, na configuração. Este guia não replica o catálogo completo.
              </p>
            </li>

            <li id="dados">
              <p className={styles.stepKind}>
                <span className={styles.chipValidation}>Validação</span>
                Preparação
              </p>
              <h2>Preparar dados mínimos</h2>
              <p>
                Reúna, se já souber: nome do evento; formato presencial, online ou híbrido;
                previsão de datas e fuso; estimativa de público; local ou plataforma; e se a
                entrada será gratuita, paga ou só para convidados. O que ainda não estiver
                definido pode ficar pendente na configuração. Não inclua dados pessoais de
                participantes neste planejamento.
              </p>
            </li>

            <li id="configurar">
              <p className={styles.stepKind}>
                <span className={styles.chipAuth}>Autorização</span>
                Requer conta
              </p>
              <h2>Configurar</h2>
              <p>
                Com uma conta, a jornada guiada registra a fundação do evento em um ambiente
                de configuração. Nada é publicado ao salvar essa fundação. Ajustes posteriores
                — divulgação, ficha ou recursos científicos — ficam no painel autenticado,
                que não é um destino desta página pública. Para começar, use{' '}
                <Link href="/cadastro">Criar conta</Link> ou <Link href="/login">Entrar</Link>.
              </p>
            </li>

            <li id="previa">
              <p className={styles.stepKind}>
                <span className={styles.chipAuth}>Autorização</span>
                Requer autenticação
              </p>
              <h2>Revisar a prévia</h2>
              <p>
                A prévia mostra como a página poderia aparecer ao público, sem torná-la
                pública. Use-a para conferir nome, datas, local, textos e mídias. A prévia
                não substitui a validação final e não dispara publicação. O catálogo em{' '}
                <Link href="/eventos">Explorar eventos</Link> mostra apenas o que já está
                visível publicamente, e não substitui a prévia autenticada do seu evento.
              </p>
            </li>

            <li id="validar">
              <p className={styles.stepKind}>
                <span className={styles.chipAuth}>Autorização</span>
                Pare se houver dúvida
              </p>
              <h2>Validar antes de publicar</h2>
              <p>
                Publicar é uma ação posterior, explícita e potencialmente irreversível.
                Somente pessoa autorizada deve avançar. Esta página não executa publicação,
                não habilita deploy e não promete prazo, preço ou canal de suporte.
              </p>
              <div className={styles.stop} role="note">
                <h3>Regras de parada</h3>
                <p>Pare antes de qualquer ação irreversível se alguma destas condições for verdadeira:</p>
                <ul>
                  <li>A prévia ainda não foi revisada.</li>
                  <li>Há bloqueios obrigatórios em aberto.</li>
                  <li>O papel atual não permite a transição.</li>
                  <li>Resta qualquer dúvida sobre o conteúdo ou o momento.</li>
                </ul>
              </div>
            </li>
          </ol>

          <section className={styles.checklistBlock} aria-labelledby="checklist-title" id="checklist">
            <h2 id="checklist-title">Checklist estático</h2>
            <p>
              Marque mentalmente. Esta lista não é salva, não usa JavaScript e não envia
              dados.
            </p>
            <ul className={styles.checklist}>
              <li>Objetivo do evento descrito em uma frase.</li>
              <li>Tipo escolhido entre os perfis públicos existentes.</li>
              <li>Dados mínimos reunidos ou marcados como pendentes.</li>
              <li>Fundação configurada no ambiente autenticado.</li>
              <li>Prévia revisada sem tratar a página como pública.</li>
              <li>Autorização conferida antes de qualquer publicação.</li>
            </ul>
          </section>

          <nav className={styles.footerNav} aria-label="Destinos públicos">
            <Link className="btn btn-primary" href="/">Voltar ao início</Link>
            <Link className="btn btn-secondary" href="/eventos">Explorar eventos</Link>
            <Link className="btn btn-secondary" href="/cadastro">Criar conta</Link>
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
