import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import styles from './glossario.module.css';

export const metadata: Metadata = {
  title: 'Glossário do self-service',
  description: 'Termos essenciais da Evolvia em linguagem simples: o que cada conceito significa, o que já está disponível e o que depende de configuração ou autorização.',
  robots: { index: false, follow: false },
};

type GlossaryTerm = {
  id: string;
  term: string;
  plain: string;
  concept: string;
  availability: string;
  dependsOn: string;
};

type GlossaryGroup = {
  id: string;
  title: string;
  intro: string;
  terms: readonly GlossaryTerm[];
};

const GROUPS: readonly GlossaryGroup[] = [
  {
    id: 'grupo-configurar',
    title: 'Começar a configuração',
    intro: 'Escolhas iniciais que descrevem o evento e preparam a fundação, ainda sem torná-lo visível ao público.',
    terms: [
      {
        id: 'perfil-tipo-de-evento',
        term: 'Perfil ou tipo de evento',
        plain: 'o formato inicial do evento',
        concept: 'É a escolha inicial que descreve o formato — por exemplo um encontro científico, um treinamento ou uma feira. Essa escolha reúne tipos parecidos em famílias e orienta as próximas perguntas da EVA.',
        availability: 'A pessoa visitante pode ver e escolher um perfil na página inicial, sem cadastro. A lista pública mostra somente eventos que a organização já publicou.',
        dependsOn: 'Concluir a configuração, a homologação e a publicação para o evento aparecer ao público. Alterar o perfil depois segue o fluxo autenticado de quem organiza.',
      },
      {
        id: 'capability-recurso',
        term: 'Capability ou recurso',
        plain: 'função que o evento pode usar',
        concept: 'É uma função conhecida da Evolvia — por exemplo inscrições ou comunicação — que a organização pode ativar para aquele evento. Não é um produto separado nem um módulo solto.',
        availability: 'A lista de recursos aparece no assistente de criação, depois de criar uma conta. Marcar um recurso registra a intenção; não liga sozinho uma operação pública.',
        dependsOn: 'Configuração posterior, autorização da organização e, quando couber, o fluxo de homologação. Escolher um recurso não publica módulo nem emite certificado.',
      },
      {
        id: 'wizard',
        term: 'Wizard',
        plain: 'assistente de criação',
        concept: 'É o roteiro guiado, assistido pela EVA, que faz perguntas simples para montar a fundação do evento. A EVA sugere caminhos; não publica nem altera dado sensível sozinha.',
        availability: 'Disponível depois de criar uma conta. O progresso é gravado no servidor para a pessoa organizadora retomar em outro momento ou dispositivo.',
        dependsOn: 'Autenticação, organização responsável e permissão de quem configura. Concluir o assistente não publica o evento e não substitui a homologação.',
      },
      {
        id: 'ficha-de-inscricao',
        term: 'Ficha de inscrição',
        plain: 'formulário de cadastro da pessoa participante',
        concept: 'É o conjunto de campos que a organização define para receber dados de quem se inscreve. Serve para organizar o cadastro; não envia inscrição nesta página.',
        availability: 'A configuração da ficha existe no fluxo autenticado, depois da fundação do evento. Esta página pública não contém formulário e não coleta dado pessoal.',
        dependsOn: 'Recurso de inscrições, conclusão do assistente e autorização. Não há inscrição pública completa nesta superfície.',
      },
    ],
  },
  {
    id: 'grupo-revisar',
    title: 'Revisar e tornar visível',
    intro: 'Etapas que separam rascunho, revisão responsável e a decisão explícita de aparecer na lista pública.',
    terms: [
      {
        id: 'previa',
        term: 'Prévia',
        plain: 'visualização privada',
        concept: 'É a visualização reservada da página de divulgação, para a organização conferir o conteúdo antes de ele ficar visível ao público.',
        availability: 'Existe no fluxo autenticado de divulgação. Não é a página pública, não entra em busca e não substitui o endereço publicado.',
        dependsOn: 'Autenticação e permissão no evento. Ver a prévia não homologa e não publica.',
      },
      {
        id: 'homologacao',
        term: 'Homologação',
        plain: 'revisão responsável',
        concept: 'É a etapa em que o conteúdo de divulgação fica congelado para revisão, antes de qualquer publicação. Correções exigem voltar a um estado editável.',
        availability: 'Existe no fluxo autenticado de divulgação, depois da configuração mínima. Esta página pública não inicia homologação.',
        dependsOn: 'Papel autorizado na organização. Quem envia para revisão, quem aprova e quem publica não executam a mesma ação. A EVA não homologa sozinha.',
      },
      {
        id: 'publicacao',
        term: 'Publicação',
        plain: 'tornar o evento visível',
        concept: 'É a confirmação explícita, humana e auditável, que deixa a página do evento visível na lista pública. Não é um gesto silencioso da EVA.',
        availability: 'Eventos já publicados podem ser lidos na lista pública. Publicar um evento novo exige o fluxo autenticado de divulgação.',
        dependsOn: 'Homologação aprovada, papel autorizado e confirmação explícita. Sem essa decisão, o rascunho permanece invisível ao público.',
      },
    ],
  },
  {
    id: 'grupo-operar',
    title: 'Participar e operar',
    intro: 'Conceitos da jornada da pessoa participante e da operação no dia — distintos da página pública de divulgação.',
    terms: [
      {
        id: 'inscricao',
        term: 'Inscrição',
        plain: 'cadastro da pessoa participante',
        concept: 'É o processo de cadastrar quem vai participar. É um recurso essencial da fundação, distinto de publicar a página do evento.',
        availability: 'O recurso faz parte da fundação do evento. A inscrição pública completa da pessoa participante ainda não é esta página nem um módulo prometido aqui.',
        dependsOn: 'Configuração da ficha, regras do evento e autorização. Marcar o recurso não abre sozinho um cadastro público.',
      },
      {
        id: 'credenciamento',
        term: 'Credenciamento',
        plain: 'recepção e crachá',
        concept: 'É a operação de chegada — credencial, crachá e atendimento no acesso físico ou equivalente. Organiza a recepção; não prova, por si, a participação completa.',
        availability: 'Existe como recurso no assistente de criação. Não há operação pública de credenciamento nesta página.',
        dependsOn: 'Ativação do recurso, configuração operacional posterior e autorização. Estar no catálogo não emite crachá nem certificado.',
      },
      {
        id: 'controle-de-acesso',
        term: 'Controle de acesso',
        plain: 'entrada e presença',
        concept: 'É o registro de entrada e presença em pontos de acesso, para a operação do evento. Não é a senha da conta Evolvia.',
        availability: 'Existe como recurso no assistente. Alguns perfis o tratam como estrutural. Não há leitura pública de acesso nesta página.',
        dependsOn: 'Configuração, autorização e operação no dia do evento. Presença planejada na programação não equivale a certificado.',
      },
    ],
  },
  {
    id: 'grupo-conteudo',
    title: 'Reconhecimento e conteúdo',
    intro: 'O que a organização pode planejar para comprovantes e conteúdo acadêmico — sem tratar planejamento como entrega já publicada.',
    terms: [
      {
        id: 'certificado',
        term: 'Certificado',
        plain: 'comprovante de participação',
        concept: 'É um comprovante planejado de participação, atividade ou autoria. É um reconhecimento futuro, não um documento já emitido nesta página.',
        availability: 'Existe apenas como recurso no assistente de criação. Esta página não emite, não baixa e não promete certificado.',
        dependsOn: 'Configuração posterior, evidências de participação ou presença e autorização. Convite aceito ou programação planejada não geram certificado.',
      },
      {
        id: 'trabalho-cientifico',
        term: 'Trabalho científico',
        plain: 'submissão acadêmica',
        concept: 'É o conteúdo acadêmico enviado para avaliação — resumo, artigo ou formato equivalente definido pela organização do evento.',
        availability: 'Eventos de perfil científico podem aparecer na lista pública quando já publicados. A submissão pública de trabalhos não é um módulo prometido nesta página.',
        dependsOn: 'Perfil do evento, ativação do recurso, configuração científica e autorização. Programação planejada não prova presença nem gera certificado.',
      },
    ],
  },
];

export default function PublicSelfServiceGlossaryPage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main id="main-content" className={styles.main} tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>GLOSSÁRIO PÚBLICO DO SELF-SERVICE</p>
        <h1>Termos essenciais antes de configurar um evento</h1>
        <p className={styles.lead}>
          Esta página explica, em português do Brasil e em linguagem simples, os
          termos usados na Evolvia. Cada entrada separa o conceito, o que já está
          disponível e o que ainda depende de configuração ou autorização.
          Não é preciso criar conta nem enviar dados pessoais aqui.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação pública — sem formulário e sem promessa de módulo publicado.</strong>
          <span>
            Este glossário não emite certificado, não abre inscrição e não publica
            evento. Nada aqui garante módulo operacional, prazo de resposta ou
            entrega automática. A EVA orienta; decisões de homologação e publicação
            continuam humanas e autorizadas.
          </span>
        </div>

        <nav className={styles.toc} aria-label="Grupos do glossário">
          <h2 id="indice-title">Navegar por grupos</h2>
          <p className={styles.tocLead}>
            Use os grupos abaixo para ir direto ao conjunto de termos. Não há busca
            nesta página.
          </p>
          <ul className={styles.tocGroups}>
            {GROUPS.map((group) => (
              <li key={group.id} className={styles.tocGroup}>
                <a href={`#${group.id}`}>{group.title}</a>
                <ul className={styles.tocTerms}>
                  {group.terms.map((term) => (
                    <li key={term.id}>
                      <a href={`#${term.id}`}>{term.term}</a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </nav>

        {GROUPS.map((group) => (
          <section key={group.id} className={styles.group} id={group.id} aria-labelledby={`${group.id}-title`}>
            <h2 id={`${group.id}-title`}>{group.title}</h2>
            <p className={styles.groupIntro}>{group.intro}</p>
            <div className={styles.termList}>
              {group.terms.map((term) => {
                const headingId = `${term.id}-title`;
                return (
                  <article key={term.id} className={styles.term} id={term.id} aria-labelledby={headingId}>
                    <h3 id={headingId}>
                      {term.term}
                      {' '}
                      <span className={styles.plain}>({term.plain})</span>
                    </h3>
                    <dl className={styles.facets}>
                      <div>
                        <dt>Conceito</dt>
                        <dd>{term.concept}</dd>
                      </div>
                      <div>
                        <dt>Disponibilidade atual</dt>
                        <dd>{term.availability}</dd>
                      </div>
                      <div>
                        <dt>O que depende de configuração ou autorização</dt>
                        <dd>{term.dependsOn}</dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          </section>
        ))}

        <nav className={styles.next} aria-label="Próximos passos públicos">
          <h2 id="proximos-title">Próximos passos</h2>
          <p>
            Continue pelas rotas públicas já existentes. Nada nesta página coleta
            dados, abre formulário ou substitui a configuração autenticada.
          </p>
          <ul className={styles.nextLinks}>
            <li><Link href="/">Voltar ao início</Link></li>
            <li><Link href="/eventos">Explorar eventos</Link></li>
            <li><Link href="/cadastro">Criar conta para começar</Link></li>
            <li><Link href="/privacidade">Ler a minuta de Privacidade</Link></li>
            <li><Link href="/termos-de-uso">Ler a minuta de Termos de Uso</Link></li>
          </ul>
        </nav>
      </article>
    </main>
  </>;
}
