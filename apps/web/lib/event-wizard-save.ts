type Ref<T> = { current: T };
type SaveState = 'saving' | 'saved' | 'error';

export type WizardSaveContext<T, P> = {
  queue: Ref<Promise<void>>;
  savedStep: Ref<string>;
  getDirty: () => boolean;
  currentDraft: () => T;
  request: (step: string, snapshot: T) => Promise<P>;
  applyPayload: (payload: P, overwrite: boolean) => void;
  setDirty: (dirty: boolean) => void;
  setSaveState: (state: SaveState) => void;
  isConflict: (reason: unknown) => boolean;
  recoverLatest: () => Promise<void>;
};

// Compartilhado pelo Wizard e pelos testes, sem dependência do ciclo de renderização.
export function queueWizardSave<T, P>(targetStep: string, snapshot: T, context: WizardSaveContext<T, P>): Promise<void> {
  const snapshotJson = JSON.stringify(snapshot);
  const operation = context.queue.current.then(async () => {
    if (!context.getDirty() && context.savedStep.current === targetStep) return;
    context.setSaveState('saving');
    try {
      const payload = await context.request(targetStep, snapshot);
      const stillCurrent = JSON.stringify(context.currentDraft()) === snapshotJson;
      const isNavigating = targetStep !== context.savedStep.current;
      // Mesmo passo preserva espaços em edição; navegação recebe a versão canônica.
      context.applyPayload(payload, stillCurrent && isNavigating);
      context.savedStep.current = targetStep;
      context.setDirty(!stillCurrent);
      context.setSaveState('saved');
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
