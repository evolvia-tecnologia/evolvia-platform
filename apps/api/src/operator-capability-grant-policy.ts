/**
 * Quem pode conceder o quê, a quem (G10.10).
 *
 * `operator-capability-policy.ts` responde se uma AÇÃO é permitida a um
 * operador. Este módulo responde a pergunta de governança: quem tem direito de
 * MEXER nessas concessões, e sobre quem.
 *
 * Fica separado da imposição de propósito. Conceder é uma operação de
 * organizador sobre a permissão de outra pessoa — é o ponto onde um erro cria
 * privilégio, não o balcão. E, como todo o resto deste corte, é `deny-by-default`
 * e verificável sem banco e sem Nest.
 */

import { ACOES_DE_OPERADOR, METODOS_SO_DE_ORGANIZADOR, acoesDoPerfil, ehAcaoDeOperador, ehPerfilDeOperador } from './operator-capability-policy.ts';
import { LIMITE_DO_MOTIVO } from './operator-capability-policy.ts';
import type { AcaoDeOperador, PapelNaOrganizacao } from './operator-capability-policy.ts';

export type MotivoDeRecusa =
  | 'ator_nao_e_organizador'
  | 'alvo_inexistente'
  | 'alvo_nao_e_membro_ativo'
  | 'alvo_nao_e_operador'
  | 'motivo_obrigatorio'
  | 'motivo_muito_longo'
  | 'acao_invalida'
  | 'acao_exclusiva_de_organizador'
  | 'perfil_invalido'
  | 'pedido_sem_acoes'
  | 'acoes_e_perfil_ao_mesmo_tempo';

/** O alvo da concessão, como o banco o devolve. `null` = não é membro. */
export interface Alvo {
  readonly userId: string;
  readonly papel: PapelNaOrganizacao;
  readonly ativo: boolean;
}

export interface PedidoDeGestao {
  readonly papelDoAtor: PapelNaOrganizacao;
  readonly atorUserId: string;
  readonly alvo: Alvo | null;
  readonly motivo: unknown;
  /** Lista explícita de ações, OU `perfil` — nunca os dois. */
  readonly acoes?: readonly unknown[];
  readonly perfil?: unknown;
}

export interface Veredito {
  readonly permitido: boolean;
  readonly motivo: MotivoDeRecusa | null;
  /** Ações normalizadas, só quando permitido. */
  readonly acoes: readonly AcaoDeOperador[];
  /** Motivo textual já aparado, só quando permitido. */
  readonly justificativa: string;
}

const PAPEIS_DE_ORGANIZADOR: readonly PapelNaOrganizacao[] = ['OWNER', 'ADMIN', 'MANAGER'];

const recusa = (motivo: MotivoDeRecusa): Veredito => ({
  permitido: false,
  motivo,
  acoes: [],
  justificativa: '',
});

/**
 * Decide um pedido de conceder ou revogar.
 *
 * Regras, e por que cada uma existe:
 *
 *  - Só organizador mexe em concessão. Operador não concede a si mesmo nem a
 *    ninguém — seria escalada de privilégio por autoatendimento.
 *  - O alvo precisa ser membro ATIVO da organização DO EVENTO. Membro removido
 *    ou suspenso não recebe permissão nova.
 *  - O alvo precisa ser OPERATOR. Conceder a organizador não faz efeito algum,
 *    porque organizador já passa sem concessão; e conceder a VIEWER produziria
 *    uma permissão que o balcão nunca honra. Nos dois casos a interface
 *    mostraria uma permissão que não existe na prática, e isso é pior que
 *    recusar.
 *  - `motivo` é obrigatório: é ele que faz o histórico responder "por quê".
 *  - Ou `acoes`, ou `perfil`, nunca os dois — para não haver dúvida sobre o que
 *    foi concedido quando os dois discordam.
 *
 * Consequência que vale notar: como o ator tem de ser organizador e o alvo tem
 * de ser OPERATOR, o ator nunca pode ser o próprio alvo. A separação de funções
 * sai das duas regras, sem precisar de uma terceira comparando ids.
 */
export function decidirGestaoDeConcessao(pedido: PedidoDeGestao): Veredito {
  if (!PAPEIS_DE_ORGANIZADOR.includes(pedido.papelDoAtor)) return recusa('ator_nao_e_organizador');

  if (!pedido.alvo) return recusa('alvo_inexistente');
  if (!pedido.alvo.ativo) return recusa('alvo_nao_e_membro_ativo');
  if (pedido.alvo.papel !== 'OPERATOR') return recusa('alvo_nao_e_operador');

  if (typeof pedido.motivo !== 'string' || pedido.motivo.trim() === '') return recusa('motivo_obrigatorio');
  const justificativa = pedido.motivo.trim();
  if (justificativa.length > LIMITE_DO_MOTIVO) return recusa('motivo_muito_longo');

  const temAcoes = pedido.acoes !== undefined;
  const temPerfil = pedido.perfil !== undefined;
  if (temAcoes && temPerfil) return recusa('acoes_e_perfil_ao_mesmo_tempo');

  let acoes: AcaoDeOperador[];
  if (temPerfil) {
    if (!ehPerfilDeOperador(pedido.perfil)) return recusa('perfil_invalido');
    acoes = acoesDoPerfil(pedido.perfil);
  } else if (temAcoes) {
    if (!Array.isArray(pedido.acoes)) return recusa('pedido_sem_acoes');
    acoes = [];
    for (const item of pedido.acoes) {
      if ((METODOS_SO_DE_ORGANIZADOR as readonly string[]).includes(String(item))) {
        return recusa('acao_exclusiva_de_organizador');
      }
      if (!ehAcaoDeOperador(item)) return recusa('acao_invalida');
      if (!acoes.includes(item)) acoes.push(item);
    }
  } else {
    return recusa('pedido_sem_acoes');
  }

  if (acoes.length === 0) return recusa('pedido_sem_acoes');
  return { permitido: true, motivo: null, acoes, justificativa };
}

/** Mensagem para a interface. Sem id, sem nome: só o motivo da recusa. */
export function mensagemDaRecusa(motivo: MotivoDeRecusa): string {
  const textos: Record<MotivoDeRecusa, string> = {
    ator_nao_e_organizador: 'Apenas organizadores podem conceder ou revogar permissões.',
    alvo_inexistente: 'Pessoa não encontrada nesta organização.',
    alvo_nao_e_membro_ativo: 'Esta pessoa não é membro ativo da organização.',
    alvo_nao_e_operador: 'Permissões de balcão só se aplicam a operadores.',
    motivo_obrigatorio: 'Informe o motivo da concessão ou da revogação.',
    motivo_muito_longo: `O motivo deve ter no máximo ${LIMITE_DO_MOTIVO} caracteres.`,
    acao_invalida: 'Permissão desconhecida.',
    acao_exclusiva_de_organizador: 'Esta operação é exclusiva de organizadores e não pode ser concedida.',
    perfil_invalido: 'Perfil desconhecido.',
    pedido_sem_acoes: 'Selecione ao menos uma permissão.',
    acoes_e_perfil_ao_mesmo_tempo: 'Escolha um perfil ou permissões específicas, não os dois.',
  };
  return textos[motivo];
}

/** Catálogo para a interface: o que existe, agrupado e com o que é sensível. */
export function catalogoParaInterface(): {
  acao: AcaoDeOperador;
  capacidade: string | null;
  sensivel: boolean;
}[] {
  return (Object.keys(ACOES_DE_OPERADOR) as AcaoDeOperador[]).map((acao) => ({
    acao,
    capacidade: ACOES_DE_OPERADOR[acao].capacidade,
    sensivel: ACOES_DE_OPERADOR[acao].sensivel,
  }));
}
