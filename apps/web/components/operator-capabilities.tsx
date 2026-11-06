'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken } from '../lib/api';
import { diferencaDeConcessoes, rotulo, rotuloDePerfil, temMudanca } from '../lib/operator-capability-diff';
import styles from './operator-capabilities.module.css';

type ItemDoCatalogo = { acao: string; capacidade: string | null; sensivel: boolean };
type Perfil = { nome: string; acoes: string[] };
type Operador = { userId: string; nome: string | null; acoes: string[] };
type Painel = { escopado: boolean; catalogo: ItemDoCatalogo[]; perfis: Perfil[]; operadores: Operador[] };
type Registro = {
  kind: 'GRANTED' | 'REVOKED';
  action: string;
  targetUserId: string;
  actorUserId: string;
  reason: string;
  occurredAt: string;
};

const LIMITE_DO_MOTIVO = 200;

export default function OperatorCapabilities({ eventId }: { eventId: string }) {
  return <ScopedOperatorCapabilities key={eventId} eventId={eventId} />;
}

function ScopedOperatorCapabilities({ eventId }: { eventId: string }) {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [historico, setHistorico] = useState<Registro[] | null>(null);
  const [selecao, setSelecao] = useState<Record<string, string[]>>({});
  const [motivo, setMotivo] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const snapshot = useRef(0);

  useEffect(() => {
    if (!eventId) return;
    if (!getToken()) {
      setError('Entre na sua conta para ver as permissões.');
      return;
    }
    const ticket = snapshot.current;
    let current = true;
    carregar(eventId)
      .then(({ painel: p, historico: h }) => {
        if (!current || ticket !== snapshot.current) return;
        setPainel(p);
        setHistorico(h);
        setSelecao(Object.fromEntries(p.operadores.map((o) => [o.userId, [...o.acoes]])));
      })
      .catch((err) => {
        if (!current || ticket !== snapshot.current) return;
        setError(err instanceof Error ? err.message : 'Não foi possível carregar as permissões.');
      });
    return () => {
      current = false;
    };
  }, [eventId]);

  const porAcao = useMemo(() => {
    const mapa = new Map<string, ItemDoCatalogo>();
    for (const item of painel?.catalogo ?? []) mapa.set(item.acao, item);
    return mapa;
  }, [painel]);

  function alternar(userId: string, acao: string) {
    setSelecao((atual) => {
      const marcadas = atual[userId] ?? [];
      const proxima = marcadas.includes(acao) ? marcadas.filter((a) => a !== acao) : [...marcadas, acao];
      return { ...atual, [userId]: proxima };
    });
  }

  function aplicarPerfil(userId: string, perfil: Perfil) {
    // Marca o que o perfil contém, sem enviar: o organizador confere antes.
    setSelecao((atual) => ({ ...atual, [userId]: [...perfil.acoes] }));
    setStatus(`Perfil "${rotuloDePerfil(perfil.nome)}" marcado. Confira e salve.`);
  }

  async function salvar(operador: Operador) {
    if (!eventId || busyId) return;
    const justificativa = (motivo[operador.userId] ?? '').trim();
    const diferenca = diferencaDeConcessoes(operador.acoes, selecao[operador.userId] ?? []);

    if (!temMudanca(diferenca)) {
      setError('Nada mudou para esta pessoa.');
      setStatus('');
      return;
    }
    if (!justificativa) {
      setError('Informe o motivo. Ele fica no histórico e não pode ser alterado depois.');
      setStatus('');
      return;
    }

    const ticket = snapshot.current + 1;
    snapshot.current = ticket;
    setBusyId(operador.userId);
    setStatus('');
    setError('');
    const base = `/events/${encodeURIComponent(eventId)}/operators/${encodeURIComponent(operador.userId)}/grants`;
    try {
      if (diferenca.conceder.length > 0) {
        await api(base, { method: 'POST', body: JSON.stringify({ motivo: justificativa, acoes: diferenca.conceder }) });
      }
      if (diferenca.revogar.length > 0) {
        await api(`${base}/revoke`, { method: 'POST', body: JSON.stringify({ motivo: justificativa, acoes: diferenca.revogar }) });
      }
      const atualizado = await carregar(eventId);
      if (ticket !== snapshot.current) return;
      setPainel(atualizado.painel);
      setHistorico(atualizado.historico);
      setSelecao(Object.fromEntries(atualizado.painel.operadores.map((o) => [o.userId, [...o.acoes]])));
      setMotivo((atual) => ({ ...atual, [operador.userId]: '' }));
      setStatus(resumo(diferenca));
    } catch (err) {
      if (ticket !== snapshot.current) return;
      setError(err instanceof Error ? err.message : 'Não foi possível salvar as permissões.');
      // Recarrega para a tela não ficar mostrando um estado que o servidor recusou.
      carregar(eventId)
        .then((atualizado) => {
          if (ticket !== snapshot.current) return;
          setPainel(atualizado.painel);
          setHistorico(atualizado.historico);
          setSelecao(Object.fromEntries(atualizado.painel.operadores.map((o) => [o.userId, [...o.acoes]])));
        })
        .catch(() => undefined);
    } finally {
      if (ticket === snapshot.current) setBusyId('');
    }
  }

  return <section className={styles.card} aria-labelledby="operator-capabilities-title">
    <p className={styles.eyebrow}>PERMISSÕES DO BALCÃO</p>
    <h2 id="operator-capabilities-title">Quem pode o quê neste evento</h2>
    <p>
      Cada permissão vale só neste evento. Reverter, reimprimir e corrigir são concessões separadas das ações
      diretas: quem pode fazer check-in não reverte check-in por isso.
    </p>

    {painel && !painel.escopado && <p role="alert" className={styles.aviso}>
      Este evento ainda não exige permissão por pessoa. O que você conceder aqui fica gravado, mas o balcão continua
      liberando todas as operações para qualquer operador da organização. Para passar a exigir, ative a capacidade
      <code> operator_scoped_access </code> no evento.
    </p>}

    {!painel && !error && <p>Carregando as permissões…</p>}
    {painel && painel.operadores.length === 0 && <p>
      Nenhuma pessoa da organização tem o papel de operador. Permissões de balcão só se aplicam a operadores.
    </p>}

    {painel && painel.operadores.map((operador) => {
      const marcadas = selecao[operador.userId] ?? [];
      const diferenca = diferencaDeConcessoes(operador.acoes, marcadas);
      return <article key={operador.userId} className={styles.pessoa} aria-labelledby={`op-${operador.userId}`}>
        <h3 id={`op-${operador.userId}`}>{operador.nome ?? 'Operador sem nome cadastrado'}</h3>
        <p className={styles.resumoAtual}>
          {operador.acoes.length === 0
            ? 'Sem nenhuma permissão neste evento.'
            : `${operador.acoes.length} permissão${operador.acoes.length === 1 ? '' : 'ões'} agora.`}
        </p>

        <fieldset className={styles.perfis}>
          <legend>Perfis prontos</legend>
          {painel.perfis.map((perfil) => <button
            key={perfil.nome}
            type="button"
            className={styles.perfil}
            disabled={Boolean(busyId)}
            onClick={() => aplicarPerfil(operador.userId, perfil)}
          >{rotuloDePerfil(perfil.nome)}</button>)}
        </fieldset>

        <fieldset className={styles.acoes}>
          <legend>Permissões</legend>
          {painel.catalogo.map((item) => <label key={item.acao} className={item.sensivel ? styles.sensivel : styles.comum}>
            <input
              type="checkbox"
              checked={marcadas.includes(item.acao)}
              disabled={Boolean(busyId)}
              onChange={() => alternar(operador.userId, item.acao)}
            />
            <span>{rotulo(item.acao)}</span>
            {item.sensivel && <span className={styles.selo} title="Desfaz ou altera registro já gravado">sensível</span>}
          </label>)}
        </fieldset>

        {temMudanca(diferenca) && <p className={styles.diff}>
          {diferenca.conceder.length > 0 && <>Vai conceder: {diferenca.conceder.map(rotulo).join(', ')}. </>}
          {diferenca.revogar.length > 0 && <>Vai revogar: {diferenca.revogar.map(rotulo).join(', ')}.</>}
        </p>}

        <label className={styles.motivo}>
          Motivo
          <input
            type="text"
            maxLength={LIMITE_DO_MOTIVO}
            value={motivo[operador.userId] ?? ''}
            disabled={Boolean(busyId)}
            placeholder="Por que esta mudança"
            onChange={(e) => setMotivo((atual) => ({ ...atual, [operador.userId]: e.target.value }))}
          />
        </label>
        <p className={styles.nota}>O motivo entra no histórico e não pode ser alterado nem apagado depois.</p>

        <button
          type="button"
          className={styles.salvar}
          disabled={Boolean(busyId) || !temMudanca(diferenca)}
          onClick={() => void salvar(operador)}
        >{busyId === operador.userId ? 'Salvando…' : 'Salvar permissões'}</button>
      </article>;
    })}

    {status && <p role="status">{status}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}

    {historico && historico.length > 0 && <section className={styles.historico} aria-labelledby="operator-history-title">
      <h3 id="operator-history-title">Histórico</h3>
      <p>Toda concessão e toda revogação ficam registradas. Nada aqui pode ser alterado ou apagado.</p>
      <ul>
        {historico.map((r, i) => <li key={`${r.occurredAt}-${r.action}-${i}`}>
          <strong>{r.kind === 'GRANTED' ? 'Concedeu' : 'Revogou'}</strong> {rotulo(r.action)}
          {' — '}{quando(r.occurredAt)}
          <br />
          <span className={styles.motivoRegistrado}>{r.reason}</span>
          {porAcao.get(r.action)?.sensivel && <span className={styles.selo}>sensível</span>}
        </li>)}
      </ul>
    </section>}
  </section>;
}

async function carregar(eventId: string): Promise<{ painel: Painel; historico: Registro[] }> {
  const caminho = `/events/${encodeURIComponent(eventId)}/operators`;
  const [painel, historico] = await Promise.all([
    api<Painel>(caminho),
    api<Registro[]>(`${caminho}/history?limite=50`),
  ]);
  return { painel, historico };
}

function resumo(diferenca: { conceder: string[]; revogar: string[] }): string {
  const partes: string[] = [];
  if (diferenca.conceder.length > 0) partes.push(`${diferenca.conceder.length} concedida(s)`);
  if (diferenca.revogar.length > 0) partes.push(`${diferenca.revogar.length} revogada(s)`);
  return `Permissões salvas: ${partes.join(' e ')}.`;
}

function quando(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}
