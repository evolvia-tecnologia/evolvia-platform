/**
 * Conversão do corpo salvo do rascunho para o que vai ao destinatário (G6.8).
 *
 * O DEFEITO QUE ISTO RESOLVE
 * --------------------------
 * `EventCommunicationDispatchService.deliver()` montava a mensagem com
 * `text: row.batch.body`. Mas `body` é o formato SERIALIZADO do editor, não
 * texto simples: `publication-text-style.ts` define marcadores
 * `[[fmt <fonte> <tamanho> <cor>]]…[[/fmt]]`. Enviado cru, o destinatário
 * recebe os marcadores no meio do texto e perde a formatação que viu na prévia.
 *
 * POR QUE MÓDULO PURO E SEPARADO: sem Nest, sem Prisma, sem I/O — roda em teste
 * sem banco e sem `node_modules`, que é a única forma de provar conversão e
 * escape neste ambiente. O service passa a chamar daqui.
 *
 * O QUE ESTE MÓDULO NÃO FAZ: não valida. A validação é de
 * `assertPublicationRichTextSafe`, que roda na ENTRADA e já recusa `<`, `>`,
 * caracteres de controle e `http://`. Aqui se assume que o corpo PODE não ter
 * passado por lá (linha legada, gravação por outro caminho) e por isso:
 *
 *   1. todo texto é escapado ao virar HTML, mesmo o que a validação proibiria
 *      — defesa em profundidade, não confiança na validação de entrada;
 *   2. os valores de fonte/tamanho/cor NUNCA são interpolados da entrada: são
 *      procurados nos conjuntos fechados e descartados se não constarem. É
 *      essa a diferença entre sanitizar e esperar que a entrada seja boa;
 *   3. corpo que não satisfaz a gramática devolve `confiavel: false`, para o
 *      chamador RECUSAR o envio em vez de mandar lixo a um terceiro.
 */

/** Conjuntos fechados, espelhando `publication-text-style.ts`. */
const FONTES = new Map<string, string>([
  ['sans', 'sans-serif'],
  ['serif', 'serif'],
]);
const TAMANHOS = new Set([12, 14, 16, 18, 20, 24]);
const CORES = new Set([
  'navy', 'navy-soft', 'blue', 'blue-soft', 'text', 'muted', 'success', 'warning', 'danger',
]);

const MARCADORES = /\[\[fmt\b[^\n]*?\]\]|\[\[fmt\b|\[\[\/fmt\]\]/gu;
const ABERTURA = /^\[\[fmt ([a-z-]+) (12|14|16|18|20|24) ([a-z-]+)\]\]$/u;
const FECHAMENTO = '[[/fmt]]';

export interface EstiloDoTrecho {
  readonly fonte: string;
  readonly tamanho: number;
  readonly cor: string;
}

export interface TrechoDaComunicacao {
  readonly texto: string;
  /** null = trecho sem formatação declarada. */
  readonly estilo: EstiloDoTrecho | null;
}

export interface ConteudoDaComunicacao {
  /** O que vai em `message.text`: sem nenhum marcador. */
  readonly textoSimples: string;
  /** Alternativa HTML, com escape e estilos só de valores permitidos. */
  readonly html: string;
  readonly trechos: readonly TrechoDaComunicacao[];
  /**
   * false = a gramática não fecha. O corpo NÃO deve ser enviado: preferir
   * recusar a entregar marcador ou texto truncado a um terceiro.
   */
  readonly confiavel: boolean;
  /** Por que `confiavel` é false, para o audit. Nunca inclui o corpo. */
  readonly motivo: string | null;
}

function estiloDe(marcador: string): EstiloDoTrecho | null {
  const m = ABERTURA.exec(marcador);
  if (!m) return null;
  const fonte = FONTES.get(m[1]);
  const tamanho = Number(m[2]);
  // `m[3]` é procurado no conjunto; nunca usado direto.
  if (fonte === undefined || !TAMANHOS.has(tamanho) || !CORES.has(m[3])) return null;
  return { fonte, tamanho, cor: m[3] };
}

/** Escapa para HTML. Os cinco, inclusive aspas, porque o resultado entra em atributo também. */
export function escaparHtml(valor: string): string {
  return valor
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

/**
 * Separa o corpo em trechos, consumindo os marcadores em ordem.
 *
 * Recusa pelos mesmos motivos que a validação de entrada recusaria —
 * aninhamento, fechamento sem abertura, abertura sem fechamento, valor fora dos
 * conjuntos —, mas devolvendo `confiavel: false` em vez de lançar, porque aqui
 * já é hora de ENVIO: lançar derrubaria o worker; recusar não envia e registra.
 */
export function converterCorpoDaComunicacao(corpo: unknown): ConteudoDaComunicacao {
  if (typeof corpo !== 'string') {
    return { textoSimples: '', html: '', trechos: [], confiavel: false, motivo: 'corpo_nao_e_texto' };
  }
  const texto = corpo.replace(/\r\n/gu, '\n');
  const trechos: TrechoDaComunicacao[] = [];
  let posicao = 0;
  let aberto: EstiloDoTrecho | null = null;
  let motivo: string | null = null;

  const empurrar = (conteudo: string, estilo: EstiloDoTrecho | null) => {
    if (conteudo !== '') trechos.push({ texto: conteudo, estilo });
  };

  for (const achado of texto.matchAll(MARCADORES)) {
    const marcador = achado[0];
    const inicio = achado.index ?? 0;
    empurrar(texto.slice(posicao, inicio), aberto);
    posicao = inicio + marcador.length;

    if (marcador === FECHAMENTO) {
      if (aberto === null) { motivo ??= 'fechamento_sem_abertura'; continue; }
      aberto = null;
      continue;
    }
    if (aberto !== null) { motivo ??= 'formatacao_aninhada'; continue; }
    const estilo = estiloDe(marcador);
    if (estilo === null) { motivo ??= 'formatacao_nao_permitida'; continue; }
    aberto = estilo;
  }
  empurrar(texto.slice(posicao), aberto);
  if (aberto !== null) motivo ??= 'formatacao_sem_fechamento';

  const textoSimples = trechos.map((trecho) => trecho.texto).join('');
  const html = trechos.map((trecho) => {
    const seguro = escaparHtml(trecho.texto);
    if (trecho.estilo === null) return seguro;
    // Atributos montados a partir do conjunto fechado, nunca da entrada: a
    // fonte sai do Map, o tamanho e numero ja validado, e a cor vai como
    // `data-` nomeado, nao como valor CSS. Ver a nota sobre a paleta abaixo.
    return `<span style="font-family:${trecho.estilo.fonte};font-size:${trecho.estilo.tamanho}px"`
      + ` data-evolvia-cor="${escaparHtml(trecho.estilo.cor)}">${seguro}</span>`;
  }).join('');

  return { textoSimples, html, trechos, confiavel: motivo === null, motivo };
}
