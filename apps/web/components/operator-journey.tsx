'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, getToken } from '../lib/api';
import { ROTULOS } from '../lib/operator-capability-diff';
import { jornadaDoOperador, rotaDoPosto, type Jornada, type RespostaDeCapacidades } from '../lib/operator-journey';
import styles from './operator-journey.module.css';

/**
 * O que ESTE operador pode fazer neste evento (CL02 / CL-R2.2).
 *
 * Consome `GET /events/:eventId/operators/me/capabilities`. Existe porque até
 * agora o operador descobria o limite da sua permissão por 403, no meio do
 * atendimento, com fila esperando — e o organizador concedia sem que ninguém
 * visse a concessão.
 *
 * ESTA TELA NÃO AUTORIZA NADA. Quem autoriza é o servidor, em cada operação.
 * Ela só evita que a interface minta. Por isso a própria tela diz isso, em
 * texto, para quem usa.
 *
 * `key={eventId}` no envoltório: trocar de evento recomeça o estado em vez de
 * mostrar por um instante as permissões do evento anterior.
 */
export default function OperatorJourney({ eventId }: { eventId: string }) {
  return <ScopedOperatorJourney key={eventId} eventId={eventId} />;
}

function ScopedOperatorJourney({ eventId }: { eventId: string }) {
  const [jornada, setJornada] = useState<Jornada | null>(null);
  const [papel, setPapel] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [carregando, setCarregando] = useState(false);
  const snapshot = useRef(0);

  const carregar = useCallback(
    async (motivo: 'inicial' | 'manual' | 'retomada') => {
      if (!eventId) return;
      if (!getToken()) {
        setError('Entre na sua conta para ver o que você pode fazer neste evento.');
        return;
      }
      const ticket = snapshot.current + 1;
      snapshot.current = ticket;
      setCarregando(true);
      if (motivo !== 'inicial') setStatus('Conferindo suas permissões…');
      try {
        const resposta = await api<RespostaDeCapacidades>(
          `/events/${encodeURIComponent(eventId)}/operators/me/capabilities`,
        );
        if (ticket !== snapshot.current) return;
        setJornada(jornadaDoOperador(resposta, ROTULOS));
        setPapel(resposta.papel ?? '');
        setError('');
        setStatus(motivo === 'inicial' ? '' : 'Permissões atualizadas.');
      } catch (err) {
        if (ticket !== snapshot.current) return;
        // A lista anterior é apagada de propósito: manter na tela uma permissão
        // que o servidor pode ter revogado é exatamente a mentira que esta
        // tela existe para não contar.
        setJornada(null);
        setStatus('');
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'Não foi possível conferir suas permissões agora.',
        );
      } finally {
        if (ticket === snapshot.current) setCarregando(false);
      }
    },
    [eventId],
  );

  useEffect(() => {
    void carregar('inicial');
  }, [carregar]);

  // Revogação acontece do outro lado, sem avisar esta aba; e quem toma 403 no
  // posto costuma voltar para cá. Então, ao retomar o foco, a lista é
  // reconferida em vez de ficar velha na tela.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reconferir = () => {
      if (document.visibilityState === 'visible') void carregar('retomada');
    };
    window.addEventListener('focus', reconferir);
    document.addEventListener('visibilitychange', reconferir);
    return () => {
      window.removeEventListener('focus', reconferir);
      document.removeEventListener('visibilitychange', reconferir);
    };
  }, [carregar]);

  return <section className={styles.card} aria-labelledby="operator-journey-title">
    <p className={styles.eyebrow}>SUAS PERMISSÕES NESTE EVENTO</p>
    <h2 id="operator-journey-title">O que você pode fazer aqui</h2>
    <p>
      Esta lista vem do servidor e vale só neste evento. Ela existe para você não descobrir um limite de permissão
      no meio do atendimento — mas quem autoriza cada operação é o servidor, na hora de executar.
    </p>

    {jornada?.aviso && <p role="alert" className={styles.aviso}>{jornada.aviso.texto}</p>}

    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!jornada && !error && <p>Conferindo suas permissões…</p>}

    {jornada && <>
      <p className={styles.resumo}>
        {jornada.permitidas === 0
          ? 'Nenhuma ação liberada para você neste evento.'
          : `${jornada.permitidas} de ${jornada.total} ações do balcão liberadas para você.`}
        {papel && <span className={styles.papel}> Seu papel na organização: {papel}.</span>}
      </p>

      {jornada.podeAbrirPosto && <p>
        <Link className={styles.abrir} href={rotaDoPosto(eventId)}>Abrir o posto de atendimento</Link>
      </p>}

      {jornada.grupos.map((grupo) => <section
        key={grupo.area}
        className={styles.grupo}
        aria-labelledby={`grupo-${grupo.area}`}
      >
        <h3 id={`grupo-${grupo.area}`}>{grupo.titulo}</h3>
        <ul>
          {grupo.entradas.map((entrada) => <li
            key={entrada.acao}
            className={entrada.permitida ? styles.liberada : styles.indisponivel}
          >
            <span className={styles.nome}>{entrada.rotulo}</span>
            {entrada.permitida
              ? <span className={styles.marca}>liberada</span>
              : <span className={styles.marcaFora}>não liberada</span>}
            {entrada.sensivel && <span className={styles.selo} title="Desfaz ou altera registro já gravado">
              sensível
            </span>}
          </li>)}
        </ul>
      </section>)}

      <p className={styles.nota}>
        Falta alguma ação de que você precisa? Peça ao organizador do evento. Cada permissão é concedida por evento,
        e reverter, reimprimir e corrigir são permissões separadas das ações diretas.
      </p>

      <button type="button" className={styles.atualizar} disabled={carregando} onClick={() => void carregar('manual')}>
        {carregando ? 'Conferindo…' : 'Conferir de novo'}
      </button>
      {status && <p role="status">{status}</p>}
    </>}
  </section>;
}
