/**
 * CL02 — o que a TELA do operador restrito pode oferecer no shell do evento.
 *
 * NÃO É AUTORIZAÇÃO. O servidor continua negando financeiro/config/expositor.
 * Esta lista só evita mentir no menu: OPERATOR não vê atalhos de organizador.
 *
 * Papéis de organizador (OWNER/ADMIN/MANAGER) usam o menu completo do painel.
 * VIEWER também não é balcão — fica sem atalhos de operação aqui.
 */

import { areaDaAcao, type AreaDoBalcao, type RespostaDeCapacidades } from './operator-journey';

const PAPEIS_ORGANIZADOR = new Set(['OWNER', 'ADMIN', 'MANAGER']);

export type LinkDoOperador = {
  readonly href: string;
  readonly rotulo: string;
  readonly area: AreaDoBalcao | 'permissoes';
};

export function isPapelOrganizador(papel: string | null | undefined): boolean {
  return PAPEIS_ORGANIZADOR.has(papel ?? '');
}

export function isPapelOperadorRestrito(papel: string | null | undefined): boolean {
  return papel === 'OPERATOR';
}

/**
 * Atalhos do shell restrito. Só ações que o servidor já listou como permitidas,
 * mais "Minhas permissões" (a própria consulta de autoatendimento).
 */
export function linksDoOperadorRestrito(
  eventId: string,
  resposta: RespostaDeCapacidades | null | undefined,
): readonly LinkDoOperador[] {
  const id = encodeURIComponent(eventId);
  const base: LinkDoOperador[] = [
    {
      href: `/eventos/${id}/painel/minhas-permissoes`,
      rotulo: 'Minhas permissões',
      area: 'permissoes',
    },
  ];
  if (!resposta || !Array.isArray(resposta.acoes)) return base;

  const areasComAcao = new Set<AreaDoBalcao>();
  for (const item of resposta.acoes) {
    if (!item || typeof item.acao !== 'string' || item.acao === '') continue;
    areasComAcao.add(areaDaAcao(item.acao));
  }

  // O POSTO e o unico destino operacional. Antes havia tres, e dois eram
  // vazamento:
  //
  //  - `/painel/inscricoes` monta a pagina administrativa de inscricoes, com
  //    valores, pagamentos e a acao Trocar categoria. Qualquer acao da area
  //    `inscricao` — inclusive `inscricao_ler` — abria esse destino. E pior: os
  //    endpoints `RegistrationOperationsService.list` e `changeCategory`
  //    autorizam por PAPEL (`STAFF_ROLES`, que inclui OPERATOR) e nao conferem
  //    concessao por acao, entao o operador de leitura conseguia alterar
  //    categoria de verdade. Conferido lendo o controller e o service: o unico
  //    guard ali e `AuthGuard`. O menu nao corrige isso — so parava de oferecer.
  //  - `/painel/show` monta `ShowOperationsConsole`, que NAO executa
  //    `presenca_dia` nem `atividade_acesso` e oferece links de Divulgacao e de
  //    Categorias e lotes, reintroduzindo configuracao na tela do operador,
  //    inclusive em evento que nao e show.
  //
  // E o posto passou a aparecer para `material` e `relatorios` tambem: ele
  // atende essas areas, e sem isso o operador com apenas `kit_ler` ou
  // `relatorio` ficava com Minhas permissoes e mais nada, sem alcancar tarefa
  // que lhe foi concedida.
  const AREAS_DO_POSTO = ['credenciamento', 'acesso', 'material', 'inscricao', 'relatorios'] as const;
  const extras: LinkDoOperador[] = [];
  if (AREAS_DO_POSTO.some((area) => areasComAcao.has(area))) {
    extras.push({
      href: `/eventos/${id}/painel/check-in`,
      rotulo: 'Posto de atendimento',
      area: 'credenciamento',
    });
  }

  return [...base, ...extras];
}

/**
 * A rota aberta e um dos atalhos permitidos?
 *
 * Confere o PATHNAME, e nao a `section`, porque secao nao identifica rota:
 * `/painel/permissoes` tambem roda com `section="check-in"` e monta
 * `OperatorCapabilities`, que e a tela de GESTAO de permissoes do organizador.
 * Pela versao anterior, operador com atalho de check-in passava nesta funcao e
 * montava aquela tela digitando a URL — em vez de receber a recusa do shell.
 *
 * Comparacao por igualdade ou por prefixo de segmento (`alvo + '/'`), nunca por
 * `includes`: `/painel/permissoes` NAO pode casar com
 * `/painel/minhas-permissoes`, e o sufixo e justamente o que `includes` casaria.
 */
export function secaoPermitidaAoOperador(
  pathname: string,
  links: readonly LinkDoOperador[],
): boolean {
  if (typeof pathname !== 'string' || pathname === '') return false;
  const aberta = pathname.replace(/[?#].*$/u, '').replace(/\/+$/u, '');
  if (aberta === '') return false;
  return links.some((link) => {
    const alvo = link.href.replace(/\/+$/u, '');
    return aberta === alvo || aberta.startsWith(`${alvo}/`);
  });
}
