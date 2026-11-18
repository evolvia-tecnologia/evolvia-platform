/**
 * Consumo da moderação pelo resto da aplicação (#665).
 *
 * `platform-moderation-policy.ts` decide transições e descreve efeitos. Este
 * módulo é a porta pela qual os serviços existentes perguntam "posso?" sem
 * precisar conhecer o modelo de moderação.
 *
 * A decisão central, e ela é deliberada
 * -------------------------------------
 * **Evento sem linha de moderação é `ATIVO`.** A tabela é aditiva: se ausência
 * negasse, aplicar a migration bloquearia todos os eventos existentes de uma
 * vez. Esta é a única passagem do módulo em que ausência significa permitir, e
 * está aqui, isolada e com teste, em vez de espalhada por cada chamador.
 *
 * Fora dela, tudo falha fechado: estado desconhecido, operação desconhecida e
 * linha malformada negam.
 *
 * Módulo puro: sem Prisma, sem Nest, sem I/O.
 */

import { ESTADOS, permite } from './platform-moderation-policy.ts';
import type { EstadoDeModeracao, Operacao } from './platform-moderation-policy.ts';

/** A linha da moderação como o banco a devolve, ou `null` quando não existe. */
export interface LinhaDeModeracao {
  readonly state?: unknown;
}

/**
 * Estado efetivo. Ausência de linha é `ATIVO`; linha com estado irreconhecível
 * NÃO é — valor estranho num campo de moderação é sinal de problema, e a porta
 * fecha.
 */
export function estadoDe(linha: LinhaDeModeracao | null | undefined): EstadoDeModeracao | 'INDETERMINADO' {
  if (linha === null || linha === undefined) return 'ATIVO';
  const estado = linha.state;
  if (typeof estado === 'string' && (ESTADOS as readonly string[]).includes(estado)) {
    return estado as EstadoDeModeracao;
  }
  return 'INDETERMINADO';
}

export interface Decisao {
  readonly permitido: boolean;
  readonly estado: EstadoDeModeracao | 'INDETERMINADO';
  readonly operacao: string;
}

/**
 * Pergunta se uma operação pode acontecer neste evento.
 *
 * `INDETERMINADO` nega porque `permite()` só reconhece os três estados. Isso é
 * por construção: não há ramo que transforme estado irreconhecível em liberado.
 */
export function podeOperar(linha: LinhaDeModeracao | null | undefined, operacao: Operacao | string): Decisao {
  const estado = estadoDe(linha);
  return { permitido: permite(estado, operacao), estado, operacao: String(operacao) };
}

/**
 * Pontos de consumo, nomeados para que a fiação seja mecânica e conferível.
 *
 * Esta lista é documentação executável: o teste confere que toda operação do
 * catálogo aparece em pelo menos um ponto, para que nenhuma fique definida e
 * nunca consultada — uma operação que ninguém pergunta é efeito que não existe.
 *
 * A fiação em si NÃO está neste corte: cada arquivo abaixo tem dono, e trocar
 * código alheio sem lock é como dois agentes se sobrescrevem. O corte entrega a
 * decisão, a persistência e a trilha; a ligação é pedido explícito a quem é
 * dono de cada caminho.
 */
export const PONTOS_DE_CONSUMO: ReadonlyArray<{
  readonly operacao: Operacao;
  readonly onde: string;
  readonly efeitoEsperado: string;
}> = [
  {
    operacao: 'divulgacao_publica',
    onde: 'event-publication/event-publication-public.service.ts',
    efeitoEsperado: 'a página pública responde a indisponibilidade em vez do conteúdo',
  },
  {
    operacao: 'listagem_publica',
    onde: 'event-publication/event-publication-public.service.ts (catálogo)',
    efeitoEsperado: 'o evento removido não aparece em listagem nem em busca pública',
  },
  {
    operacao: 'nova_inscricao',
    onde: 'registration-reservations.service.ts',
    efeitoEsperado: 'reserva nova recusada; reservas existentes preservadas',
  },
  {
    operacao: 'novo_pagamento',
    onde: 'registration-order-checkout.service.ts e asaas-checkout.service.ts',
    efeitoEsperado: 'checkout novo recusado; cobrança em andamento conservada para conciliação',
  },
  {
    operacao: 'acesso_operacional',
    onde: 'event-desk.service.ts (via guard, ao lado de OperatorCapabilityGuard)',
    efeitoEsperado: 'balcão recusa operação; leitura do painel continua',
  },
  {
    operacao: 'leitura_administrativa',
    onde: 'events.service.ts e platform-master.service.ts',
    efeitoEsperado: 'nunca barrado: é por onde o problema é investigado',
  },
  {
    operacao: 'historico_e_auditoria',
    onde: 'platform-master.service.ts (relatório de auditoria)',
    efeitoEsperado: 'nunca barrado: prova não se apaga por moderação',
  },
];
