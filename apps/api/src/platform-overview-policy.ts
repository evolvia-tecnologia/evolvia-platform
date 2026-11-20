/**
 * Agregação da Visão geral da Área Master (#665), em módulo sem dependências.
 *
 * A ordem pede três coisas que entram em conflito se a contagem for ingênua:
 *
 *   1. quantos eventos foram criados, publicados e estão em andamento;
 *   2. filtros por período, organização, perfil, área e formato;
 *   3. "clicar em um número deve abrir os eventos que o compõem".
 *
 * E uma invariante explícita: um evento com DUAS áreas aparece nas duas
 * consultas e conta UMA ÚNICA VEZ no total geral.
 *
 * Essa invariante é o motivo deste arquivo existir separado. Área é o único
 * recorte multivalorado — um evento tem uma organização, um perfil, um formato
 * e uma situação, mas pode ter até três áreas. Qualquer agregação que some os
 * baldes de área para chegar ao total vai contar o mesmo evento duas vezes, e
 * o erro é silencioso: o painel mostra mais eventos do que existem e ninguém
 * desconfia, porque número grande não parece defeito.
 *
 * Por isso cada balde carrega os IDS que o compõem, não só a contagem. O
 * "clicar e abrir" deixa de ser uma segunda consulta que pode discordar do
 * número: a lista É a origem do número. Contagem e composição não podem
 * divergir porque são a mesma coisa.
 *
 * O que este arquivo NÃO faz: inventar indicador. Só agrega o que já existe na
 * tabela `Event`. A ordem proíbe "apresentar métricas que ainda não sejam
 * coletadas", e `indisponiveis` existe para dizer isso em vez de mostrar zero.
 */

export type SituacaoDoEvento =
  | 'DRAFT'
  | 'SETUP'
  | 'HOMOLOGATION'
  | 'READY_TO_PUBLISH'
  | 'PUBLISHED'
  | 'SUSPENDED'
  | 'FINISHED'
  | 'CANCELLED';

export type FormatoDoEvento = 'IN_PERSON' | 'ONLINE' | 'HYBRID';

/** Só o que a agregação lê. Nada de PII, nada de dado comercial. */
export type EventoParaVisaoGeral = {
  id: string;
  organizationId: string | null;
  profileCode: string | null;
  format: FormatoDoEvento;
  status: SituacaoDoEvento;
  subjectAreas: readonly string[];
  createdAt: Date | string;
  startDate: Date | string | null;
  endDate: Date | string | null;
};

/** Por qual data o período filtra. Explícito porque muda o significado. */
export type CampoDoPeriodo = 'createdAt' | 'startDate';

export type FiltroDaVisaoGeral = {
  de?: Date | string | null;
  ate?: Date | string | null;
  campoDoPeriodo?: CampoDoPeriodo;
  organizationIds?: readonly string[];
  profileCodes?: readonly string[];
  areas?: readonly string[];
  formatos?: readonly FormatoDoEvento[];
  situacoes?: readonly SituacaoDoEvento[];
};

/** Um recorte: a chave, quantos, e QUAIS. */
export type Balde = { chave: string; total: number; eventIds: string[] };

export type VisaoGeral = {
  totais: {
    criados: number;
    publicados: number;
    emAndamento: number;
    /** Publicados que não podem ser classificados em andamento por falta de data. */
    semDataParaAndamento: number;
  };
  composicao: {
    criados: string[];
    publicados: string[];
    emAndamento: string[];
    semDataParaAndamento: string[];
  };
  porArea: Balde[];
  semArea: Balde;
  porOrganizacao: Balde[];
  porPerfil: Balde[];
  porFormato: Balde[];
  porSituacao: Balde[];
  contexto: {
    campoDoPeriodo: CampoDoPeriodo;
    de: string | null;
    ate: string | null;
    fuso: string;
    atualizadoEm: string;
    /** Indicadores pedidos que esta fonte não coleta. Vazio é vazio, não zero. */
    indisponiveis: string[];
  };
};

const SEM_ORGANIZACAO = '(sem organização)';
const SEM_PERFIL = '(sem perfil)';
const SEM_AREA = '(sem área)';

function instante(valor: Date | string | null | undefined): number | null {
  if (!valor) return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  const tempo = data.getTime();
  return Number.isNaN(tempo) ? null : tempo;
}

const iso = (valor: Date | string | null | undefined): string | null => {
  const tempo = instante(valor);
  return tempo === null ? null : new Date(tempo).toISOString();
};

/**
 * Um evento está EM ANDAMENTO quando está publicado e o agora cai dentro do
 * intervalo dele.
 *
 * Evento publicado de um dia só, sem término, está em andamento no dia do
 * início: `endDate` ausente é tratado como "termina quando começa", e não como
 * "nunca termina". Tratar como infinito deixaria evento antigo em andamento
 * para sempre, e o painel diria que a plataforma está mais movimentada do que
 * está.
 *
 * Sem `startDate` não há resposta: não é zero, é desconhecido. Quem chama
 * recebe `null` e conta isso separado.
 */
export function emAndamento(evento: EventoParaVisaoGeral, agora: number): boolean | null {
  if (evento.status !== 'PUBLISHED') return false;
  const inicio = instante(evento.startDate);
  if (inicio === null) return null;
  const fim = instante(evento.endDate) ?? inicio;
  return inicio <= agora && agora <= fim;
}

function dentroDoPeriodo(
  evento: EventoParaVisaoGeral,
  filtro: FiltroDaVisaoGeral,
  campo: CampoDoPeriodo,
): boolean {
  const de = instante(filtro.de);
  const ate = instante(filtro.ate);
  if (de === null && ate === null) return true;

  const valor = instante(campo === 'createdAt' ? evento.createdAt : evento.startDate);
  // Evento sem a data do recorte não entra num período: incluí-lo seria
  // afirmar que ele cabe na janela, e não se sabe disso.
  if (valor === null) return false;
  if (de !== null && valor < de) return false;
  if (ate !== null && valor > ate) return false;
  return true;
}

/** Dentro de uma dimensão o filtro é OU; entre dimensões é E. */
function naLista(valor: string | null, lista: readonly string[] | undefined): boolean {
  if (!lista || lista.length === 0) return true;
  return valor !== null && lista.includes(valor);
}

export function selecionarEventos(
  eventos: readonly EventoParaVisaoGeral[],
  filtro: FiltroDaVisaoGeral = {},
): EventoParaVisaoGeral[] {
  const campo = filtro.campoDoPeriodo ?? 'createdAt';
  return eventos.filter((evento) => {
    if (!dentroDoPeriodo(evento, filtro, campo)) return false;
    if (!naLista(evento.organizationId, filtro.organizationIds)) return false;
    if (!naLista(evento.profileCode, filtro.profileCodes)) return false;
    if (!naLista(evento.format, filtro.formatos)) return false;
    if (!naLista(evento.status, filtro.situacoes)) return false;
    if (filtro.areas && filtro.areas.length > 0) {
      // Área é multivalorada: o evento entra se tiver QUALQUER uma das áreas
      // pedidas. É isso que faz um evento de duas áreas aparecer nas duas
      // consultas.
      if (!evento.subjectAreas.some((area) => filtro.areas!.includes(area))) return false;
    }
    return true;
  });
}

function balde(chave: string, eventos: readonly EventoParaVisaoGeral[]): Balde {
  const eventIds = eventos.map((evento) => evento.id);
  return { chave, total: eventIds.length, eventIds };
}

/** Baldes de dimensão de valor ÚNICO: a soma deles é igual ao total. */
function agruparPorUm(
  eventos: readonly EventoParaVisaoGeral[],
  chaveDe: (evento: EventoParaVisaoGeral) => string,
): Balde[] {
  const mapa = new Map<string, EventoParaVisaoGeral[]>();
  for (const evento of eventos) {
    const chave = chaveDe(evento);
    const atual = mapa.get(chave);
    if (atual) atual.push(evento);
    else mapa.set(chave, [evento]);
  }
  return [...mapa.keys()]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((chave) => balde(chave, mapa.get(chave)!));
}

/**
 * Monta a visão geral.
 *
 * `agora` e `fuso` entram como parâmetro porque a ordem exige explicitar fuso e
 * última atualização. A comparação é sempre por INSTANTE; o fuso é o rótulo que
 * a tela mostra, e não muda conta nenhuma — fuso que muda conta é fuso que
 * produz total diferente dependendo de quem olha.
 */
export function montarVisaoGeral(
  eventos: readonly EventoParaVisaoGeral[],
  filtro: FiltroDaVisaoGeral = {},
  opcoes: { agora?: number; fuso?: string; indisponiveis?: readonly string[] } = {},
): VisaoGeral {
  const agora = opcoes.agora ?? Date.now();
  const campoDoPeriodo = filtro.campoDoPeriodo ?? 'createdAt';
  const noEscopo = selecionarEventos(eventos, filtro);

  const publicados = noEscopo.filter((evento) => evento.status === 'PUBLISHED');
  const andamento: EventoParaVisaoGeral[] = [];
  const semData: EventoParaVisaoGeral[] = [];
  for (const evento of publicados) {
    const resposta = emAndamento(evento, agora);
    if (resposta === null) semData.push(evento);
    else if (resposta) andamento.push(evento);
  }

  // Área é a ÚNICA dimensão multivalorada. Um evento entra em cada balde de
  // área que tiver, e por isso a soma destes baldes NÃO é o total — o total
  // conta eventos distintos. Há teste fixando as duas coisas.
  const porAreaMapa = new Map<string, EventoParaVisaoGeral[]>();
  const semAreaLista: EventoParaVisaoGeral[] = [];
  for (const evento of noEscopo) {
    const areas = [...new Set(evento.subjectAreas)];
    if (areas.length === 0) {
      semAreaLista.push(evento);
      continue;
    }
    for (const area of areas) {
      const atual = porAreaMapa.get(area);
      if (atual) atual.push(evento);
      else porAreaMapa.set(area, [evento]);
    }
  }

  return {
    totais: {
      criados: noEscopo.length,
      publicados: publicados.length,
      emAndamento: andamento.length,
      semDataParaAndamento: semData.length,
    },
    composicao: {
      criados: noEscopo.map((evento) => evento.id),
      publicados: publicados.map((evento) => evento.id),
      emAndamento: andamento.map((evento) => evento.id),
      semDataParaAndamento: semData.map((evento) => evento.id),
    },
    porArea: [...porAreaMapa.keys()]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((area) => balde(area, porAreaMapa.get(area)!)),
    semArea: balde(SEM_AREA, semAreaLista),
    porOrganizacao: agruparPorUm(noEscopo, (evento) => evento.organizationId ?? SEM_ORGANIZACAO),
    porPerfil: agruparPorUm(noEscopo, (evento) => evento.profileCode ?? SEM_PERFIL),
    porFormato: agruparPorUm(noEscopo, (evento) => evento.format),
    porSituacao: agruparPorUm(noEscopo, (evento) => evento.status),
    contexto: {
      campoDoPeriodo,
      de: iso(filtro.de),
      ate: iso(filtro.ate),
      fuso: opcoes.fuso ?? 'America/Sao_Paulo',
      atualizadoEm: new Date(agora).toISOString(),
      indisponiveis: [...(opcoes.indisponiveis ?? [])],
    },
  };
}
