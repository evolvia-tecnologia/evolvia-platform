'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import RegistrationNotice from '../../../../../components/registration-notice';
import styles from '../financeiro/page.module.css';

export default function EventCommunicationsPage() {
  const { id } = useParams<{ id: string }>();
  return <main className={styles.page} id="main-content">
    <Link href={`/eventos/${id}/painel`}>← Voltar ao menu do evento</Link>
    <header>
      <p className={styles.eyebrow}>EVENTO · COMUNICAÇÕES</p>
      <h1>Avisos do evento</h1>
      <p>O aviso operacional segue para inscrições confirmadas deste evento. A lista de endereços não aparece. Sem o canal HTTPS, nada é entregue. WhatsApp não é canal.</p>
    </header>
    <RegistrationNotice eventId={id} />
    <section className={styles.card}>
      <h2>Participantes e clientes</h2>
      <p>Quem se inscreveu é consultado em Inscrições recebidas, por e-mail, documento, empresa da cobrança, cupom ou situação de pagamento. A lista mostra o protocolo, não o cadastro completo.</p>
      <Link href={`/eventos/${id}/painel/inscricoes`}>Abrir inscrições recebidas</Link>
      <h2>Expositores, avaliadores e autores</h2>
      <p>Expositor ainda não é um cadastro próprio. O autor envia o trabalho na área do participante. O avaliador recebe um link da Central científica e preenche o parecer na própria área. A decisão fica com a comissão, na mesma Central.</p>
      <Link href={`/eventos/${id}/cientifico`}>Abrir a área científica</Link>
      <p className={styles.note}>A presença de hoje e o resultado científico já decidido filtram este aviso, junto com a categoria. O registro do envio não guarda o texto nem os endereços.</p>
    </section>
  </main>;
}
