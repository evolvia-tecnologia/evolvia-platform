/**
 * Planejamento das transações de concessão e revogação (G10.10).
 *
 * Condição 1 do PO: "a concessão e a revogação devem atualizar o estado vigente
 * e registrar o histórico na mesma transação. Não pode existir divergência
 * entre as duas tabelas."
 *
 * O risco real não é a transação — é o plano. Se o código decidir remover uma
 * linha da projeção e esquecer de escrever a razão correspondente (ou o
 * inverso), a transação comita com as duas tabelas divergentes e o histórico
 * passa a mentir. Por isso o plano é calculado AQUI, em função pura, e devolve
 * PARES indissociáveis: cada passo carrega a operação de projeção e a linha de
 * razão que a acompanha. O repositório Prisma não escolhe nada; ele executa.
 *
 * Isto é verificável sem banco e sem Nest — e precisa ser, porque o Node não
 * parseia decorators, logo nenhum arquivo Nest deste trabalho pode ser
 * conferido neste ambiente, nem na sintaxe.
 */

import { ehAcaoDeOperador } from './operator-capability-policy.ts';
import type { AcaoDeOperador } from './operator-capability-policy.ts';

export type TipoDeRazao = 'GRANTED' | 'REVOKED';

/** O que fazer na projeção de estado vigente (`EventOperatorGrant`). */
export interface OperacaoDeProjecao {
  readonly tipo: 'criar' | 'remover';
  readonly acao: AcaoDeOperador;
}

/** Linha a escrever na razão append-only (`EventOperatorGrantEvent`). */
export interface LinhaDeRazao {
  readonly kind: TipoDeRazao;
  readonly acao: AcaoDeOperador;
}

/**
 * Um passo indivisível: a mudança de estado e o registro que a explica. Nunca
 * um sem o outro — é esta estrutura que impede a divergência, não a boa
 * intenção de quem escreve o repositório.
 */
export interface PassoDaTransacao {
  readonly projecao: OperacaoDeProjecao;
  readonly razao: LinhaDeRazao;
}

export interface Plano {
  readonly passos: readonly PassoDaTransacao[];
  /** Pedidas que não produzem passo, porque o estado já é o desejado. */
  readonly semEfeito: readonly AcaoDeOperador[];
}

export class PlanoInvalido extends Error {}

function normalizar(acoes: readonly unknown[]): AcaoDeOperador[] {
  const saida: AcaoDeOperador[] = [];
  for (const a of acoes) {
    if (!ehAcaoDeOperador(a)) throw new PlanoInvalido(`Ação "${String(a)}" não existe.`);
    if (!saida.includes(a)) saida.push(a);
  }
  if (saida.length === 0) throw new PlanoInvalido('Informe ao menos uma ação.');
  return saida;
}

/**
 * Conceder: cria na projeção e escreve GRANTED. Ação já ativa não gera passo,
 * para não poluir o histórico com uma concessão que não mudou nada.
 */
export function planejarConcessao(pedidas: readonly unknown[], ativas: readonly string[]): Plano {
  const alvo = normalizar(pedidas);
  const jaAtivas = new Set(ativas);
  const passos: PassoDaTransacao[] = [];
  const semEfeito: AcaoDeOperador[] = [];
  for (const acao of alvo) {
    if (jaAtivas.has(acao)) semEfeito.push(acao);
    else passos.push({ projecao: { tipo: 'criar', acao }, razao: { kind: 'GRANTED', acao } });
  }
  return { passos, semEfeito };
}

/**
 * Revogar: remove da projeção — o que invalida a permissão imediatamente — e
 * escreve REVOKED. Ação que não estava ativa não gera passo.
 */
export function planejarRevogacao(pedidas: readonly unknown[], ativas: readonly string[]): Plano {
  const alvo = normalizar(pedidas);
  const jaAtivas = new Set(ativas);
  const passos: PassoDaTransacao[] = [];
  const semEfeito: AcaoDeOperador[] = [];
  for (const acao of alvo) {
    if (jaAtivas.has(acao)) passos.push({ projecao: { tipo: 'remover', acao }, razao: { kind: 'REVOKED', acao } });
    else semEfeito.push(acao);
  }
  return { passos, semEfeito };
}

/** Estado vigente depois de aplicar um plano, para conferir idempotência. */
export function aplicar(ativas: readonly string[], plano: Plano): AcaoDeOperador[] {
  const conjunto = new Set(ativas);
  for (const passo of plano.passos) {
    if (passo.projecao.tipo === 'criar') conjunto.add(passo.projecao.acao);
    else conjunto.delete(passo.projecao.acao);
  }
  return [...conjunto].filter(ehAcaoDeOperador).sort();
}

/**
 * Confere as invariantes de um plano. Chamada por teste e barata o bastante
 * para o repositório chamar antes de abrir a transação: um plano inconsistente
 * deve abortar ANTES de tocar o banco, nunca no meio.
 */
export function conferirPlano(plano: Plano, pedidas: readonly AcaoDeOperador[]): string[] {
  const problemas: string[] = [];
  const esperado: Record<OperacaoDeProjecao['tipo'], TipoDeRazao> = { criar: 'GRANTED', remover: 'REVOKED' };
  const vistas = new Set<string>();

  for (const passo of plano.passos) {
    if (passo.projecao.acao !== passo.razao.acao) {
      problemas.push(`passo com ações divergentes: projeção ${passo.projecao.acao}, razão ${passo.razao.acao}`);
    }
    if (esperado[passo.projecao.tipo] !== passo.razao.kind) {
      problemas.push(`${passo.projecao.tipo} deveria gerar ${esperado[passo.projecao.tipo]}, não ${passo.razao.kind}`);
    }
    if (vistas.has(passo.projecao.acao)) problemas.push(`ação ${passo.projecao.acao} aparece em dois passos`);
    vistas.add(passo.projecao.acao);
  }

  for (const acao of plano.semEfeito) {
    if (vistas.has(acao)) problemas.push(`ação ${acao} está em passo e em semEfeito ao mesmo tempo`);
  }

  const cobertas = new Set([...vistas, ...plano.semEfeito]);
  for (const acao of pedidas) {
    if (!cobertas.has(acao)) problemas.push(`ação pedida ${acao} não foi coberta pelo plano`);
  }
  for (const acao of cobertas) {
    if (!pedidas.includes(acao as AcaoDeOperador)) problemas.push(`plano inventou a ação ${acao}`);
  }
  return problemas;
}

/**
 * Posição da próxima tentativa de impressão. Começa em 1 porque a migration tem
 * `CHECK ("sequence" >= 1)`; devolver 0 gravaria uma linha que o banco recusa.
 */
export function proximaSequencia(tentativasAnteriores: number): number {
  if (!Number.isInteger(tentativasAnteriores) || tentativasAnteriores < 0) {
    throw new PlanoInvalido(`Contagem de tentativas inválida: ${String(tentativasAnteriores)}`);
  }
  return tentativasAnteriores + 1;
}

/**
 * Erro de CORRIDA entre duas gestões simultâneas da mesma concessão, e não erro
 * do pedido. Dois códigos do Prisma importam:
 *
 *   P2002 — unicidade violada: outra conexão criou a mesma concessão primeiro.
 *   P2025 — registro a remover não existe: outra conexão revogou primeiro.
 *
 * Nos dois casos o estado final já é o desejado, então reler e replanejar
 * devolve um plano vazio: a operação vira `semEfeito` em vez de estourar na
 * cara de quem chamou. Não se trata o erro DENTRO da transação de propósito —
 * no Postgres, um comando que falha aborta a transação, e os seguintes também
 * falhariam. A transação inteira é refeita.
 */
export function ehCorridaDeConcessao(erro: unknown): boolean {
  if (typeof erro !== 'object' || erro === null) return false;
  const codigo = (erro as { code?: unknown }).code;
  return codigo === 'P2002' || codigo === 'P2025';
}
