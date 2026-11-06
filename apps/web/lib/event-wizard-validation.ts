export type WizardStepAnswers = {
  organizationId?: string; eventType?: string; subjectAreas?: string[];
  format?: string; name?: string; startDate?: string | null; endDate?: string | null;
  timeZone?: string; datesPending?: boolean; venue?: string | null;
  venuePending?: boolean; registrationMode?: string; capabilities?: string[];
};
export function wizardStepIssues(index: number, answers: WizardStepAnswers, required: readonly string[] = ['registration']): string[] {
  const issues: string[] = [];
  if (index === 0) {
    if (!answers.organizationId) issues.push('Selecione a organização responsável.');
    if (!answers.eventType) issues.push('Escolha o perfil do evento.');
    if (!answers.subjectAreas?.length) issues.push('Escolha ao menos uma área de atuação.');
    if ((answers.subjectAreas?.length ?? 0) > 3) issues.push('Escolha no máximo 3 áreas de atuação.');
  }
  if (index === 1 && !['IN_PERSON', 'ONLINE', 'HYBRID'].includes(answers.format ?? '')) issues.push('Escolha o formato do evento.');
  if (index === 2) {
    if (!answers.name || answers.name.trim().length < 3 || answers.name.trim().length > 120) issues.push('Informe um nome com 3 a 120 caracteres.');
    if (!answers.datesPending) {
      if (!answers.startDate || !Number.isFinite(Date.parse(answers.startDate))) issues.push('Informe a data de início ou marque “Definir as datas depois”.');
      if (answers.endDate && (!Number.isFinite(Date.parse(answers.endDate)) || (answers.startDate && Date.parse(answers.endDate) < Date.parse(answers.startDate)))) issues.push('Informe uma data de término válida, igual ou posterior ao início.');
    }
    try {
      if (!answers.timeZone) throw new Error();
      new Intl.DateTimeFormat('pt-BR', { timeZone: answers.timeZone });
    } catch { issues.push('Escolha o fuso horário do evento.'); }
  }
  if (index === 3 && !answers.venue?.trim() && !answers.venuePending) issues.push('Informe o local ou a plataforma, ou marque “Definir o local depois”.');
  if (index === 4 && !['FREE', 'PAID', 'INVITATION'].includes(answers.registrationMode ?? '')) issues.push('Escolha o modelo de inscrição.');
  if (index === 5) {
    for (const code of required) {
      if (!answers.capabilities?.includes(code)) issues.push(code === 'access_control' ? 'Controle de acesso é obrigatório para este perfil.' : 'Inscrições é um recurso obrigatório.');
    }
  }
  return issues;
}
/** Revisão pedida pelo painel permanece no formulário. A tela de conclusão só aparece fora desse pedido. */
export function showWizardCompletion(status: string, search: string | null, reviewing: boolean): boolean {
  if (status !== 'COMPLETED' || reviewing) return false;
  if (search == null) return true;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.get('review') !== 'foundation' && params.get('step') !== 'identity';
}

/** Quem já saiu da conclusão, por revisão do painel ou por “Revisar respostas”, permanece no formulário nos salvamentos seguintes. */
export function nextWizardCompletion(previousCompleted: boolean, firstApply: boolean, status: string, search: string | null, reviewing: boolean): boolean {
  if (!firstApply && !previousCompleted) return false;
  return showWizardCompletion(status, search, reviewing);
}

/** Abre uma etapa já alcançada. Não pula etapa pendente nem aceita etapa desconhecida. */
export function openedWizardStep<T extends string>(currentStep: string, requestedStep: string | null, stepIds: readonly T[]): T {
  const indexOf = (value: string | null) => value ? stepIds.findIndex((step) => step === value) : -1;
  const currentIndex = indexOf(currentStep);
  const safeCurrent = currentIndex >= 0 ? currentIndex : 0;
  const requestedIndex = indexOf(requestedStep);
  if (requestedIndex < 0 || requestedIndex > safeCurrent) return stepIds[safeCurrent];
  return stepIds[requestedIndex];
}

export function firstIncompleteWizardStep(answers: WizardStepAnswers, lastStep = 5, required: readonly string[] = ['registration']): { index: number; issues: string[] } | null {
  for (let index = 0; index <= Math.min(lastStep, 5); index++) {
    const issues = wizardStepIssues(index, answers, required);
    if (issues.length) return { index, issues };
  }
  return null;
}

