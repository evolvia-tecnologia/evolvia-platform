export type PrintIssue = {
  reservationId: string;
  sequence: number;
};

/** Sequência gravada como tentativa de emissão. Ausência não vira confirmação. */
export function emissionSequence(result: unknown): number | null {
  if (!result || typeof result !== 'object') return null;
  const emissao = (result as { emissao?: unknown }).emissao;
  if (!emissao || typeof emissao !== 'object') return null;
  const sequence = (emissao as { sequence?: unknown }).sequence;
  if (typeof sequence !== 'number' || !Number.isInteger(sequence) || sequence < 1 || sequence > 1_000_000) return null;
  return sequence;
}

/** Abre a impressão do navegador. Não registra papel saído. */
export function openLabelPrint(fitWarning: boolean, print: () => void): boolean {
  if (fitWarning) return false;
  print();
  return true;
}

/** O aviso da confirmação só pode aparecer na seleção que a iniciou. */
export function deskResultStillVisible(startedVersion: number, currentVersion: number): boolean {
  return startedVersion === currentVersion;
}

const PRINT_ACTIONS = new Set(['credencial_imprimir', 'credencial_reimprimir']);

/** Só a resposta do contrato conta. Corpo vazio ou sequência trocada não vira papel saído. */
export function confirmationAccepted(issue: PrintIssue, result: unknown): { repeated: boolean } | null {
  if (!result || typeof result !== 'object') return null;
  const body = result as { sequence?: unknown; concluida?: unknown; repetida?: unknown; acaoExigida?: unknown };
  if (body.concluida !== true || body.sequence !== issue.sequence || typeof body.repetida !== 'boolean') return null;
  if (typeof body.acaoExigida !== 'string' || !PRINT_ACTIONS.has(body.acaoExigida)) return null;
  return { repeated: body.repetida };
}

const KNOWN_CONFIRMATION_REFUSALS = new Set([
  'Esta credencial já foi impressa. Confirmar outra impressão exige permissão de reimpressão.',
  'Sem permissão para confirmar impressão de credencial neste evento.',
  'Emissão não encontrada para esta inscrição.',
  'Inscrição não encontrada neste evento.',
  'Inscrição não informada.',
  'Sequência da emissão inválida.',
  'Evento não encontrado.',
]);

export const CONFIRMATION_UNKNOWN = 'A resposta não confirmou esta sequência. A mesma emissão continua disponível para enviar de novo, sem criar outra impressão.';
export const CONFIRMATION_RETRY = 'Não foi possível saber se o servidor registrou esta sequência. Envie a mesma confirmação outra vez. Uma resposta repetida não grava outra impressão.';

/** Recusa conhecida permanece legível. Falha ou texto técnico pede o reenvio da mesma sequência. */
export function confirmationFailureGuidance(message: string | null | undefined): string {
  const text = typeof message === 'string' ? message.trim() : '';
  if (KNOWN_CONFIRMATION_REFUSALS.has(text)) return text;
  return CONFIRMATION_RETRY;
}

export function labelWithoutEmission<T extends Record<string, unknown>>(result: T): Omit<T, 'emissao'> {
  const { emissao: _ignored, ...label } = result;
  return label;
}
