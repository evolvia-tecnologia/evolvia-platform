/**
 * Leitura e resumo de um PEDIDO DE CONCESSÃO da Área Master (#665).
 *
 * `platform-grant-policy.ts` responde "pode?". Este arquivo responde duas
 * outras perguntas, e nenhuma delas é a mesma:
 *
 *   1. O que o proprietário está pedindo é um pedido válido?
 *   2. O que exatamente ele vai causar, dito em português, ANTES de confirmar?
 *
 * A segunda existe porque a ordem pede resumo legível antes de conceder, com
 * eventos futuros e ações sensíveis em destaque. Concessão é a operação em que
 * o erro não aparece na hora: ninguém percebe que deu poder demais até alguém
 * usar. A tela de confirmação é a última chance de perceber, e ela só serve se
 * o texto vier do servidor — resumo montado na interface é resumo que um dia
 * descreve uma concessão diferente da que o servidor grava.
 *
 * Sem dependência nenhuma, nem de tipo. Roda no harness sem build.
 */

/** Espelha `ACOES_CONCEDIVEIS` de `platform-grant-policy.ts`. */
export const ACOES_PEDIVEIS = [
  'consultar',
  'auditar',
  'relatorios',
  'suporte',
  'suspender',
  'desbloquear',
  'excluir',
  'restaurar',
] as const;

export type AcaoPedivel = (typeof ACOES_PEDIVEIS)[number];

/** Ações que mudam o que o participante vê ou o que o organizador pode fazer. */
export const ACOES_SENSIVEIS = ['suspender', 'desbloquear', 'excluir', 'restaurar'] as const;

export const ROTULOS: Readonly<Record<AcaoPedivel, string>> = {
  consultar: 'consultar',
  auditar: 'auditar',
  relatorios: 'emitir relatórios',
  suporte: 'prestar suporte',
  suspender: 'suspender evento',
  desbloquear: 'desbloquear evento',
  excluir: 'excluir evento',
  restaurar: 'restaurar evento',
};

export const MAX_PESSOAS = 50;
export const MAX_EVENTOS = 200;
export const MOTIVO_MINIMO = 10;
export const MOTIVO_MAXIMO = 200;

/**
 * Nomes dos campos do corpo, numa fonte só.
 *
 * Existem como constante, e não como literal espalhado, porque é isto que o
 * formulário usa para destacar o que foi recusado. Um nome digitado errado num
 * dos quinze pontos de recusa não quebraria teste nenhum: produziria um
 * destaque que cai no vazio, em silêncio. Aqui um erro de digitação não
 * compila. O caminho pontuado segue o mesmo formato que `flattenValidationErrors`
 * já produz para campo aninhado, para a tela não precisar de duas regras.
 */
export const CAMPOS = {
  corpo: '',
  pessoas: 'pessoas',
  acoes: 'acoes',
  escopo: 'escopo',
  organizacao: 'escopo.organizationId',
  eventos: 'escopo.eventIds',
  motivo: 'motivo',
  prazo: 'expiraEm',
} as const;

/** Problema com o campo que o formulário deve destacar. */
export type ProblemaDoPedido = {
  readonly campo: string;
  readonly mensagem: string;
};

export type EscopoPedido =
  | { tipo: 'GLOBAL' }
  | { tipo: 'ORGANIZACAO'; organizationId: string }
  | { tipo: 'EVENTOS'; eventIds: string[] };

export type PedidoDeConcessao = {
  pessoas: string[];
  acoes: AcaoPedivel[];
  escopo: EscopoPedido;
  motivo: string;
  expiraEm: string | null;
};

export type LeituraDoPedido =
  | { ok: true; pedido: PedidoDeConcessao }
  | {
    ok: false;
    /** Problemas com o campo recusado. Fonte única. */
    problemas: ProblemaDoPedido[];
    /** As mesmas mensagens, sem o campo. Derivado de `problemas`, nunca mantido em paralelo. */
    erros: string[];
  };

const identificador = (valor: unknown): string | null => {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  // Catálogo fechado também aqui: id é cuid, não texto livre. Um id com
  // caractere estranho não existe no banco, então aceitá-lo só serviria para
  // levar lixo adiante e aparecer como "nenhum resultado" lá na frente.
  return /^[A-Za-z0-9_-]{8,64}$/u.test(limpo) ? limpo : null;
};

function unicos(valores: readonly string[]): string[] {
  return [...new Set(valores)];
}

/** Uma recusa, com `erros` derivado de `problemas` em vez de repetido. */
const recusar = (problemas: readonly ProblemaDoPedido[]): LeituraDoPedido => ({
  ok: false,
  problemas: [...problemas],
  erros: problemas.map((problema) => problema.mensagem),
});

/**
 * Lê o corpo e acumula TODOS os problemas.
 *
 * Acumular em vez de parar no primeiro é a mesma decisão da rota de agenda:
 * quem monta uma concessão com pessoas, ações, alcance e prazo quer saber dos
 * quatro, não descobrir um por tentativa.
 *
 * Cada problema sai com o CAMPO a que pertence. Antes saía só a frase, e o
 * contrato de erro da plataforma ia com `field` vazio: a mensagem certa, mas
 * sem nada para o formulário destacar nem para o leitor de tela anunciar. Num
 * pedido com quatro problemas, isso obrigava a pessoa a descobrir sozinha a
 * qual campo cada frase se referia.
 */
export function validarPedidoDeConcessao(corpo: unknown, agora: number = Date.now()): LeituraDoPedido {
  const problemas: ProblemaDoPedido[] = [];
  const recusa = (campo: string, mensagem: string) => problemas.push({ campo, mensagem });

  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    // Corpo inteiro inválido não tem campo: o problema não é de um campo.
    return recusar([{ campo: CAMPOS.corpo, mensagem: 'Pedido inválido.' }]);
  }
  const bruto = corpo as Record<string, unknown>;

  // --- pessoas
  const pessoasBrutas = Array.isArray(bruto.pessoas) ? bruto.pessoas : null;
  let pessoas: string[] = [];
  if (!pessoasBrutas || pessoasBrutas.length === 0) {
    recusa(CAMPOS.pessoas, 'Escolha ao menos uma pessoa para receber a concessão.');
  } else if (pessoasBrutas.length > MAX_PESSOAS) {
    recusa(CAMPOS.pessoas, `Escolha no máximo ${MAX_PESSOAS} pessoas por concessão.`);
  } else {
    const lidas = pessoasBrutas.map(identificador);
    if (lidas.some((item) => item === null)) {
      recusa(CAMPOS.pessoas, 'Há pessoa inválida na lista.');
    } else {
      pessoas = unicos(lidas as string[]);
    }
  }

  // --- ações
  const acoesBrutas = Array.isArray(bruto.acoes) ? bruto.acoes : null;
  let acoes: AcaoPedivel[] = [];
  if (!acoesBrutas || acoesBrutas.length === 0) {
    recusa(CAMPOS.acoes, 'Escolha ao menos uma ação.');
  } else {
    const desconhecidas = acoesBrutas.filter(
      (item) => typeof item !== 'string' || !(ACOES_PEDIVEIS as readonly string[]).includes(item),
    );
    if (desconhecidas.length > 0) {
      recusa(CAMPOS.acoes, 'Há ação que não existe no catálogo da Área Master.');
    } else {
      // Ordem do catálogo, não a de chegada: o resumo tem de ser estável para
      // quem confere duas vezes.
      const pedidas = new Set(acoesBrutas as string[]);
      acoes = ACOES_PEDIVEIS.filter((acao) => pedidas.has(acao));
    }
  }

  // --- escopo
  let escopo: EscopoPedido | null = null;
  const escopoBruto = bruto.escopo;
  if (!escopoBruto || typeof escopoBruto !== 'object' || Array.isArray(escopoBruto)) {
    recusa(CAMPOS.escopo, 'Escolha o alcance da concessão.');
  } else {
    const pedido = escopoBruto as Record<string, unknown>;
    if (pedido.tipo === 'GLOBAL') {
      escopo = { tipo: 'GLOBAL' };
    } else if (pedido.tipo === 'ORGANIZACAO') {
      const organizationId = identificador(pedido.organizationId);
      // Campo do subcampo, não do escopo: quem escolheu "organização" e errou
      // o id precisa que o destaque caia no seletor de organização.
      if (!organizationId) recusa(CAMPOS.organizacao, 'Escolha a organização do alcance.');
      else escopo = { tipo: 'ORGANIZACAO', organizationId };
    } else if (pedido.tipo === 'EVENTOS') {
      const lista = Array.isArray(pedido.eventIds) ? pedido.eventIds : null;
      if (!lista || lista.length === 0) {
        recusa(CAMPOS.eventos, 'Escolha ao menos um evento.');
      } else if (lista.length > MAX_EVENTOS) {
        recusa(CAMPOS.eventos, `Escolha no máximo ${MAX_EVENTOS} eventos por concessão.`);
      } else {
        const lidos = lista.map(identificador);
        if (lidos.some((item) => item === null)) recusa(CAMPOS.eventos, 'Há evento inválido na lista.');
        else escopo = { tipo: 'EVENTOS', eventIds: unicos(lidos as string[]) };
      }
    } else {
      recusa(CAMPOS.escopo, 'O alcance da concessão é inválido.');
    }
  }

  // --- motivo
  const motivo = typeof bruto.motivo === 'string' ? bruto.motivo.trim().replace(/\s+/gu, ' ') : '';
  if (motivo.length < MOTIVO_MINIMO) {
    recusa(CAMPOS.motivo, `Informe o motivo da concessão, com pelo menos ${MOTIVO_MINIMO} caracteres.`);
  } else if (motivo.length > MOTIVO_MAXIMO) {
    recusa(CAMPOS.motivo, `O motivo excede ${MOTIVO_MAXIMO} caracteres.`);
  }

  // --- prazo opcional
  let expiraEm: string | null = null;
  if (bruto.expiraEm !== undefined && bruto.expiraEm !== null) {
    if (typeof bruto.expiraEm !== 'string') {
      recusa(CAMPOS.prazo, 'O prazo informado não é uma data válida.');
    } else {
      const quando = new Date(bruto.expiraEm).getTime();
      if (Number.isNaN(quando)) recusa(CAMPOS.prazo, 'O prazo informado não é uma data válida.');
      else if (quando <= agora) recusa(CAMPOS.prazo, 'O prazo precisa ser no futuro.');
      else expiraEm = new Date(quando).toISOString();
    }
  }

  if (problemas.length > 0 || !escopo) {
    // `!escopo` sem problema acumulado não acontece, mas devolver sucesso com
    // escopo nulo seria pior do que a checagem redundante. E ela não é
    // redundante para o compilador: sem ela, `escopo` chega ao retorno como
    // `EscopoPedido | null` e o typecheck reprova com TS2322.
    return recusar(
      problemas.length > 0
        ? problemas
        : [{ campo: CAMPOS.escopo, mensagem: 'Escolha o alcance da concessão.' }],
    );
  }
  return { ok: true, pedido: { pessoas, acoes, escopo, motivo, expiraEm } };
}

export type ResumoDaConcessao = {
  linhas: string[];
  destaques: string[];
  alcancaEventosFuturos: boolean;
  acoesSensiveis: AcaoPedivel[];
};

const plural = (n: number, um: string, muitos: string) => (n === 1 ? um : muitos);

/**
 * O que a tela mostra antes de confirmar, montado no servidor.
 *
 * `nomes` é opcional e serve só para a leitura ficar humana; sem ele, o resumo
 * conta quantas pessoas, nunca inventa nome. Id de pessoa não entra no texto:
 * resumo é para ler, não para conferir chave estrangeira.
 */
export function resumoDaConcessao(
  pedido: PedidoDeConcessao,
  nomes?: Readonly<Record<string, string>>,
): ResumoDaConcessao {
  const quemLista = pedido.pessoas
    .map((id) => nomes?.[id])
    .filter((nome): nome is string => typeof nome === 'string' && nome.trim().length > 0);
  const quem = quemLista.length === pedido.pessoas.length && quemLista.length > 0
    ? quemLista.join(', ')
    : `${pedido.pessoas.length} ${plural(pedido.pessoas.length, 'pessoa', 'pessoas')}`;

  const acoes = pedido.acoes.map((acao) => ROTULOS[acao]).join(', ');

  let alcance: string;
  if (pedido.escopo.tipo === 'GLOBAL') {
    alcance = 'todos os eventos da plataforma, inclui eventos futuros';
  } else if (pedido.escopo.tipo === 'ORGANIZACAO') {
    alcance = 'todos os eventos de uma organização, inclui eventos futuros dela';
  } else {
    const total = pedido.escopo.eventIds.length;
    alcance = `${total} ${plural(total, 'evento selecionado', 'eventos selecionados')}`;
  }

  const acoesSensiveis = pedido.acoes.filter(
    (acao) => (ACOES_SENSIVEIS as readonly string[]).includes(acao),
  );
  const alcancaEventosFuturos = pedido.escopo.tipo !== 'EVENTOS';

  const linhas = [
    `Quem recebe: ${quem}`,
    `Poderes: ${acoes}`,
    `Alcance: ${alcance}`,
    `Motivo: ${pedido.motivo}`,
    pedido.expiraEm ? `Prazo: até ${pedido.expiraEm}` : 'Prazo: sem data de fim',
  ];

  const destaques: string[] = [];
  if (alcancaEventosFuturos) {
    destaques.push('Esta concessão alcança também eventos criados depois de hoje.');
  }
  if (acoesSensiveis.length > 0) {
    destaques.push(
      `Inclui ${plural(acoesSensiveis.length, 'ação sensível', 'ações sensíveis')}: `
      + `${acoesSensiveis.map((acao) => ROTULOS[acao]).join(', ')}. `
      + 'Cada uso exige motivo escrito e verificação reforçada.',
    );
  }
  if (!pedido.expiraEm) {
    destaques.push('Sem prazo: a concessão vale até você revogar.');
  }

  return { linhas, destaques, alcancaEventosFuturos, acoesSensiveis: [...acoesSensiveis] };
}
