import type { Metadata } from 'next';
import Link from 'next/link';
import PublicSiteHeader from '../../components/public-site-header';
import {
  EVENT_PROFILE_GROUPS,
  listEventProfileOptions,
  type EventProfileFamilyId,
} from '../../lib/event-profile-catalog';
import styles from './tipos-de-evento.module.css';

export const metadata: Metadata = {
  title: 'Tipos de evento',
  description:
    'Guia público dos tipos canônicos de evento da Evolvia, agrupados por família, para orientar a escolha do perfil mais próximo antes do self-service.',
  robots: { index: false, follow: false },
};

const REGISTRATION_LABEL = 'Inscrições';
const ACCESS_CONTROL_LABEL = 'Controle de acesso';

function toEventTypeSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function structuralCapabilityLabels(familyId: EventProfileFamilyId): readonly string[] {
  if (familyId === 'entertainment') {
    return [REGISTRATION_LABEL, ACCESS_CONTROL_LABEL];
  }
  return [REGISTRATION_LABEL];
}

export default function PublicEventTypesGuidePage() {
  const families = EVENT_PROFILE_GROUPS;
  const types = listEventProfileOptions();
  const entertainmentFamily = families.find((group) => group.id === 'entertainment');

  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <PublicSiteHeader current="legal" />

    <main id="main-content" className={styles.main} tabIndex={-1}>
      <article className={styles.article}>
        <Link className={styles.backLink} href="/">← Voltar para o início</Link>
        <p className={styles.eyebrow}>GUIA PÚBLICO DE TIPOS DE EVENTO</p>
        <h1>Escolha o tipo canônico antes de começar</h1>
        <p className={styles.lead}>
          Este guia apresenta os {types.length} tipos canônicos da Evolvia, organizados
          nas {families.length} famílias já usadas na Home. Serve para comparar diferenças
          práticas e ver os recursos estruturais obrigatórios antes de criar uma conta.
          Ele não inicia o Wizard, não publica evento e não promete módulos ainda bloqueados.
        </p>

        <div className={styles.notice} role="status">
          <strong>Orientação de escolha — sem coleta de dados e sem self-service nesta página.</strong>
          <span>
            Nomes, descrições e agrupamentos vêm do catálogo canônico. Não há formulário,
            cookie, identificador de organização ou de evento aqui. A criação do evento
            continua nas rotas públicas já existentes de cadastro e descoberta.
          </span>
        </div>

        <nav className={styles.familyNav} aria-label="Famílias de tipos de evento">
          {families.map((group) => (
            <a key={group.id} href={`#familia-${group.id}`}>{group.label}</a>
          ))}
        </nav>

        <section aria-labelledby="como-escolher-title">
          <h2 id="como-escolher-title">Como escolher</h2>
          <ol className={styles.steps}>
            <li>Identifique a família que descreve o propósito do encontro, não o tamanho da equipe.</li>
            <li>Dentro da família, use a descrição prática de cada tipo e escolha o mais próximo da operação real.</li>
            <li>Se nenhum tipo couber, use a última família do catálogo, pensada como estrutura flexível.</li>
            <li>Revise a escolha depois no self-service. Este guia não grava perfil nem trava a jornada.</li>
          </ol>
        </section>

        <section aria-labelledby="recursos-title">
          <h2 id="recursos-title">Recursos estruturais obrigatórios</h2>
          <p className={styles.sectionLead}>
            {REGISTRATION_LABEL} faz parte da estrutura de todos os {types.length} tipos.
            {entertainmentFamily
              ? ` ${ACCESS_CONTROL_LABEL} é estrutural somente na família ${entertainmentFamily.label}.`
              : null}
            {' '}Trabalhos científicos, pagamento, programação e demais módulos não são
            tratados como obrigatórios neste guia e não estão disponíveis aqui.
          </p>
        </section>

        {families.map((group) => {
          const capabilities = structuralCapabilityLabels(group.id);
          const headingId = `familia-${group.id}-title`;

          return (
            <section
              key={group.id}
              id={`familia-${group.id}`}
              className={styles.family}
              aria-labelledby={headingId}
            >
              <h2 id={headingId}>{group.label}</h2>
              <p className={styles.sectionLead}>{group.description}</p>
              <p className={styles.capabilitySummary}>
                Recursos estruturais: {capabilities.join(' e ')}.
              </p>
              <ul className={styles.typeGrid}>
                {group.options.map((option) => {
                  const slug = toEventTypeSlug(option.value);
                  const typeHeadingId = `tipo-${slug}-title`;

                  return (
                    <li key={option.value} id={`tipo-${slug}`} className={styles.card}>
                      <p className={styles.cardIcon} aria-hidden="true">{option.icon}</p>
                      <h3 id={typeHeadingId}>{option.title}</h3>
                      <p className={styles.cardDescription}>{option.description}</p>
                      <p className={styles.cardMeta}>Nome no catálogo: {option.value}</p>
                      <ul className={styles.capabilityList} aria-label={`Recursos estruturais de ${option.title}`}>
                        {capabilities.map((label) => (
                          <li key={label}>{label}</li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        <section className={styles.cta} aria-labelledby="cta-title">
          <h2 id="cta-title">Seguir para o self-service público</h2>
          <p className={styles.sectionLead}>
            A Evolvia não cria o evento nesta página. Use somente as rotas públicas já
            comprovadas: criar conta para começar, explorar eventos já publicados ou
            voltar ao início para conversar com a EVA.
          </p>
          <div className={styles.ctaActions}>
            <Link className={styles.primaryAction} href="/cadastro">Criar conta</Link>
            <Link className={styles.secondaryAction} href="/eventos">Explorar eventos</Link>
            <Link className={styles.textAction} href="/">Voltar para o início</Link>
          </div>
        </section>

        <nav className={styles.legalNav} aria-label="Documentos jurídicos">
          <Link href="/termos-de-uso">Termos de Uso</Link>
          <Link href="/privacidade">Privacidade</Link>
        </nav>
      </article>
    </main>
  </>;
}
