/**
 * Alteração delimitada de agenda de um evento JÁ PUBLICADO.
 *
 * Contrato #661: datas, fuso e local podem mudar depois de publicado; nada
 * mais. Lotes, inscrições, submissões, programação e financeiro NÃO são
 * tocados, nem automaticamente nem em cascata.
 *
 * Três regras de contrato, que valem para quem consome a API e para a tela que
 * o organizador vê:
 *
 *   ausente  -> mantém o valor atual. Salvar parcial é legítimo.
 *   null     -> limpa, SE limpar aquele campo for legítimo naquele estado.
 *   valor    -> troca, se for válido; inválido RECUSA com mensagem nomeando o
 *               campo, sem escrita parcial e sem sucesso falso.
 *
 * "Ausente" é `undefined`, e não "chave fora do objeto". A diferença importa:
 * cliente em JavaScript monta corpo com espalhamento (`{...form}`) e manda
 * `undefined` sem querer o tempo todo. Tratar isso como erro renderia 400
 * incompreensível para quem não mudou nada naquele campo. JSON nem transporta
 * `undefined`, então a distinção só existe para proteger o chamador.
 *
 * A terceira regra é o C-03: hoje um valor inválido some em silêncio e a API
 * responde 200 sem alterar nada. Quem está do outro lado conclui que salvou.
 *
 * Sem import relativo de propósito: `--experimental-strip-types` não resolve
 * import extensionless, e já perdemos um ciclo de CI por isso. Módulo sem
 * dependência é módulo que dá para exercitar enquanto se escreve.
 */

export type FormatoDoEvento = 'IN_PERSON' | 'ONLINE' | 'HYBRID';

export type AgendaAtual = {
  startDate: Date | null;
  endDate: Date | null;
  timeZone: string | null;
  venue: string | null;
  format: FormatoDoEvento;
};

/** Ausente mantém; `null` limpa; valor troca. */
export type PedidoDeAgenda = {
  startDate?: string | null;
  endDate?: string | null;
  timeZone?: string | null;
  venue?: string | null;
  motivo?: unknown;
};

export type AgendaResolvida = {
  startDate: string | null;
  endDate: string | null;
  timeZone: string | null;
  venue: string | null;
};

export type PlanoDeAgenda =
  | { ok: true; motivo: string; alterados: string[]; antes: AgendaResolvida; depois: AgendaResolvida }
  | { ok: false; erros: string[] };

export const LIMITE_DO_MOTIVO = 200;
const LIMITE_DO_LOCAL = 240;

const iso = (valor: Date | null): string | null => (valor ? valor.toISOString() : null);

function dataValida(valor: string): string | null {
  if (valor.length > 40) return null;
  const parsed = new Date(valor);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function fusoValido(valor: string): string | null {
  const candidato = valor.trim();
  if (!candidato || candidato.length > 64) return null;
  // Deslocamento fixo não serve: o evento precisa do fuso nomeado para que o
  // horário continue certo depois de uma mudança de horário de verão.
  if (/^[+-]\d{2}:?\d{2}$/u.test(candidato) || /^Etc\/GMT[+-]/u.test(candidato)) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: candidato }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/**
 * Monta a agenda resultante e lista TODOS os problemas de uma vez.
 *
 * Acumular em vez de parar no primeiro erro é decisão de experiência: quem
 * preenche quatro campos quer saber dos quatro, não descobrir um por tentativa.
 */
export function planejarAlteracaoDeAgenda(atual: AgendaAtual, pedido: PedidoDeAgenda): PlanoDeAgenda {
  const erros: string[] = [];

  const motivo = typeof pedido.motivo === 'string' ? pedido.motivo.trim() : '';
  if (motivo.length < 3) {
    erros.push('Informe o motivo da alteração, com pelo menos 3 caracteres.');
  } else if (motivo.length > LIMITE_DO_MOTIVO) {
    erros.push(`O motivo excede ${LIMITE_DO_MOTIVO} caracteres.`);
  }

  const antes: AgendaResolvida = {
    startDate: iso(atual.startDate),
    endDate: iso(atual.endDate),
    timeZone: atual.timeZone,
    venue: atual.venue,
  };
  const depois: AgendaResolvida = { ...antes };

  if (pedido.startDate !== undefined) {
    if (pedido.startDate === null) {
      // Evento publicado sem data de início deixa o participante sem resposta
      // para "quando é". Limpar aqui não é limpeza, é tirar o evento do ar pela
      // porta dos fundos.
      erros.push('Evento publicado não pode ficar sem data de início. Para retirar a data, despublique o evento antes.');
    } else if (typeof pedido.startDate !== 'string' || !dataValida(pedido.startDate)) {
      erros.push('A data de início informada não é uma data válida.');
    } else {
      depois.startDate = dataValida(pedido.startDate);
    }
  }

  if (pedido.endDate !== undefined) {
    if (pedido.endDate === null) {
      depois.endDate = null;
    } else if (typeof pedido.endDate !== 'string' || !dataValida(pedido.endDate)) {
      erros.push('A data de término informada não é uma data válida.');
    } else {
      depois.endDate = dataValida(pedido.endDate);
    }
  }

  if (pedido.timeZone !== undefined) {
    if (pedido.timeZone === null) {
      erros.push('Evento publicado não pode ficar sem fuso horário: sem ele o horário exibido fica ambíguo.');
    } else if (typeof pedido.timeZone !== 'string' || !fusoValido(pedido.timeZone)) {
      erros.push('O fuso horário informado não é um fuso válido. Use um nome como America/Sao_Paulo.');
    } else {
      depois.timeZone = fusoValido(pedido.timeZone);
    }
  }

  if (pedido.venue !== undefined) {
    if (pedido.venue === null) {
      if (atual.format === 'ONLINE') {
        depois.venue = null;
      } else {
        // Participante de evento presencial já publicado precisa saber onde ir.
        erros.push('Evento presencial publicado não pode ficar sem local. Informe o novo local em vez de remover o atual.');
      }
    } else if (typeof pedido.venue !== 'string') {
      erros.push('O local informado não é um texto válido.');
    } else {
      const local = pedido.venue.trim().replace(/\s+/gu, ' ');
      if (local.length === 0) {
        erros.push('O local não pode ficar em branco. Para retirá-lo, envie o campo como nulo.');
      } else if (local.length > LIMITE_DO_LOCAL) {
        erros.push(`O local excede ${LIMITE_DO_LOCAL} caracteres.`);
      } else {
        depois.venue = local;
      }
    }
  }

  const alterados = (['startDate', 'endDate', 'timeZone', 'venue'] as const)
    .filter((campo) => depois[campo] !== antes[campo]);

  if (erros.length === 0 && alterados.length === 0) {
    erros.push('Nenhuma alteração foi informada. Envie ao menos um campo diferente do atual.');
  }

  if (erros.length > 0) return { ok: false, erros };
  return { ok: true, motivo, alterados: [...alterados], antes, depois };
}
