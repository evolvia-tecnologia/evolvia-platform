import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../../components/public-site-header';
import styles from './papeis-e-decisoes.module.css';

export const metadata: Metadata = {
  title: 'Papéis e decisões',
  description: 'Quem planeja, configura, revisa, homologa, publica e participa de um evento self-service — orientação pública, sem atribuir permissão nem executar ação.',
  robots: { index: false, follow: false },
};

const ROLES = [
  {
    id: 'organizadora',
    label: 'Pessoa organizadora',
    summary: 'Planeja o evento, conduz a configuração e pede as etapas seguintes.',
    does: 'Define o propósito, acompanha a fundação e solicita revisão, homologação ou publicação quando couber.',
    doesNot: 'Este texto não prova que a pessoa já tenha permissão no sistema, nem publica o evento.',
  },
  {
    id: 'colaboradora',
    label: 'Pessoa colaboradora',
    summary: 'Ajuda a configurar somente o recorte combinado com quem organiza.',
    does: 'Preenche ou ajusta partes da fundação dentro do que foi pedido.',
    doesNot: 'Não homologa, não confirma publicação e não representa um perfil já concedido no runtime.',
  },
  {
    id: 'revisora',
    label: 'Pessoa revisora ou homologadora',
    summary: 'Revisa o conteúdo e, quando for o caso, homologa. Sempre é uma pessoa.',
    does: 'Confere se o rascunho está completo o bastante para seguir ou devolve para ajuste.',
    doesNot: 'A EVA não ocupa este papel. Homologar não é o mesmo que publicar.',
  },
  {
    id: 'participante',
    label: 'Pessoa participante ou visitante',
    summary: 'Consulta o que já foi tornado público e participa só depois da publicação.',
    does: 'Lê a ficha pública, data, local e o que a organização já divulgou.',
    doesNot: 'Não configura, não revisa, não homologa e não publica.',
  },
] as const;

const STAGES = [
  {
    id: 'orientacao',
    label: 'Orientação',
    meaning: 'A EVA explica e sugere o próximo passo. Ninguém decide ainda. Sugestão não é aprovação.',
  },
  {
    id: 'configuracao',
    label: 'Configuração',
    meaning: 'A pessoa organizadora — e a colaboradora só no recorte combinado — monta a fundação do evento.',
  },
  {
    id: 'revisao',
    label: 'Revisão',
    meaning: 'A pessoa revisora confere o conteúdo. Revisar não congela o evento e não o torna público.',
  },
  {
    id: 'homologacao',
    label: 'Homologação',
    meaning: 'Uma pessoa homologadora confirma ou devolve o conteúdo congelado. A EVA não homologa sozinha.',
  },
  {
    id: 'publicacao',
    label: 'Confirmação humana de publicação',
    meaning: 'Uma pessoa autorizada confirma, de forma explícita, tornar o evento visível. Esta página não executa essa ação.',
  },
] as const;

const DECISIONS = [
  {
    id: 'decidir-orientacao',
    title: 'Seguir a orientação inicial',
    owner: 'Pessoa organizadora decide se avança. A EVA só orienta.',
    precondition: 'A pessoa leu a orientação pública ou o assistente e entendeu o propósito do evento.',
    stop: 'Tratar a sugestão da EVA como aprovação, homologação ou publicação. Pare e peça confirmação humana.',
  },
  {
    id: 'decidir-configuracao',
    title: 'Configurar a fundação',
    owner: 'Pessoa organizadora. Pessoa colaboradora só no recorte combinado.',
    precondition: 'Há um rascunho e uma autorização explícita da organização para configurar — princípio, não prova de permissão no runtime.',
    stop: 'Configurar sem autorização explícita, ou avançar com identidade, data ou local/acesso ausentes quando a ficha depender desses dados.',
  },
  {
    id: 'decidir-revisao',
    title: 'Revisar o conteúdo',
    owner: 'Pessoa revisora.',
    precondition: 'A fundação está conferível: nome, tipo, data e local ou acesso, quando o formato exigir.',
    stop: 'Revisar um rascunho incompleto, ou usar a revisão como se já homologasse ou publicasse.',
  },
  {
    id: 'decidir-homologacao',
    title: 'Homologar o conteúdo',
    owner: 'Pessoa revisora ou homologadora — sempre humana.',
    precondition: 'A revisão terminou e o conteúdo ficou congelado para conferência responsável.',
    stop: 'Homologação pela EVA, por fila automática ou sem pessoa responsável. Homologar sem revisão prévia também para.',
  },
  {
    id: 'decidir-publicacao',
    title: 'Confirmar a publicação',
    owner: 'Pessoa autorizada pela organização, depois da homologação.',
    precondition: 'Homologação aprovada e prévia conferida. Publicar é outra ação, em outro fluxo.',
    stop: 'Confirmar sem homologação, sem pessoa autorizada, ou tratar esta página como se publicasse. A EVA não confirma publicação.',
  },
] as const;

const SCENARIOS = [
  {
    id: 'cientifico',
    title: 'Evento científico ou acadêmico',
    text: 'Quem configura trabalhos ou avaliações não homologa a divulgação sozinha. A revisão científica do conteúdo acadêmico não substitui a homologação humana da página pública nem a confirmação de publicação.',
  },
  {
    id: 'corporativo',
    title: 'Evento corporativo ou capacitação',
    text: 'Uma pessoa colaboradora pode ajudar no material de treinamento no recorte combinado. Quem organiza ainda pede revisão e homologação. Montar a fundação não publica o encontro.',
  },
  {
    id: 'feira',
    title: 'Feira ou exposição',
    text: 'Credenciamento e operação de acesso são configuração. Quem opera a entrada no dia não homologa e não publica a ficha. Dado de local ou acesso ausente é regra de parada antes de qualquer publicação.',
  },
  {
    id: 'entretenimento',
    title: 'Evento de entretenimento',
    text: 'Preparar ingresso ou controle de acesso continua sendo configuração. Sem homologação humana e sem confirmação explícita, o evento permanece invisível ao público. A EVA não libera a entrada sozinha.',
  },
] as const;

export default function PublicRolesDecisionsGuidePage() {
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main id="main-content" className={styles.main} tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>GUIA PÚBLICO DE PAPÉIS E DECISÕES</p>
        <h1>Quem planeja, revisa, homologa e publica um evento</h1>
        <p className={styles.lead}>
          Esta página explica, em português do Brasil e em linguagem simples, quem
          planeja, configura, revisa, homologa, publica e participa de um evento
          self-service. É orientação estática. Não atribui papel, não concede acesso
          e não executa publicação.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação pública — sem formulário, sem permissão comprovada e sem ação operacional.</strong>
          <span>
            Os nomes abaixo descrevem responsabilidades desejadas, não uma lista de
            acessos já existente no sistema. A EVA orienta; nunca homologa, nunca
            publica e nunca aparece como aprovadora autônoma.
          </span>
        </div>

        <nav className={styles.toc} aria-label="Seções deste guia">
          <h2 id="indice-title">Navegar neste guia</h2>
          <ul className={styles.tocList}>
            <li><a href="#papeis">Papéis</a></li>
            <li><a href="#etapas">Etapas da decisão</a></li>
            <li><a href="#decisoes">Matriz de decisões</a></li>
            <li><a href="#principios">Princípios</a></li>
            <li><a href="#cenarios">Cenários</a></li>
          </ul>
        </nav>

        <section className={styles.section} id="papeis" aria-labelledby="papeis-title">
          <h2 id="papeis-title">Quatro papéis em um evento self-service</h2>
          <p className={styles.sectionLead}>
            A matriz abaixo separa quem organiza, quem colabora, quem revisa ou
            homologa e quem apenas participa. Nenhum cartão afirma que o papel já
            esteja disponível na conta da pessoa.
          </p>
          <ul className={styles.roles}>
            {ROLES.map((role) => (
              <li key={role.id} className={styles.role} id={role.id}>
                <article aria-labelledby={`${role.id}-title`}>
                  <h3 id={`${role.id}-title`}>{role.label}</h3>
                  <p>{role.summary}</p>
                  <dl className={styles.facets}>
                    <div>
                      <dt>O que faz nesta orientação</dt>
                      <dd>{role.does}</dd>
                    </div>
                    <div>
                      <dt>O que este texto não afirma</dt>
                      <dd>{role.doesNot}</dd>
                    </div>
                  </dl>
                </article>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section} id="etapas" aria-labelledby="etapas-title">
          <h2 id="etapas-title">Cinco etapas distintas da decisão</h2>
          <p className={styles.sectionLead}>
            Orientação, configuração, revisão, homologação e confirmação humana de
            publicação não são a mesma ação. Pular uma etapa é regra de parada.
          </p>
          <ol className={styles.stages}>
            {STAGES.map((stage, index) => (
              <li key={stage.id} className={styles.stage} id={stage.id}>
                <p className={styles.stageIndex} aria-hidden="true">{index + 1}</p>
                <h3 id={`${stage.id}-title`}>{stage.label}</h3>
                <p>{stage.meaning}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.section} id="decisoes" aria-labelledby="decisoes-title">
          <h2 id="decisoes-title">Matriz de decisões: responsável, pré-condição e parada</h2>
          <p className={styles.sectionLead}>
            Cada decisão tem uma pessoa responsável, uma pré-condição e uma regra
            de parada. Cartões abaixo são semanticamente equivalentes a uma tabela
            de responsabilidades: leem-se linha a linha, em qualquer largura.
          </p>
          <ul className={styles.decisions}>
            {DECISIONS.map((decision) => (
              <li key={decision.id} className={styles.decision} id={decision.id}>
                <article aria-labelledby={`${decision.id}-title`}>
                  <h3 id={`${decision.id}-title`}>{decision.title}</h3>
                  <dl className={styles.facets}>
                    <div>
                      <dt>Responsável</dt>
                      <dd>{decision.owner}</dd>
                    </div>
                    <div>
                      <dt>Pré-condição</dt>
                      <dd>{decision.precondition}</dd>
                    </div>
                    <div>
                      <dt>Regra de parada</dt>
                      <dd>{decision.stop}</dd>
                    </div>
                  </dl>
                </article>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.principles} id="principios" aria-labelledby="principios-title">
          <h2 id="principios-title">Negar por padrão e menor privilégio</h2>
          <p>
            Dois princípios descrevem a intenção, sem afirmar permissões ou papéis
            já comprovados no runtime:
          </p>
          <ul className={styles.principleList}>
            <li>
              <strong>Negar por padrão (deny-by-default).</strong>
              {' '}Só avança quem recebeu autorização explícita para aquela decisão.
              Ausência de autorização é regra de parada, não um convite a improvisar.
            </li>
            <li>
              <strong>Menor privilégio.</strong>
              {' '}Cada pessoa faz só o necessário para o próprio papel. Colaborar na
              configuração não autoriza homologar; homologar não autoriza publicar.
            </li>
          </ul>
          <p>
            Estes princípios não comprovam controle de acesso implementado, lista de
            permissões nem módulo operacional disponível. São o critério para parar
            quando o responsável ou a pré-condição faltarem.
          </p>
        </section>

        <section className={styles.section} id="cenarios" aria-labelledby="cenarios-title">
          <h2 id="cenarios-title">Cenários genéricos nos perfis de evento</h2>
          <p className={styles.sectionLead}>
            Os quatro cenários abaixo ilustram a mesma matriz em perfis distintos.
            O critério vale de forma genérica para os 19 tipos de evento, sem
            repetir a taxonomia nem listar cada tipo.
          </p>
          <ul className={styles.scenarios}>
            {SCENARIOS.map((scenario) => (
              <li key={scenario.id} className={styles.scenario} id={scenario.id}>
                <h3 id={`${scenario.id}-title`}>{scenario.title}</h3>
                <p>{scenario.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <nav className={styles.next} aria-label="Próximos passos públicos">
          <h2 id="proximos-title">Próximos passos</h2>
          <p>
            Continue pelas rotas públicas já existentes. Nada nesta página coleta
            dados, abre formulário, concede acesso, homologa ou publica evento.
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
