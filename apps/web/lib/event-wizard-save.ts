type Ref<T> = { current: T };
type SaveState = 'saving' | 'saved' | 'error';

export type WizardSaveContext<T, P> = {
  queue: Ref<Promise<void>>;
  savedStep: Ref<string>;
  getDirty: () => boolean;
  currentDraft: () => T;
  request: (step: string, snapshot: T) => Promise<P>;
  applyPayload: (payload: P, overwrite: boolean, markSaved?: boolean) => void;
  setDirty: (dirty: boolean) => void;
  setSaveState: (state: SaveState) => void;
  isConflict: (reason: unknown) => boolean;
  recoverLatest: () => Promise<void>;
  datesConfirmed?: (snapshot: T, payload: P) => boolean;
  rejectionOf?: (snapshot: T, payload: P) => string | null;
  resume?: () => void;
};

function sameInstant(left: unknown, right: unknown): boolean {
  if (left == null && right == null) return true;
  if (typeof left !== 'string' || typeof right !== 'string' || left === '' || right === '') return left === right;
  const parsedLeft = Date.parse(left);
  const parsedRight = Date.parse(right);
  if (Number.isNaN(parsedLeft) || Number.isNaN(parsedRight)) return left === right;
  return parsedLeft === parsedRight;
}

function canonicalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** O local só está confirmado quando o texto limpo e a pendência coincidem. */
export function wizardVenueConfirmed(
  snapshot: { venue?: string | null; venuePending?: boolean | null },
  answers: { venue?: string | null; venuePending?: boolean | null } | null | undefined,
): boolean {
  const server = answers ?? {};
  return canonicalText(snapshot.venue) === canonicalText(server.venue)
    && (snapshot.venuePending === true) === (server.venuePending === true);
}

/** Recusa o primeiro campo do rascunho que o servidor não confirmou. */
export function wizardScheduleRejection(
  snapshot: {
    startDate?: string | null;
    endDate?: string | null;
    timeZone?: string | null;
    venue?: string | null;
    venuePending?: boolean | null;
  },
  answers: {
    startDate?: string | null;
    endDate?: string | null;
    timeZone?: string | null;
    venue?: string | null;
    venuePending?: boolean | null;
  } | null | undefined,
): string | null {
  if (!wizardDatesConfirmed(snapshot, answers)) {
    return 'O servidor manteve a data anterior. A alteração desta tela não foi gravada.';
  }
  if (!wizardVenueConfirmed(snapshot, answers)) {
    return 'O servidor manteve o local anterior. A alteração desta tela não foi gravada.';
  }
  return null;
}

/** A data só está confirmada quando o servidor devolve o mesmo instante e o mesmo fuso. */
export function wizardDatesConfirmed(
  snapshot: { startDate?: string | null; endDate?: string | null; timeZone?: string | null },
  answers: { startDate?: string | null; endDate?: string | null; timeZone?: string | null } | null | undefined,
): boolean {
  const server = answers ?? {};
  const zone = (value: string | null | undefined) => value ?? '';
  return sameInstant(snapshot.startDate ?? null, server.startDate ?? null)
    && sameInstant(snapshot.endDate ?? null, server.endDate ?? null)
    && zone(snapshot.timeZone) === zone(server.timeZone);
}

/** Sai só quando o rascunho enviado ainda é o rascunho visível depois da resposta. */
export async function saveCurrentDraftBeforeExit<T>(input: {
  currentDraft: () => T;
  save: (snapshot: T) => Promise<void>;
}): Promise<void> {
  for (;;) {
    const snapshot = input.currentDraft();
    const snapshotJson = JSON.stringify(snapshot);
    await input.save(snapshot);
    if (JSON.stringify(input.currentDraft()) === snapshotJson) return;
  }
}

/** A saída só segue depois de um salvamento aceito. A falha permanece nesta tela. */
export function wizardBlockedExitMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message.trim()) return reason.message;
  return 'Não foi possível salvar. Os valores desta tela foram mantidos.';
}

/** “Tudo salvo” só com evento existente, rascunho limpo e sem erro. */
export function wizardSaveLabel(input: { hasEvent: boolean; saveState: string; dirty: boolean }): string {
  if (!input.hasEvent) return 'Rascunho local';
  if (input.saveState === 'saving') return 'Salvando…';
  if (input.saveState === 'error' || input.dirty) return 'Não salvo';
  return 'Tudo salvo';
}

// Compartilhado pelo Wizard e pelos testes, sem dependência do ciclo de renderização.
export function queueWizardSave<T, P>(targetStep: string, snapshot: T, context: WizardSaveContext<T, P>): Promise<void> {
  const snapshotJson = JSON.stringify(snapshot);
  const operation = context.queue.current.then(async () => {
    if (!context.getDirty() && context.savedStep.current === targetStep) return;
    context.setSaveState('saving');
    try {
      const payload = await context.request(targetStep, snapshot);
      const stillCurrent = JSON.stringify(context.currentDraft()) === snapshotJson;
      const rejection = context.rejectionOf
        ? context.rejectionOf(snapshot, payload)
        : context.datesConfirmed && !context.datesConfirmed(snapshot, payload)
          ? 'O servidor manteve a data anterior. A alteração desta tela não foi gravada.'
          : null;
      if (rejection) {
        context.applyPayload(payload, false, false);
        context.setDirty(true);
        context.setSaveState('error');
        throw new Error(rejection);
      }
      const isNavigating = targetStep !== context.savedStep.current;
      // Mesmo passo preserva espaços em edição; navegação recebe a versão canônica.
      context.applyPayload(payload, stillCurrent && isNavigating, false);
      context.savedStep.current = targetStep;
      context.setDirty(!stillCurrent);
      if (stillCurrent) context.setSaveState('saved');
      else context.resume?.();
    } catch (reason) {
      context.setSaveState('error');
      if (context.isConflict(reason)) {
        await context.recoverLatest();
        throw new Error('O rascunho foi alterado em outra sessão. Confira a versão mais recente antes de continuar.');
      }
      throw reason;
    }
  });
  // Uma falha continua visível ao chamador sem inutilizar a fila seguinte.
  context.queue.current = operation.catch(() => undefined);
  return operation;
}
