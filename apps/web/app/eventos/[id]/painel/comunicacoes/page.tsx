'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import styles from '../financeiro/page.module.css';

export default function EventCommunicationsPage() {
  const { id } = useParams<{ id: string }>();
  return <main className={styles.page} id="main-content">
    <Link href={`/eventos/${id}/painel`}>← Voltar ao menu do evento</Link>
    <header>
      <p className={styles.eyebrow}>EVENTO · COMUNICAÇÕES</p>
      <h1>Avisos do evento</h1>
      <p>O organizador encontra aqui para quem um aviso se destina. O disparo de e-mail em massa ainda não está ligado: sem um canal auditável e sem o consentimento de cada pessoa, a Evolvia não envia comunicado.</p>
    </header>
    <section className={styles.card}>
      <h2>Participantes e clientes</h2>
      <p>Quem se inscreveu é consultado em Inscrições recebidas, por e-mail, documento, empresa da cobrança, cupom ou situação de pagamento. A lista mostra o protocolo, não o cadastro completo.</p>
      <Link href={`/eventos/${id}/painel/inscricoes`}>Abrir inscrições recebidas</Link>
      <h2>Expositores, avaliadores e autores</h2>
      <p>Expositor ainda não é um cadastro próprio. O autor envia o trabalho na área do participante. O avaliador recebe um link da Central científica e preenche o parecer na própria área. A decisão fica com a comissão, na mesma Central.</p>
      <Link href={`/eventos/${id}/cientifico`}>Abrir a área científica</Link>
      <p className={styles.note}>Quando o disparo existir, ele sairá desta tela, com audiência escolhida, texto conferido e registro de quem autorizou. Até lá, nenhum botão desta página envia e-mail.</p>
    </section>
  </main>;
}
