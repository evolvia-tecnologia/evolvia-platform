export type EventFlowSection =
  | 'overview'
  | 'publication'
  | 'integrations'
  | 'commercial'
  | 'form'
  | 'benefits'
  | 'registrations'
  | 'exhibitors'
  | 'check-in'
  | 'transmission'
  | 'certificates'
  | 'financial'
  | 'scientific';

export type EventFlowStepState = 'done' | 'current' | 'available';

export type EventFlowPreparation = 'done' | 'pending';

export type EventFlowStep = {
  id: string;
  label: string;
  href: string;
  state: EventFlowStepState;
  preparation: EventFlowPreparation;
  screen: boolean;
};

const PUBLISHED = new Set(['PUBLISHED', 'SUSPENDED', 'FINISHED']);
const REVIEWING = new Set(['HOMOLOGATION', 'READY_TO_PUBLISH']);
const REGISTRATION_SECTIONS = new Set<EventFlowSection>(['commercial', 'form', 'benefits', 'financial', 'registrations']);
const OPERATION_SECTIONS = new Set<EventFlowSection>(['check-in', 'exhibitors', 'transmission']);

const SECTIONS: EventFlowSection[] = [
  'overview',
  'publication',
  'commercial',
  'form',
  'benefits',
  'financial',
  'scientific',
  'registrations',
  'check-in',
  'exhibitors',
  'transmission',
  'certificates',
  'integrations',
];

export function eventFlowSections(): readonly EventFlowSection[] {
  return SECTIONS;
}

export function isOperationalSection(section: EventFlowSection): boolean {
  return section === 'check-in' || section === 'registrations';
}

export function showsExhibitorNavigation(capabilities: readonly string[] | null | undefined): boolean {
  return (capabilities ?? []).includes('exhibitor');
}

export function showsScientificNavigation(
  profileCode: string | null | undefined,
  capabilities: readonly string[] | null | undefined,
): boolean {
  return profileCode === 'SCIENTIFIC_EVENT' || (capabilities ?? []).includes('scientific_submission');
}

function preparationAnchor(status: string): 'disclosure' | 'release' | 'operation' {
  if (PUBLISHED.has(status)) return 'operation';
  if (REVIEWING.has(status)) return 'release';
  return 'disclosure';
}

function screenStep(input: { status: string; section: EventFlowSection; scientific: boolean }): string {
  if (REGISTRATION_SECTIONS.has(input.section)) return 'registration';
  if (OPERATION_SECTIONS.has(input.section)) return 'operation';
  if (input.section === 'scientific') return input.scientific ? 'scientific' : preparationAnchor(input.status);
  if (input.section === 'publication' && (PUBLISHED.has(input.status) || REVIEWING.has(input.status))) return 'release';
  if (input.section === 'publication') return 'disclosure';
  return preparationAnchor(input.status);
}

export function buildEventFlow(input: {
  eventId: string;
  status: string;
  section: EventFlowSection;
  scientific: boolean;
}): EventFlowStep[] {
  const published = PUBLISHED.has(input.status);
  const reviewing = REVIEWING.has(input.status);
  const screen = screenStep(input);
  const steps: Array<Omit<EventFlowStep, 'state' | 'screen'>> = [
    {
      id: 'foundation',
      label: 'Fundação',
      href: `/eventos/${input.eventId}/configuracao?review=foundation`,
      preparation: 'done',
    },
    {
      id: 'disclosure',
      label: 'Divulgação',
      href: `/eventos/${input.eventId}/painel/divulgacao`,
      preparation: published || reviewing ? 'done' : 'pending',
    },
    {
      id: 'registration',
      label: 'Inscrições',
      href: `/eventos/${input.eventId}/painel/inscricoes/categorias-lotes`,
      preparation: 'pending',
    },
    {
      id: 'release',
      label: 'Publicação',
      href: `/eventos/${input.eventId}/painel/divulgacao#publication-release-title`,
      preparation: published ? 'done' : 'pending',
    },
    {
      id: 'operation',
      label: 'Operação',
      href: `/eventos/${input.eventId}/painel/check-in`,
      preparation: 'pending',
    },
  ];

  if (input.scientific) {
    steps.splice(3, 0, {
      id: 'scientific',
      label: 'Científico',
      href: `/eventos/${input.eventId}/cientifico`,
      preparation: 'pending',
    });
  }

  return steps.map((step) => ({
    ...step,
    screen: step.id === screen,
    state: step.id === screen ? 'current' : step.preparation === 'done' ? 'done' : 'available',
  }));
}

export function eventTimeZoneLabel(timeZone: string | null | undefined): string {
  if (!timeZone) return 'Não confirmado';
  const labels: Record<string, string> = {
    'America/Sao_Paulo': 'Brasília, São Paulo, Rio de Janeiro',
    'America/Manaus': 'Manaus',
    'America/Cuiaba': 'Cuiabá',
    'America/Rio_Branco': 'Rio Branco',
    'America/Noronha': 'Fernando de Noronha',
    UTC: 'UTC',
  };
  return labels[timeZone] ?? timeZone;
}

export function maskTaxId(value: string | null | undefined): string {
  if (!value) return 'documento protegido';
  const compact = value.toUpperCase().replace(/[.\-/\s]/g, '');
  if (compact.length < 3 || !/^[A-Z0-9]+$/.test(compact)) return 'documento protegido';
  return `terminado em ${compact.slice(-2)}`;
}

export type IdentifiedEvent = { event: { id: string } };

export type WorkspacePhase = 'loading' | 'ready' | 'error' | 'absent';

export type WorkspaceView<T extends IdentifiedEvent> = {
  eventId: string;
  phase: WorkspacePhase;
  payload: T | null;
  error: string;
};

export type WorkspaceShell = 'loading' | 'operation' | 'error' | 'panel';

export function initialWorkspaceView<T extends IdentifiedEvent>(eventId: string): WorkspaceView<T> {
  if (!eventId) return { eventId: '', phase: 'absent', payload: null, error: '' };
  return { eventId, phase: 'loading', payload: null, error: '' };
}

export function replaceWorkspaceEvent<T extends IdentifiedEvent>(eventId: string): WorkspaceView<T> {
  return initialWorkspaceView(eventId);
}

export function acceptWorkspacePayload<T extends IdentifiedEvent>(
  view: WorkspaceView<T>,
  eventId: string,
  payload: T | null | undefined,
  invalidMessage = 'Não foi possível abrir o painel deste evento.',
): WorkspaceView<T> {
  if (view.eventId !== eventId) return view;
  if (!payload || payload.event?.id !== eventId) {
    return { eventId, phase: 'error', payload: null, error: invalidMessage };
  }
  return { eventId, phase: 'ready', payload, error: '' };
}

export function rejectWorkspaceLoad<T extends IdentifiedEvent>(
  view: WorkspaceView<T>,
  eventId: string,
  message: string,
): WorkspaceView<T> {
  if (view.eventId !== eventId) return view;
  return { eventId, phase: 'error', payload: null, error: message };
}

export function visibleWorkspacePayload<T extends IdentifiedEvent>(
  view: WorkspaceView<T>,
  eventId: string,
): T | null {
  if (!eventId || view.eventId !== eventId || view.phase !== 'ready') return null;
  if (view.payload?.event.id !== eventId) return null;
  return view.payload;
}

export function workspaceShell(input: {
  section: EventFlowSection;
  eventId: string;
  phase: WorkspacePhase;
  payloadEventId: string | null;
}): WorkspaceShell {
  if (input.phase === 'ready' && input.eventId !== '' && input.payloadEventId === input.eventId) return 'panel';
  if (!input.eventId || input.phase === 'absent') return 'error';
  if (input.phase === 'loading') return 'loading';
  return isOperationalSection(input.section) ? 'operation' : 'error';
}

