/**
 * Moderação de eventos pela plataforma (#665, decisão do fundador de 14/11).
 *
 * Problema
 * --------
 * O proprietário precisa suspender, liberar e remover eventos que infrinjam
 * regras. Três coisas tornam isso perigoso, e são elas que este módulo resolve:
 *
 *  1. **"Restaurar" pode publicar o que nunca foi publicado.** Se a suspensão
 *     altera o `status` do evento e a liberação devolve um valor fixo, um
 *     rascunho suspenso volta publicado. O estado anterior tem de ser
 *     fotografado e devolvido exatamente.
 *  2. **A segunda suspensão apaga a memória da primeira.** Suspender já
 *     suspenso sobrescreveria a fotografia pelo próprio estado suspenso, e a
 *     volta ao original fica impossível. Por isso é recusada, não idempotente.
 *  3. **Suspensão da plataforma não é cancelamento do organizador.** São fatos
 *     diferentes, com responsáveis diferentes, e precisam viver em lugares
 *     diferentes — daí a tabela aditiva separada, e não um valor novo no
 *     `status` do evento.
 *
 * Módulo puro: sem Prisma, sem Nest, sem I/O. Decide e descreve; quem grava é
 * a transação, que aplica estado e trilha juntos.
 *
 * `deny-by-default`: entrada inesperada nega.
 */

/** Estado de moderação, separado do `status` do evento de propósito. */
export const ESTADOS = ['ATIVO', 'SUSPENSO', 'REMOVIDO'] as const;
export type EstadoDeModeracao = (typeof ESTADOS)[number];

export const ACOES = ['suspender', 'liberar', 'remover', 'restaurar'] as const;
export type AcaoDeModeracao = (typeof ACOES)[number];

/**
 * Classificação do motivo. Existe para que o relatório possa agrupar sem ler
 * texto livre, e para que "suspeita de fraude" seja distinguível de "pedido do
 * próprio organizador" — que têm consequências legais diferentes.
 */
export const CLASSIFICACOES = [
  'FRAUDE_SUSPEITA',
  'VIOLACAO_DE_REGRA',
  'CONDUTA',
  'ORDEM_JUDICIAL',
  'PEDIDO_DO_ORGANIZADOR',
  'OUTRO',
] as const;
export type Classificacao = (typeof CLASSIFICACOES)[number];

export const LIMITE_DO_MOTIVO = 200;
export const LIMITE_DA_REFERENCIA = 64;

export type MotivoDeRecusa =
  | 'acao_desconhecida'
  | 'estado_desconhecido'
  | 'ator_nao_e_master'
  | 'classificacao_invalida'
  | 'motivo_obrigatorio'
  | 'motivo_muito_longo'
  | 'referencia_obrigatoria'
  | 'referencia_muito_longa'
  | 'ja_suspenso'
  | 'nao_esta_suspenso'
  | 'ja_removido'
  | 'nao_esta_removido'
  | 'remocao_exige_suspensao_previa'
  | 'remocao_exige_segunda_aprovacao'
  | 'segunda_aprovacao_do_mesmo_ator'
  | 'status_original_ausente';

export interface Pedido {
  readonly acao: unknown;
  readonly estadoAtual: unknown;
  /** `status` do evento AGORA, como está no banco. */
  readonly statusDoEvento: unknown;
  /** Fotografia guardada na moderação, quando já existe. */
  readonly statusOriginal?: string | null;
  /** Estado de moderação antes da remoção, para a restauração. */
  readonly estadoAnterior?: EstadoDeModeracao | null;
  readonly ehMaster: unknown;
  readonly atorUserId: unknown;
  readonly classificacao: unknown;
  readonly motivo: unknown;
  readonly referenciaDoCaso: unknown;
  /** Remoção sem suspensão antes: permitida só se pedida explicitamente. */
  readonly permitirSemSuspensaoPrevia?: boolean;
  /** Segunda aprovação, exigida para remover. */
  readonly segundaAprovacaoPor?: unknown;
}

export interface Veredito {
  readonly permitido: boolean;
  readonly motivo: MotivoDeRecusa | null;
  /** `true` = nada a fazer, e não é erro. */
  readonly idempotente: boolean;
  readonly estadoNovo: EstadoDeModeracao | null;
  /** `status` que o evento deve passar a ter, ou `null` para não mexer. */
  readonly statusDoEventoNovo: string | null;
  /** Fotografia a gravar; `null` apaga, `undefined` preserva a existente. */
  readonly statusOriginalNovo: string | null | undefined;
  readonly motivoTexto: string;
  readonly referencia: string;
}

/** `status` do evento enquanto a plataforma o mantém fora do ar. */
export const STATUS_SUSPENSO_PELA_PLATAFORMA = 'SUSPENDED';

const ehEstado = (v: unknown): v is EstadoDeModeracao =>
  typeof v === 'string' && (ESTADOS as readonly string[]).includes(v);
const ehAcao = (v: unknown): v is AcaoDeModeracao =>
  typeof v === 'string' && (ACOES as readonly string[]).includes(v);
const ehClassificacao = (v: unknown): v is Classificacao =>
  typeof v === 'string' && (CLASSIFICACOES as readonly string[]).includes(v);

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const recusa = (motivo: MotivoDeRecusa): Veredito => ({
  permitido: false,
  motivo,
  idempotente: false,
  estadoNovo: null,
  statusDoEventoNovo: null,
  statusOriginalNovo: undefined,
  motivoTexto: '',
  referencia: '',
});

const nadaAFazer = (motivo: MotivoDeRecusa): Veredito => ({ ...recusa(motivo), idempotente: true });

/**
 * Decide uma ação de moderação.
 *
 * A ordem das recusas é deliberada: autorização antes de forma, forma antes de
 * transição. Assim quem não é Master nunca descobre, pela mensagem, em que
 * estado o evento está.
 */
export function decidirModeracao(pedido: Pedido): Veredito {
  if (!ehAcao(pedido.acao)) return recusa('acao_desconhecida');
  if (!ehEstado(pedido.estadoAtual)) return recusa('estado_desconhecido');
  if (pedido.ehMaster !== true) return recusa('ator_nao_e_master');

  const ator = texto(pedido.atorUserId);
  if (ator === '') return recusa('ator_nao_e_master');

  if (!ehClassificacao(pedido.classificacao)) return recusa('classificacao_invalida');

  const motivoTexto = texto(pedido.motivo);
  if (motivoTexto === '') return recusa('motivo_obrigatorio');
  if (motivoTexto.length > LIMITE_DO_MOTIVO) return recusa('motivo_muito_longo');

  const referencia = texto(pedido.referenciaDoCaso);
  if (referencia === '') return recusa('referencia_obrigatoria');
  if (referencia.length > LIMITE_DA_REFERENCIA) return recusa('referencia_muito_longa');

  const statusAgora = texto(pedido.statusDoEvento);
  const fotografia = typeof pedido.statusOriginal === 'string' ? pedido.statusOriginal : null;
  const concluir = (parcial: Partial<Veredito>): Veredito => ({
    permitido: true,
    motivo: null,
    idempotente: false,
    estadoNovo: null,
    statusDoEventoNovo: null,
    statusOriginalNovo: undefined,
    motivoTexto,
    referencia,
    ...parcial,
  });

  if (pedido.acao === 'suspender') {
    // Recusa, não idempotência: suspender de novo sobrescreveria a fotografia
    // pelo próprio estado suspenso e tornaria a volta ao original impossível.
    if (pedido.estadoAtual === 'SUSPENSO') return recusa('ja_suspenso');
    if (pedido.estadoAtual === 'REMOVIDO') return recusa('nao_esta_removido');
    if (statusAgora === '') return recusa('status_original_ausente');
    return concluir({
      estadoNovo: 'SUSPENSO',
      statusDoEventoNovo: STATUS_SUSPENSO_PELA_PLATAFORMA,
      // Fotografia tirada na saída de ATIVO, e só aqui.
      statusOriginalNovo: statusAgora,
    });
  }

  if (pedido.acao === 'liberar') {
    if (pedido.estadoAtual === 'ATIVO') return nadaAFazer('nao_esta_suspenso');
    if (pedido.estadoAtual === 'REMOVIDO') return recusa('nao_esta_suspenso');
    // Sem fotografia não há como devolver o estado exato, e devolver um padrão
    // publicaria o que podia ser rascunho. Recusa é a única saída honesta.
    if (fotografia === null) return recusa('status_original_ausente');
    return concluir({
      estadoNovo: 'ATIVO',
      statusDoEventoNovo: fotografia,
      statusOriginalNovo: null,
    });
  }

  if (pedido.acao === 'remover') {
    if (pedido.estadoAtual === 'REMOVIDO') return nadaAFazer('ja_removido');
    if (pedido.estadoAtual === 'ATIVO' && pedido.permitirSemSuspensaoPrevia !== true) {
      return recusa('remocao_exige_suspensao_previa');
    }
    const segunda = texto(pedido.segundaAprovacaoPor);
    if (segunda === '') return recusa('remocao_exige_segunda_aprovacao');
    if (segunda === ator) return recusa('segunda_aprovacao_do_mesmo_ator');
    if (pedido.estadoAtual === 'ATIVO' && statusAgora === '') return recusa('status_original_ausente');
    return concluir({
      estadoNovo: 'REMOVIDO',
      statusDoEventoNovo: STATUS_SUSPENSO_PELA_PLATAFORMA,
      // Vindo de SUSPENSO a fotografia já existe e é preservada; vindo de
      // ATIVO ela é tirada agora. Sobrescrever a existente perderia o original.
      statusOriginalNovo: pedido.estadoAtual === 'ATIVO' ? statusAgora : undefined,
    });
  }

  // restaurar
  if (pedido.estadoAtual !== 'REMOVIDO') return recusa('nao_esta_removido');
  const anterior = pedido.estadoAnterior === 'SUSPENSO' ? 'SUSPENSO' : 'ATIVO';
  if (anterior === 'ATIVO') {
    if (fotografia === null) return recusa('status_original_ausente');
    return concluir({ estadoNovo: 'ATIVO', statusDoEventoNovo: fotografia, statusOriginalNovo: null });
  }
  // Voltar para SUSPENSO: o evento continua fora do ar, e a fotografia fica.
  return concluir({
    estadoNovo: 'SUSPENSO',
    statusDoEventoNovo: STATUS_SUSPENSO_PELA_PLATAFORMA,
    statusOriginalNovo: undefined,
  });
}

/** Operações que a moderação pode barrar. */
export const OPERACOES = [
  'divulgacao_publica',
  'nova_inscricao',
  'novo_pagamento',
  'acesso_operacional',
  'listagem_publica',
  'leitura_administrativa',
  'historico_e_auditoria',
] as const;
export type Operacao = (typeof OPERACOES)[number];

/**
 * O que cada estado barra.
 *
 * Preservar é tão importante quanto barrar: suspensão em caso de fraude não
 * pode apagar prova, inscrição paga nem trilha. Por isso leitura
 * administrativa e histórico nunca entram na lista de barrados — e há teste
 * que reprova se entrarem.
 */
export function barradasPor(estado: unknown): Operacao[] {
  if (estado === 'SUSPENSO') {
    return ['divulgacao_publica', 'nova_inscricao', 'novo_pagamento', 'acesso_operacional'];
  }
  if (estado === 'REMOVIDO') {
    return ['divulgacao_publica', 'nova_inscricao', 'novo_pagamento', 'acesso_operacional', 'listagem_publica'];
  }
  // Estado desconhecido não barra nada aqui de propósito: este módulo descreve
  // efeito, não autoriza. Quem autoriza é `permite()`, que falha fechada.
  return [];
}

/**
 * Autorização de uma operação sob moderação. Falha FECHADA: estado ou operação
 * desconhecidos negam, em vez de liberar.
 */
export function permite(estado: unknown, operacao: unknown): boolean {
  if (!ehEstado(estado)) return false;
  if (typeof operacao !== 'string' || !(OPERACOES as readonly string[]).includes(operacao)) return false;
  return !barradasPor(estado).includes(operacao as Operacao);
}

/**
 * O que o público vê. Nunca a classificação, nunca o motivo interno, nunca a
 * referência do caso: antes de apuração, acusação pública de fraude é risco
 * jurídico, e depois dela continua não sendo assunto do visitante.
 */
export function apresentacaoPublica(estado: unknown): { visivel: boolean; mensagem: string | null } {
  if (estado === 'SUSPENSO') {
    return { visivel: true, mensagem: 'Este evento está temporariamente indisponível.' };
  }
  if (estado === 'REMOVIDO') return { visivel: false, mensagem: null };
  if (estado === 'ATIVO') return { visivel: true, mensagem: null };
  return { visivel: false, mensagem: null };
}
