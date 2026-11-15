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
 * Três blocos: a entrada com chave, as contagens da plataforma e a lista de
 * eventos com busca, ordem e página. Clicar num número do painel FILTRA a
 * lista e não mexe nas contagens — é a leitura de "clicar em um número deve
 * abrir os eventos que o compõem", já que o backend garante que o número É a
 * lista. Numa versão anterior esta tela abria os ids crus, porque a rota de
 * catálogo não existia; id nunca foi resposta para uma pessoa.
 *
 * A busca tem submissão explícita, não a cada tecla: digitar "congresso"
 * dispararia nove requisições, e a lista recarrega quando a pessoa pede.
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

type ItemDoCatalogo = {
  id: string;
  nome: string;
  tipo: string;
  organizacao: string | null;
  situacao: string;
  formato: string;
  areas: string[];
  inicio: string | null;
  atualizadoEm: string;
  removido: boolean;
};

type Catalogo = {
  itens: ItemDoCatalogo[];
  total: number;
  pagina: number;
  limite: number;
  paginas: number;
};

/** O recorte que a LISTA usa. O painel continua contando sobre tudo. */
type RecorteDaLista = { situacoes?: string[]; formatos?: string[]; areas?: string[] };

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
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);

  // Controles da lista. `busca` é o que está digitado; `termo` é o que foi
  // submetido — separados de propósito, para a lista não recarregar a cada
  // tecla. Sem isso, digitar "congresso" dispara nove requisições e a tela
  // pisca; com `debounce` dispararia menos, mas ainda sem a pessoa pedir.
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  const [ordem, setOrdem] = useState('recentes');
  const [pagina, setPagina] = useState(1);
  const [recorteDaLista, setRecorteDaLista] = useState<RecorteDaLista>({});

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

  /** Erro que volta ao passo de entrada quando a sessão caiu. */
  const tratar = useCallback((reason: unknown, padrao: string) => {
    if (reason instanceof SessaoMasterAusente) {
      setPasso('entrar');
      setErro(reason.message);
      return;
    }
    setErro(reason instanceof Error ? reason.message : padrao);
  }, []);

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
      tratar(reason, 'Não foi possível carregar a Área Master.');
    }
  }, [tratar]);

  const carregarLista = useCallback(async () => {
    try {
      const corpo: Record<string, unknown> = { ordem, pagina, limite: 12, ...recorteDaLista };
      if (termo.length > 0) corpo.termo = termo;
      setCatalogo(await apiMaster<Catalogo>('/platform/master/catalog', {
        method: 'POST', body: JSON.stringify(corpo),
      }));
    } catch (reason) {
      tratar(reason, 'Não foi possível carregar a lista de eventos.');
    }
  }, [ordem, pagina, recorteDaLista, termo, tratar]);

  useEffect(() => { if (passo === 'dentro') void carregar(); }, [passo, carregar]);
  useEffect(() => { if (passo === 'dentro') void carregarLista(); }, [passo, carregarLista]);

  /** Clicar num número do painel filtra a LISTA, sem mexer nas contagens. */
  const filtrarLista = useCallback((recorte: RecorteDaLista) => {
    setRecorteDaLista(recorte);
    setPagina(1);
  }, []);

  const temFiltroDaLista = Object.keys(recorteDaLista).length > 0;

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
      setCatalogo(null);
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
          aoAbrir={(chave) => filtrarLista({ situacoes: [chave] })} />
        <Dimensao titulo="Por formato" baldes={visao.porFormato} rotulos={rotulosDeFormato}
          aoAbrir={(chave) => filtrarLista({ formatos: [chave] })} />
        <Dimensao titulo="Por área temática" baldes={visao.porArea} rotulos={{}}
          aoAbrir={(chave) => filtrarLista({ areas: [chave] })}
          nota={'Um evento com duas áreas aparece nas duas, então a soma por área é maior que o total de eventos'
            + ` — e é assim mesmo. ${visao.semArea.total} evento(s) não têm área e não aparecem nesta quebra.`} />

        <section className="card" style={{ padding: '1.25rem', marginTop: '2rem' }} aria-labelledby="lista-titulo">
          <div className="events-section-head">
            <div>
              <h2 id="lista-titulo">Eventos</h2>
              <p>
                {catalogo
                  ? `${catalogo.total} evento(s) no recorte${catalogo.paginas > 1 ? `, página ${catalogo.pagina} de ${catalogo.paginas}` : ''}.`
                  : 'Carregando a lista...'}
              </p>
            </div>
            <select className="select organization-filter" value={ordem} aria-label="Ordenar eventos"
              onChange={(e) => { setOrdem(e.target.value); setPagina(1); }}>
              <option value="recentes">Mais recentes</option>
              <option value="nome">Nome</option>
              <option value="inicio">Data de início</option>
            </select>
          </div>

          {/* Submissão explícita, não busca a cada tecla: a lista recarrega quando
              a pessoa pede, e não nove vezes enquanto ela digita. */}
          <form onSubmit={(e) => { e.preventDefault(); setTermo(busca.trim()); setPagina(1); }}
            style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0', flexWrap: 'wrap' }}>
            <input className="input" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, tipo ou organização" aria-label="Buscar eventos"
              style={{ flex: '1 1 16rem' }} />
            <button className="btn btn-secondary" type="submit">Buscar</button>
            {(termo.length > 0 || temFiltroDaLista) && <button className="btn btn-secondary" type="button"
              onClick={() => { setBusca(''); setTermo(''); setRecorteDaLista({}); setPagina(1); }}>
              Limpar filtros
            </button>}
          </form>

          {temFiltroDaLista && <p className="muted">
            A lista está filtrada pelo que você abriu no painel. Os números acima continuam
            contando a plataforma inteira.
          </p>}

          {!catalogo ? <div className="events-skeleton"><div /><div /><div /></div>
            : catalogo.itens.length === 0
              ? <div className="card" style={{ padding: '2rem' }}>
                <h3>Nenhum evento neste recorte</h3>
                <p className="muted">
                  {termo.length > 0
                    ? `Nada encontrado para “${termo}”. Tente outro termo ou limpe os filtros.`
                    : 'Ajuste o recorte ou limpe os filtros para ver todos os eventos.'}
                </p>
              </div>
              : <>
                <div className="events-grid premium-events-grid">
                  {catalogo.itens.map((item) => <article className="event-card" key={item.id}>
                    <div className="event-card-head">
                      <span className={`event-status status-${item.situacao.toLowerCase()}`}>
                        {rotulosDeSituacao[item.situacao] ?? item.situacao}
                      </span>
                      <span className="event-format">{rotulosDeFormato[item.formato] ?? item.formato}</span>
                    </div>
                    <div className="event-card-body">
                      <small>{item.organizacao ?? 'Sem organização'}</small>
                      <h3>{item.nome}</h3>
                      <p>{item.tipo}</p>
                    </div>
                    {item.areas.length > 0 && <div className="event-capabilities">
                      {item.areas.map((area) => <span key={area}>{area}</span>)}
                    </div>}
                    <div className="event-card-footer">
                      <span>
                        {item.inicio
                          ? `Início ${new Date(item.inicio).toLocaleDateString('pt-BR')}`
                          : 'Sem data de início'}
                      </span>
                      {item.removido && <strong>Removido pela plataforma</strong>}
                    </div>
                  </article>)}
                </div>

                {catalogo.paginas > 1 && <div className="nav-actions" style={{ marginTop: '1.5rem' }}>
                  <button className="btn btn-secondary" disabled={catalogo.pagina <= 1 || ocupado}
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}>Anterior</button>
                  <span className="muted">Página {catalogo.pagina} de {catalogo.paginas}</span>
                  <button className="btn btn-secondary" disabled={catalogo.pagina >= catalogo.paginas || ocupado}
                    onClick={() => setPagina((p) => p + 1)}>Próxima</button>
                </div>}
              </>}
        </section>

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
                {' · '}<span className={item.resultado === 'ALLOWED' ? 'event-status status-published' : 'event-status'}>
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
 * Clicar no número FILTRA A LISTA abaixo, e não mexe nas contagens. É a leitura
 * do requisito "clicar em um número deve abrir os eventos que o compõem": o
 * backend garante que o número É a lista, então filtrar a lista pela mesma
 * dimensão mostra exatamente aqueles eventos — com nome, que é o que falta num
 * id.
 *
 * Antes isto abria os ids crus. Ids não são nomes, e mostrar `cm9x8...` para
 * uma pessoa nunca foi resposta; era o que havia enquanto a rota de catálogo
 * não existia.
 */
function Dimensao({ titulo, baldes, rotulos, aoAbrir, nota }: {
  titulo: string;
  baldes: Balde[];
  rotulos: Record<string, string>;
  aoAbrir: (chave: string) => void;
  nota?: string;
}) {
  if (baldes.length === 0) return null;
  return <section className="card" style={{ padding: '1.25rem', marginTop: '1.5rem' }}>
    <h2>{titulo}</h2>
    {nota && <p className="muted">{nota}</p>}
    <ul>
      {baldes.map((balde) => <li key={balde.chave}>
        <button className="btn btn-secondary" onClick={() => aoAbrir(balde.chave)}>
          {rotulos[balde.chave] ?? balde.chave}: <strong>{balde.total}</strong>
        </button>
      </li>)}
    </ul>
  </section>;
}
