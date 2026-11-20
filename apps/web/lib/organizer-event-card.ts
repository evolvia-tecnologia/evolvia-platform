export type WizardProgressStatus = 'ACTIVE' | 'COMPLETED' | 'ABANDONED';

export type OrganizerWizard = {
  status: WizardProgressStatus;
  completionPercent: number;
} | null;

export type EventListAction = {
  label: string;
  href: string;
  primary: boolean;
};

const FORMAT_LABELS: Record<string, string> = {
  IN_PERSON: 'Presencial',
  ONLINE: 'Online',
  HYBRID: 'Híbrido',
};

const FOUNDATION_STATUSES = new Set(['DRAFT', 'SETUP']);

export function eventListAction(
  status: string,
  wizardStatus: WizardProgressStatus | null | undefined,
  eventId: string,
): EventListAction {
  const panel = `/eventos/${eventId}/painel`;
  if (status === 'PUBLISHED') return { label: 'Gerenciar evento', href: panel, primary: true };
  if (status === 'SUSPENDED') return { label: 'Gerenciar evento', href: panel, primary: false };
  if (status === 'FINISHED' || status === 'CANCELLED') return { label: 'Consultar evento', href: panel, primary: false };
  if (status === 'HOMOLOGATION' || status === 'READY_TO_PUBLISH') {
    return { label: 'Revisar publicação', href: `${panel}/divulgacao`, primary: false };
  }
  if (FOUNDATION_STATUSES.has(status) && wizardStatus === 'ACTIVE') {
    return { label: 'Continuar configuração', href: `/eventos/${eventId}/configuracao`, primary: true };
  }
  return { label: 'Revisar evento', href: panel, primary: false };
}

export function foundationProgress(wizard: { completionPercent: number } | null | undefined): number | null {
  if (!wizard || !Number.isFinite(wizard.completionPercent)) return null;
  return Math.min(100, Math.max(0, Math.round(wizard.completionPercent)));
}

export function eventFormatCaption(
  status: string,
  format: string,
  wizard: { status?: string; completionPercent: number } | null | undefined,
): string {
  const defining = FOUNDATION_STATUSES.has(status)
    && wizard?.status === 'ACTIVE'
    && wizard.completionPercent < 20;
  if (defining) return 'Formato a definir';
  return FORMAT_LABELS[format] ?? format;
}

export function countDraftsToContinue(events: Array<{ status: string; wizard: { status?: string } | null }>): number {
  return events.filter((event) => FOUNDATION_STATUSES.has(event.status) && event.wizard?.status === 'ACTIVE').length;
}

export function countCompletedFoundations(events: Array<{ wizard: { completionPercent: number } | null }>): number {
  return events.filter((event) => event.wizard?.completionPercent === 100).length;
}
