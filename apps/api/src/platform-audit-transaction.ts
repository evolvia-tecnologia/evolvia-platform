/**
 * Auditoria obrigatória das ações da Área Master (#665).
 *
 * Decisão do fundador, registrada na #665: se a gravação da auditoria falhar,
 * a mudança privilegiada é revertida na mesma transação. Este arquivo existe
 * para que isso seja uma garantia e não uma intenção.
 *
 * O caminho óbvio — envolver a gravação da auditoria num try/catch "para não
 * derrubar a operação" — é exatamente o que torna a auditoria opcional na
 * prática. Aqui a gravação fica DENTRO da transação e o erro sobe.
 *
 * A outra metade é menos óbvia e foi o que o schema revelou: `PlatformAuditResult`
 * tem `FAILED`, e um registro de falha NÃO pode ser gravado dentro da transação
 * que falhou — ele seria revertido junto com ela, e a tentativa desapareceria
 * justamente no caso em que mais importa saber que houve tentativa. Por isso:
 *
 *   - `ALLOWED`: muda e audita na MESMA transação. Auditoria falha, tudo volta.
 *   - `DENIED`:  não houve mudança, então a auditoria vai sozinha e persiste.
 *   - `FAILED`:  a transação já voltou; a auditoria é gravada FORA dela.
 *
 * Nenhum import. O acesso ao banco entra por dois callbacks, o que deixa a
 * garantia demonstrável sem PostgreSQL.
 */

export type ResultadoDeAuditoria = 'ALLOWED' | 'DENIED' | 'FAILED';
export type EscopoDeAuditoria = 'GLOBAL' | 'ORGANIZACAO' | 'EVENTO';

/** Limites do schema. Estourar um deles derruba a gravação no Postgres. */
export const LIMITE_ACAO = 60;
export const LIMITE_MOTIVO = 200;
export const LIMITE_ID = 64;

export type DadosDaAuditoria = {
  actorUserId: string;
  action: string;
  scopeKind: EscopoDeAuditoria;
  organizationId?: string;
  eventId?: string;
  targetUserId?: string;
  reason: string;
  correlationId: string;
  changes?: unknown;
};

export type RegistroGravado = {
  actorUserId: string;
  action: string;
  scopeKind: EscopoDeAuditoria;
  organizationId: string;
  eventId: string;
  targetUserId: string;
  reason: string;
  result: ResultadoDeAuditoria;
  correlationId: string;
  changes: unknown;
};

export class AuditoriaInvalida extends Error {}

function exigirTamanho(nome: string, valor: string, limite: number): string {
  if (valor.length > limite) {
    throw new AuditoriaInvalida(`${nome} excede ${limite} caracteres e não cabe na auditoria.`);
  }
  return valor;
}

/**
 * Monta a linha a ser gravada.
 *
 * `action`, `correlationId` e os ids são escritos pelo código: se passarem do
 * limite é defeito nosso, e cortar esconderia o defeito — então recusa. O
 * `reason` é escrito por uma pessoa: recusar bloquearia uma ação legítima por
 * causa do tamanho do texto, então corta com marca visível. Motivo vazio não
 * passa, porque auditoria sem motivo não serve para nada.
 */
export function montarRegistro(dados: DadosDaAuditoria, result: ResultadoDeAuditoria): RegistroGravado {
  const motivo = dados.reason.trim();
  if (motivo.length === 0) {
    throw new AuditoriaInvalida('Toda ação da Área Master exige motivo escrito.');
  }
  return {
    actorUserId: exigirTamanho('actorUserId', dados.actorUserId, LIMITE_ID),
    action: exigirTamanho('action', dados.action, LIMITE_ACAO),
    scopeKind: dados.scopeKind,
    organizationId: exigirTamanho('organizationId', dados.organizationId ?? '', LIMITE_ID),
    eventId: exigirTamanho('eventId', dados.eventId ?? '', LIMITE_ID),
    targetUserId: exigirTamanho('targetUserId', dados.targetUserId ?? '', LIMITE_ID),
    reason: motivo.length > LIMITE_MOTIVO ? `${motivo.slice(0, LIMITE_MOTIVO - 1)}…` : motivo,
    result,
    correlationId: exigirTamanho('correlationId', dados.correlationId, LIMITE_ID),
    changes: dados.changes ?? null,
  };
}

/**
 * A transação entregue à mudança.
 *
 * `cliente` é o cliente transacional, e existe porque sem ele esta peça era uma
 * armadilha: se a mudança só recebesse `gravarAuditoria`, ela seria obrigada a
 * usar o cliente de fora da transação para fazer a alteração, a alteração não
 * participaria do rollback, e a garantia inteira viraria fachada — com todos os
 * testes passando. O tipo é genérico para não presumir Prisma aqui dentro.
 */
export type TransacaoAuditavel<TX = unknown> = {
  cliente: TX;
  gravarAuditoria(registro: RegistroGravado): Promise<unknown>;
};

export type Banco<TX = unknown> = {
  /** Abre a transação. Se `fn` rejeitar, nada do que ela escreveu vale. */
  emTransacao<T>(fn: (tx: TransacaoAuditavel<TX>) => Promise<T>): Promise<T>;
  /** Grava fora de qualquer transação, para o que precisa sobreviver a um rollback. */
  gravarAuditoriaSolta(registro: RegistroGravado): Promise<unknown>;
};

export type Falha = { tipo: 'MUDANCA' | 'AUDITORIA'; erro: unknown };

export class MudancaRevertida extends Error {
  readonly tipo: 'MUDANCA' | 'AUDITORIA';
  readonly causa: unknown;
  constructor(falha: Falha) {
    super(
      falha.tipo === 'AUDITORIA'
        ? 'A ação foi desfeita porque a auditoria não pôde ser registrada.'
        : 'A ação não foi concluída e nada foi alterado.',
    );
    this.name = 'MudancaRevertida';
    this.tipo = falha.tipo;
    this.causa = falha.erro;
  }
}

const resumoDoErro = (erro: unknown): string => {
  const texto = erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro);
  return texto.length > 180 ? `${texto.slice(0, 179)}…` : texto;
};

/**
 * Executa a mudança privilegiada com auditoria obrigatória.
 *
 * A mudança roda e a auditoria `ALLOWED` é gravada na mesma transação, nessa
 * ordem — a auditoria por último porque é ela que afirma o resultado. Qualquer
 * uma das duas falhando desfaz as duas.
 *
 * Depois de um rollback, grava `FAILED` fora da transação, para que a tentativa
 * não desapareça. Se essa gravação solta também falhar, o erro original é o que
 * sobe: perder o registro é ruim, trocar a causa da falha por outra é pior.
 */
export async function executarAuditado<T, TX = unknown>(
  banco: Banco<TX>,
  dados: DadosDaAuditoria,
  mudanca: (tx: TransacaoAuditavel<TX>) => Promise<T>,
): Promise<T> {
  // Monta antes de abrir a transação: registro inválido não deve chegar a abrir uma.
  const permitido = montarRegistro(dados, 'ALLOWED');
  let falha: Falha | null = null;

  try {
    return await banco.emTransacao(async (tx) => {
      let resultado: T;
      try {
        resultado = await mudanca(tx);
      } catch (erro) {
        falha = { tipo: 'MUDANCA', erro };
        throw erro;
      }
      try {
        await tx.gravarAuditoria(permitido);
      } catch (erro) {
        falha = { tipo: 'AUDITORIA', erro };
        throw erro;
      }
      return resultado;
    });
  } catch (erro) {
    const ocorrido: Falha = falha ?? { tipo: 'MUDANCA', erro };
    try {
      await banco.gravarAuditoriaSolta(
        montarRegistro({ ...dados, changes: { falha: ocorrido.tipo, detalhe: resumoDoErro(ocorrido.erro) } }, 'FAILED'),
      );
    } catch {
      // Sem engolir a falha original: ela é o que o chamador precisa saber.
    }
    throw new MudancaRevertida(ocorrido);
  }
}

/**
 * Registra uma tentativa recusada.
 *
 * Vai fora de transação de propósito: não houve mudança para desfazer, e o
 * registro da recusa tem de persistir. Negar sem deixar rastro é como não ter
 * negado.
 */
export async function registrarRecusa(banco: Banco<unknown>, dados: DadosDaAuditoria): Promise<void> {
  await banco.gravarAuditoriaSolta(montarRegistro(dados, 'DENIED'));
}
