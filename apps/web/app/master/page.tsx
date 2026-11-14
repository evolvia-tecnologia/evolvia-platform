'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken } from '../../lib/api';
import {
  SessaoMasterAusente, apiMaster, esquecerSessaoMaster,
  guardarSessaoMaster, temSessaoMaster,
} from '../../lib/master-session';
import {
  mensagemDoErro, opcoesDeAutenticacao, opcoesDeRegistro,
  respostaDeAutenticacao, respostaDeRegistro, suportaWebAuthn,
} from '../../lib/webauthn-ceremony';
import type { OpcoesDeAutenticacaoJson, OpcoesDeRegistroJson } from '../../lib/webauthn-ceremony';

/**
 * Área Master (#665) — entrada com chave de segurança e visão geral.
 *
 * Esta é a primeira tela da Área Master. Antes dela, as treze rotas existiam e
 * ninguém conseguia entrar: a cerimônia WebAuthn do lado do navegador não
 * existia, então nem em homologação havia login.
 *
 * O que esta tela NÃO faz, para não parecer que faz: não lista eventos por
 * nome. A visão geral devolve os ids que compõem cada número, e id não é nome.
 * Um catálogo legível precisa de uma rota própria, que ainda não existe — e
 * mostrar `cm9x8...` para uma pessoa seria pior que não mostrar.
 *
 * Nenhum CSS novo: as classes são as mesmas do painel do organizador. O CSS
 * público é do Cursor, e inventar estilo que eu não consigo renderizar nesta
 * sessão seria apostar na aparência de uma tela administrativa.
 */

type Totais = {
  criados: number;
  publicados: number;
  emAndamento: number;
  semDataParaAndamento: number;
};

type Balde = { chave: string; total: number; eventIds: string[] };

type VisaoGeral = {
  totais: Totais;
  porArea: Balde[];
  semArea: Balde;
  porFormato: Balde[];
  porSituacao: Balde[];
  contexto: { fuso: string; atualizadoEm: string; indisponiveis: string[] };
};

type ItemDaTrilha = {
  quando: string;
  acao: string;
  resultado: 'ALLOWED' | 'DENIED' | 'FAILED';
  autor: string;
  alvo: string | null;
  eventId: string | null;
  motivo: string;
  correlacao: string;
};

type Relatorio = {
  mostrados: number;
  truncado: boolean;
  agregadosSobre: 'tudo' | 'pagina';
  itens: ItemDaTrilha[];
  porResultado: Record<'ALLOWED' | 'DENIED' | 'FAILED', number>;
};

type Sessao = { token: string; sessionId: string; expiraEm: string };

/** Os mesmos rótulos do painel do organizador. Vocabulário único na plataforma. */
const rotulosDeSituacao: Record<string, string> = {
  DRAFT: 'Rascunho',
  SETUP: 'Em configuração',
  HOMOLOGATION: 'Em homologação',
  READY_TO_PUBLISH: 'Pronto para publicar',
  PUBLISHED: 'Publicado',
  SUSPENDED: 'Suspenso',
  FINISHED: 'Finalizado',
  CANCELLED: 'Cancelado',
};

const rotulosDeFormato: Record<string, string> = {
  IN_PERSON: 'Presencial',
  ONLINE: 'Online',
  HYBRID: 'Híbrido',
};

const rotulosDeResultado: Record<string, string> = {
  ALLOWED: 'Permitida',
  DENIED: 'Recusada',
  FAILED: 'Falhou',
};

/**
 * `conceder:SEM_CONCESSAO` vira "Conceder — sem concessão".
 *
 * Sem destruturar o resultado de `split`: índice de array pode ser `undefined`
 * para o compilador, e `slice` com `indexOf` diz a mesma coisa sem precisar de
 * uma garantia que o tipo não dá. Foi o typecheck que apontou.
 */
function rotuloDaAcao(acao: string): string {
  const divisor = acao.indexOf(':');
  const nome = divisor === -1 ? acao : acao.slice(0, divisor);
  const motivo = divisor === -1 ? '' : acao.slice(divisor + 1);
  const legivel = nome.replace(/_/g, ' ');
  const comMaiuscula = legivel.charAt(0).toUpperCase() + legivel.slice(1);
  if (motivo.length === 0) return comMaiuscula;
  return `${comMaiuscula} — ${motivo.toLowerCase().replace(/_/g, ' ')}`;
}

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR');

export default function AreaMasterPage() {
  const router = useRouter();

  const [passo, setPasso] = useState<'verificando' | 'entrar' | 'dentro'>('verificando');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [visao, setVisao] = useState<VisaoGeral | null>(null);
  const [trilha, setTrilha] = useState<Relatorio | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);

  // `useState` em vez de ler no corpo: `suportaWebAuthn` toca em `window`, e no
  // primeiro render do servidor ele não existe.
  const [suportado, setSuportado] = useState(true);
  useEffect(() => { setSuportado(suportaWebAuthn()); }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setPasso(temSessaoMaster() ? 'dentro' : 'entrar');
  }, [router]);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const [geral, auditoria] = await Promise.all([
        apiMaster<VisaoGeral>('/platform/master/overview', { method: 'POST', body: '{}' }),
        apiMaster<Relatorio>('/platform/master/audit', { method: 'POST', body: JSON.stringify({ limite: 20 }) }),
      ]);
      setVisao(geral);
      setTrilha(auditoria);
    } catch (reason) {
      if (reason instanceof SessaoMasterAusente) {
        setPasso('entrar');
        setErro(reason.message);
        return;
      }
      setErro(reason instanceof Error ? reason.message : 'Não foi possível carregar a Área Master.');
    }
  }, []);

  useEffect(() => { if (passo === 'dentro') void carregar(); }, [passo, carregar]);

  async function entrar() {
    setOcupado(true);
    setErro('');
    setAviso('');
    try {
      const abertura = await api<OpcoesDeAutenticacaoJson>(
        '/platform/master/sessions/challenge', { method: 'POST' },
      );
      const credencial = await navigator.credentials.get({
        publicKey: opcoesDeAutenticacao(abertura) as PublicKeyCredentialRequestOptions,
      }) as PublicKeyCredential | null;
      if (!credencial) throw new Error('A chave de segurança não respondeu.');

      // O desafio volta porque o servidor guarda o DIGEST vinculado à sessão, e
      // não o desafio cru: ele não tem como reconstruí-lo para verificar.
      const sessao = await api<Sessao>('/platform/master/sessions', {
        method: 'POST',
        body: JSON.stringify({
          desafio: abertura.challenge,
          resposta: respostaDeAutenticacao(credencial),
        }),
      });
      guardarSessaoMaster(sessao.token, sessao.expiraEm);
      setPasso('dentro');
    } catch (reason) {
      setErro(mensagemDoErro(reason));
    } finally {
      setOcupado(false);
    }
  }

  async function registrarChaveDeBackup() {
    setOcupado(true);
    setErro('');
    setAviso('');
    try {
      const abertura = await apiMaster<OpcoesDeRegistroJson>(
        '/platform/master/credentials/challenge', { method: 'POST' },
      );
      const credencial = await navigator.credentials.create({
        publicKey: opcoesDeRegistro(abertura) as PublicKeyCredentialCreationOptions,
      }) as PublicKeyCredential | null;
      if (!credencial) throw new Error('A chave de segurança não respondeu.');

      await apiMaster('/platform/master/credentials', {
        method: 'POST',
        body: JSON.stringify({
          desafio: abertura.challenge,
          resposta: respostaDeRegistro(credencial),
          rotulo: 'Chave de backup',
        }),
      });
      setAviso('Chave de backup registrada. Guarde-a em outro lugar físico que a principal.');
    } catch (reason) {
      if (reason instanceof SessaoMasterAusente) {
        setPasso('entrar');
        setErro(reason.message);
        return;
      }
      setErro(mensagemDoErro(reason));
    } finally {
      setOcupado(false);
    }
  }

  async function sair() {
    setOcupado(true);
    try {
      await apiMaster('/platform/master/sessions', { method: 'DELETE' });
    } catch {
      // Encerrar no servidor é o desejável, mas esquecer o token aqui é o que
      // de fato protege esta máquina. Falha de rede não pode manter a sessão
      // viva na tela.
    } finally {
      esquecerSessaoMaster();
      setVisao(null);
      setTrilha(null);
      setPasso('entrar');
      setOcupado(false);
    }
  }

  const cabecalho = <header className="topbar dashboard-topbar">
    <Link className="brand" href="/painel">EVOLVIA</Link>
    <div className="nav-actions">
      <span className="topbar-user">Área Master</span>
      <Link className="btn btn-ghost-dark" href="/acesso">Trocar de área</Link>
      {passo === 'dentro' && <button className="btn btn-ghost-dark" onClick={sair} disabled={ocupado}>Encerrar sessão Master</button>}
    </div>
  </header>;

  if (passo === 'verificando') {
    return <main className="shell dashboard-shell">
      {cabecalho}
      <section className="container dashboard-page">
        <div className="events-skeleton"><div /><div /><div /></div>
      </section>
    </main>;
  }

  if (passo === 'entrar') {
    return <main className="shell dashboard-shell">
      {cabecalho}
      <section className="container dashboard-page">
        <div className="card" style={{ padding: '2rem', maxWidth: '38rem' }}>
          <p className="eyebrow">ÁREA MASTER</p>
          <h1>Confirme com sua chave de segurança</h1>
          <p className="muted">
            Esta área administra a plataforma inteira, então a senha não basta: é preciso a chave
            de segurança registrada para a sua conta. A sessão vale por doze horas e termina se
            você recarregar a página.
          </p>

          {erro && <div className="error" role="alert">{erro}</div>}

          {suportado
            ? <button className="btn btn-primary" onClick={entrar} disabled={ocupado}>
              {ocupado ? 'Aguardando a chave...' : 'Entrar com a chave de segurança'}
            </button>
            : <div className="error" role="alert">
              Este navegador não oferece suporte a chave de segurança. Abra a Área Master em um
              navegador atualizado, no mesmo endereço em que a chave foi registrada.
            </div>}
        </div>
      </section>
    </main>;
  }

  return <main className="shell dashboard-shell">
    {cabecalho}
    <section className="container dashboard-page premium-dashboard">
      <div className="dashboard-welcome">
        <div>
          <p className="eyebrow">ÁREA MASTER</p>
          <h1>Visão geral da plataforma</h1>
          {visao && <p className="dashboard-lead">
            Apurado em {quando(visao.contexto.atualizadoEm)} ({visao.contexto.fuso}).
          </p>}
        </div>
        <button className="btn btn-secondary" onClick={() => void carregar()} disabled={ocupado}>Atualizar</button>
      </div>

      {erro && <div className="error" role="alert">{erro}</div>}
      {aviso && <div className="card" role="status" style={{ padding: '1rem', marginBottom: '1.5rem' }}>{aviso}</div>}

      {!visao ? <div className="events-skeleton"><div /><div /><div /></div> : <>
        <div className="dashboard-metrics">
          <div className="metric-card"><span className="metric-icon">▦</span><div><strong>{visao.totais.criados}</strong><small>Eventos criados</small></div></div>
          <div className="metric-card"><span className="metric-icon">◉</span><div><strong>{visao.totais.publicados}</strong><small>Publicados</small></div></div>
          <div className="metric-card"><span className="metric-icon">◔</span><div><strong>{visao.totais.emAndamento}</strong><small>Em andamento agora</small></div></div>
        </div>

        {visao.totais.semDataParaAndamento > 0 && <p className="muted">
          {visao.totais.semDataParaAndamento} evento(s) publicado(s) sem data de início não entram na
          conta de &quot;em andamento&quot;: sem a data não há como dizer, e chamar de zero seria afirmar
          o que não se sabe.
        </p>}

        {visao.contexto.indisponiveis.length > 0 && <p className="muted">
          Indicadores ainda não coletados por esta fonte: {visao.contexto.indisponiveis.join(', ')}.
        </p>}

        <Dimensao titulo="Por situação" baldes={visao.porSituacao} rotulos={rotulosDeSituacao}
          expandido={expandido} aoExpandir={setExpandido} prefixo="sit" />
        <Dimensao titulo="Por formato" baldes={visao.porFormato} rotulos={rotulosDeFormato}
          expandido={expandido} aoExpandir={setExpandido} prefixo="fmt" />
        <Dimensao titulo="Por área temática"
          baldes={visao.semArea.total > 0 ? [...visao.porArea, visao.semArea] : visao.porArea}
          rotulos={{}} expandido={expandido} aoExpandir={setExpandido} prefixo="area"
          nota="Um evento com duas áreas aparece nas duas. A soma por área é maior que o total de eventos, e é assim mesmo." />

        <section className="card" style={{ padding: '1.25rem', marginTop: '2rem' }}>
          <h2>Chave de backup</h2>
          <p className="muted">
            Registre uma segunda chave e guarde-a em outro lugar físico. Com uma chave só, perdê-la
            significa perder o acesso à Área Master.
          </p>
          <button className="btn btn-secondary" onClick={registrarChaveDeBackup} disabled={ocupado}>
            {ocupado ? 'Aguardando a chave...' : 'Registrar chave de backup'}
          </button>
        </section>

        {trilha && <section className="card" style={{ padding: '1.25rem', marginTop: '2rem' }} aria-labelledby="trilha-titulo">
          <h2 id="trilha-titulo">Trilha de auditoria</h2>
          <p className="muted">
            {trilha.mostrados} registro(s)
            {trilha.truncado && ' — a lista foi cortada, e os números abaixo são desta página, não do total'}.
            {' '}Permitidas {trilha.porResultado.ALLOWED}, recusadas {trilha.porResultado.DENIED},
            falhas {trilha.porResultado.FAILED}.
          </p>
          {trilha.itens.length === 0
            ? <p className="muted">Nenhuma ação registrada ainda.</p>
            : <ul>
              {trilha.itens.map((item) => <li key={item.correlacao + item.quando}>
                <strong>{rotuloDaAcao(item.acao)}</strong>
                {' · '}<span className={`event-status status-${item.resultado === 'ALLOWED' ? 'published' : 'suspended'}`}>
                  {rotulosDeResultado[item.resultado] ?? item.resultado}
                </span>
                {' · '}{quando(item.quando)}
                {item.motivo && <><br /><span className="muted">{item.motivo}</span></>}
              </li>)}
            </ul>}
        </section>}
      </>}
    </section>
  </main>;
}

/**
 * Uma dimensão da visão geral.
 *
 * Clicar no número abre os ids que o compõem — o contrato do backend é que o
 * número É a lista, então a expansão não faz uma segunda consulta que poderia
 * discordar da contagem. Os ids aparecem crus e isso está dito na tela: até a
 * rota de catálogo existir, não há nome para mostrar, e inventar um seria pior.
 */
function Dimensao({ titulo, baldes, rotulos, expandido, aoExpandir, prefixo, nota }: {
  titulo: string;
  baldes: Balde[];
  rotulos: Record<string, string>;
  expandido: string | null;
  aoExpandir: (chave: string | null) => void;
  prefixo: string;
  nota?: string;
}) {
  if (baldes.length === 0) return null;
  return <section className="card" style={{ padding: '1.25rem', marginTop: '1.5rem' }}>
    <h2>{titulo}</h2>
    {nota && <p className="muted">{nota}</p>}
    <ul>
      {baldes.map((balde) => {
        const id = `${prefixo}:${balde.chave}`;
        const aberto = expandido === id;
        return <li key={id}>
          <button className="btn btn-ghost-dark" aria-expanded={aberto}
            onClick={() => aoExpandir(aberto ? null : id)}>
            {rotulos[balde.chave] ?? balde.chave}: <strong>{balde.total}</strong>
          </button>
          {aberto && <div className="muted" style={{ marginTop: '0.5rem' }}>
            {balde.eventIds.length} identificador(es) — o nome de cada evento depende do catálogo,
            que ainda não tem rota:
            <br />{balde.eventIds.join(', ')}
          </div>}
        </li>;
      })}
    </ul>
  </section>;
}
