/**
 * Imposição das capacidades do operador na borda HTTP (G10.10).
 *
 * `operator-capability-policy.ts` responde "esta pessoa pode esta AÇÃO". Este
 * módulo responde a pergunta que falta para um guard do Nest funcionar: "qual
 * ação esta ROTA exige". Sem esse mapa, o guard não tem o que verificar.
 *
 * Por que a imposição vai num guard sobre o controller, e não dentro do
 * `EventDeskService`: é o lugar convencional de autorização no Nest, roda antes
 * do método, e o service mantém as checagens que já tem — defesa em
 * profundidade, não substituição. Nenhuma verificação existente é removida.
 *
 * Propriedade central, e é dela que vem a segurança: **rota não mapeada é
 * NEGADA**. Se alguém acrescentar uma rota a `EventDeskController` e esquecer
 * de registrá-la aqui, ela nasce inacessível ao operador em evento escopado, e
 * não liberada. Falha fechada, com teste que reprova se isso mudar.
 *
 * Módulo puro: sem Nest, sem Prisma, sem I/O. O guard é só a cola que lê o
 * contexto da requisição e chama `decidirRota()`.
 */

import {
  ACAO_SEMPRE_LIBERADA_PARA_STAFF,
  ACOES_DE_OPERADOR,
  METODOS_SO_DE_ORGANIZADOR,
  acaoDeImpressao,
  decidirAcaoDeOperador,
  ehAcaoDeOperador,
} from './operator-capability-policy.ts';
import type { AcaoDeOperador, Decisao, Pedido } from './operator-capability-policy.ts';

/**
 * Como a rota resolve a ação exigida:
 *
 *  - `{ acao }`         — exige exatamente esta ação;
 *  - `{ organizador }`  — exige organizador; nunca concedível a operador;
 *  - `{ staff }`        — basta pertencer ao staff (hoje só `GET /`, o próprio
 *                         painel, já guardado por `requireRole`);
 *  - `{ impressao }`    — a ação depende de já ter havido impressão para
 *                         aquela inscrição, resolvida por `acaoDeImpressao()`.
 */
export type ExigenciaDaRota =
  | { readonly tipo: 'acao'; readonly metodo: string; readonly acao: AcaoDeOperador }
  | { readonly tipo: 'organizador'; readonly metodo: string }
  | { readonly tipo: 'staff'; readonly metodo: string }
  | { readonly tipo: 'impressao'; readonly metodo: string };

/**
 * As 24 rotas de `EventDeskController` (lido em develop @ 01932c88), com o
 * método de `EventDeskService` que cada uma chama. A chave é
 * `<VERBO> <caminho>` relativo a `events/:eventId/desk`.
 */
export const ROTAS_DO_BALCAO = {
  'GET /': { tipo: 'staff', metodo: 'context' },
  'GET /report': { tipo: 'acao', metodo: 'report', acao: 'relatorio' },
  'POST /raffle': { tipo: 'acao', metodo: 'draw', acao: 'sorteio' },
  'POST /search': { tipo: 'acao', metodo: 'search', acao: 'buscar' },
  'POST /check-in': { tipo: 'acao', metodo: 'checkInReservation', acao: 'checkin' },
  'POST /check-in/reverse': { tipo: 'acao', metodo: 'reverseCheckIn', acao: 'checkin_reverter' },
  'POST /badge': { tipo: 'impressao', metodo: 'badge' },
  'GET /kit': { tipo: 'acao', metodo: 'kit', acao: 'kit_ler' },
  'GET /kit/report': { tipo: 'acao', metodo: 'kitReport', acao: 'kit_relatorio' },
  'GET /kit/export': { tipo: 'organizador', metodo: 'exportKitReport' },
  'POST /kit': { tipo: 'organizador', metodo: 'saveKit' },
  'POST /material': { tipo: 'acao', metodo: 'deliverMaterial', acao: 'material_entregar' },
  'POST /material/reverse': { tipo: 'acao', metodo: 'reverseMaterial', acao: 'material_reverter' },
  'POST /day-presence': { tipo: 'acao', metodo: 'markDayPresence', acao: 'presenca_dia' },
  'POST /day-presence/reverse': { tipo: 'acao', metodo: 'reverseDayPresence', acao: 'presenca_dia_reverter' },
  'POST /activity-access': { tipo: 'acao', metodo: 'recordActivityAccess', acao: 'atividade_acesso' },
  'POST /labels/categories/:categoryId': { tipo: 'organizador', metodo: 'updateCategoryLabel' },
  'POST /label': { tipo: 'organizador', metodo: 'updateLabel' },
  'POST /self-service': { tipo: 'organizador', metodo: 'updateSelfService' },
  'POST /totem-link': { tipo: 'organizador', metodo: 'issueTotemLink' },
  'POST /totem-link/revoke': { tipo: 'organizador', metodo: 'revokeTotemLink' },
  'GET /registrations/:reservationId': { tipo: 'acao', metodo: 'registrationRecord', acao: 'inscricao_ler' },
  'POST /registrations/:reservationId/corrections': {
    tipo: 'acao',
    metodo: 'correctRegistration',
    acao: 'inscricao_corrigir',
  },
  'POST /registrations': { tipo: 'acao', metodo: 'registrationTarget', acao: 'inscricao_criar' },
} as const satisfies Record<string, ExigenciaDaRota>;

export type RotaDoBalcao = keyof typeof ROTAS_DO_BALCAO;

export function ehRotaDoBalcao(valor: unknown): valor is RotaDoBalcao {
  return typeof valor === 'string' && Object.prototype.hasOwnProperty.call(ROTAS_DO_BALCAO, valor);
}

export type MotivoDeNegativaDeRota = 'rota_nao_mapeada' | 'rota_exige_organizador';

export interface DecisaoDeRota extends Omit<Decisao, 'motivo'> {
  readonly motivo: Decisao['motivo'] | MotivoDeNegativaDeRota;
  /** A ação efetivamente exigida, ou null quando a rota não exige ação. */
  readonly acaoExigida: AcaoDeOperador | null;
}

export interface ContextoDaRota extends Omit<Pedido, 'acao'> {
  /**
   * Só para `POST /badge`: se já existe impressão registrada para a inscrição.
   * Enquanto `EventCredentialPrint` não existir, o chamador passa `false` e
   * toda impressão é tratada como primeira — o que é o comportamento de hoje,
   * nunca mais permissivo que ele.
   */
  readonly jaImprimiu?: boolean;
}

const PAPEIS_DE_ORGANIZADOR = ['OWNER', 'ADMIN', 'MANAGER'] as const;
const PAPEIS_DE_STAFF = ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'] as const;

/**
 * Decide uma requisição ao balcão. `deny-by-default` em dois níveis: a rota
 * precisa estar mapeada, E a ação exigida precisa passar pela política.
 */
export function decidirRota(rota: unknown, contexto: ContextoDaRota): DecisaoDeRota {
  const escopado = contexto.capacidadesDoEvento.includes('operator_scoped_access');

  if (!ehRotaDoBalcao(rota)) {
    return { permitido: false, motivo: 'rota_nao_mapeada', escopado, acaoExigida: null };
  }
  const exigencia: ExigenciaDaRota = ROTAS_DO_BALCAO[rota];

  if (exigencia.tipo === 'organizador') {
    const ehOrganizador = (PAPEIS_DE_ORGANIZADOR as readonly string[]).includes(contexto.papel);
    return {
      permitido: ehOrganizador,
      motivo: ehOrganizador ? null : 'rota_exige_organizador',
      escopado,
      acaoExigida: null,
    };
  }

  if (exigencia.tipo === 'staff') {
    // O painel em si: liberado a quem é do staff, SEM exigir concessão — negar
    // aqui deixaria o operador sem como ver que está sem concessões. O papel é
    // conferido aqui mesmo, e não delegado a `requireRole`: um módulo de
    // segurança não deve depender de outro para negar.
    const ehStaff = (PAPEIS_DE_STAFF as readonly string[]).includes(contexto.papel);
    return {
      permitido: ehStaff,
      motivo: ehStaff ? null : 'papel_sem_acesso_ao_balcao',
      escopado,
      acaoExigida: null,
    };
  }

  const acao: AcaoDeOperador =
    exigencia.tipo === 'impressao' ? acaoDeImpressao(contexto.jaImprimiu === true) : exigencia.acao;

  const decisao = decidirAcaoDeOperador({ ...contexto, acao });
  return { ...decisao, acaoExigida: acao };
}

/**
 * Rotas que o operador consegue usar, para a interface limitada. Só rotas: a
 * interface não decide nada, ela apenas deixa de oferecer o que o backend
 * negaria de todo modo.
 */
export function rotasPermitidas(contexto: ContextoDaRota): RotaDoBalcao[] {
  return (Object.keys(ROTAS_DO_BALCAO) as RotaDoBalcao[]).filter((r) => decidirRota(r, contexto).permitido);
}

/**
 * Confere que o mapa de rotas e o catálogo de ações continuam coerentes. Serve
 * de rede para quem mexer em um dos dois sem olhar o outro; é chamada por teste
 * e pode ser chamada na subida da aplicação.
 *
 * Recebe o mapa por parâmetro para que ela própria seja testável: um teste lhe
 * passa mapas quebrados de propósito e confere que ela acusa. Sem isso, um
 * `return []` dentro dela passaria despercebido.
 */
export function conferirCoerencia(rotas: Record<string, ExigenciaDaRota> = ROTAS_DO_BALCAO): string[] {
  const problemas: string[] = [];
  const exigencias = Object.values(rotas);

  for (const [rota, e] of Object.entries(rotas)) {
    if (e.tipo === 'acao') {
      if (!ehAcaoDeOperador(e.acao)) problemas.push(`${rota}: ação "${e.acao}" não existe no catálogo`);
      else if (ACOES_DE_OPERADOR[e.acao].metodo !== e.metodo) {
        problemas.push(`${rota}: ação "${e.acao}" é do método "${ACOES_DE_OPERADOR[e.acao].metodo}", não "${e.metodo}"`);
      }
    }
    if (e.tipo === 'organizador' && !(METODOS_SO_DE_ORGANIZADOR as readonly string[]).includes(e.metodo)) {
      problemas.push(`${rota}: "${e.metodo}" não está na lista de métodos só de organizador`);
    }
    if (e.tipo === 'staff' && e.metodo !== ACAO_SEMPRE_LIBERADA_PARA_STAFF) {
      problemas.push(`${rota}: só "${ACAO_SEMPRE_LIBERADA_PARA_STAFF}" pode ser liberada ao staff sem ação`);
    }
  }

  // toda ação do catálogo precisa ser alcançável por alguma rota
  const acoesMapeadas = new Set(exigencias.flatMap((e) => (e.tipo === 'acao' ? [e.acao as string] : [])));
  const porImpressao = exigencias.some((e) => e.tipo === 'impressao');
  for (const acao of Object.keys(ACOES_DE_OPERADOR)) {
    const deImpressao = acao === 'credencial_imprimir' || acao === 'credencial_reimprimir';
    if (acoesMapeadas.has(acao)) continue;
    if (deImpressao && porImpressao) continue;
    problemas.push(`ação "${acao}" do catálogo não é exigida por nenhuma rota`);
  }

  // todo método só de organizador precisa ter rota marcada como tal
  const metodosDeOrganizador = new Set(exigencias.flatMap((e) => (e.tipo === 'organizador' ? [e.metodo] : [])));
  for (const m of METODOS_SO_DE_ORGANIZADOR) {
    if (!metodosDeOrganizador.has(m)) problemas.push(`método só de organizador "${m}" sem rota mapeada`);
  }

  return problemas;
}
