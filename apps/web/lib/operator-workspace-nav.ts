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

  const extras: LinkDoOperador[] = [];
  if (areasComAcao.has('credenciamento') || areasComAcao.has('acesso')) {
    extras.push({
      href: `/eventos/${id}/painel/check-in`,
      rotulo: 'Credenciamento',
      area: 'credenciamento',
    });
  }
  if (areasComAcao.has('inscricao')) {
    extras.push({
      href: `/eventos/${id}/painel/inscricoes`,
      rotulo: 'Inscrições',
      area: 'inscricao',
    });
  }
  if (areasComAcao.has('acesso')) {
    extras.push({
      href: `/eventos/${id}/painel/show`,
      rotulo: 'Acessos e catracas',
      area: 'acesso',
    });
  }

  return [...base, ...extras];
}

/** Seções do painel que o shell restrito pode abrir sem cair no menu de organizador. */
export function secaoPermitidaAoOperador(
  section: string,
  links: readonly LinkDoOperador[],
): boolean {
  if (section === 'overview') return false;
  return links.some((link) => link.href.includes(`/painel/${section}`)
    || (section === 'check-in' && link.href.endsWith('/painel/check-in'))
    || (section === 'registrations' && link.href.endsWith('/painel/inscricoes'))
    || (section === 'show' && link.href.endsWith('/painel/show')));
}
