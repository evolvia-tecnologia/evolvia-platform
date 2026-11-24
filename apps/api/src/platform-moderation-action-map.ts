/**
 * Tradução EXPLÍCITA entre a permissão da Área Master e a ação da máquina
 * de estados de moderação (#691).
 *
 * O guard autoriza nomes do catálogo concedível: desbloquear/excluir.
 * A política de transição usa liberar/remover. Não podemos passar o nome
 * cru nem aceitar um nome da política sem a respectiva concessão.
 *
 * Este adaptador não autoriza ninguém: o @AcaoMaster da rota deve conferir
 * o nome original e o escopo do evento ANTES de chamar o serviço.
 */
import { ACOES_DE_MODERACAO } from './platform-grant-policy.ts';
import type { AcaoDeModeracao } from './platform-moderation-policy.ts';

const TRADUCAO: Readonly<Record<(typeof ACOES_DE_MODERACAO)[number], AcaoDeModeracao>> = Object.freeze({
  suspender: 'suspender',
  desbloquear: 'liberar',
  excluir: 'remover',
  restaurar: 'restaurar',
});

export function acaoDeModeracaoAutorizada(acaoDoGuard: unknown): AcaoDeModeracao | null {
  if (typeof acaoDoGuard !== 'string'
    || !(ACOES_DE_MODERACAO as readonly string[]).includes(acaoDoGuard)
    || !Object.prototype.hasOwnProperty.call(TRADUCAO, acaoDoGuard)) return null;
  return TRADUCAO[acaoDoGuard as keyof typeof TRADUCAO];
}
