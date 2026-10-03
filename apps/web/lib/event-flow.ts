export type EventFlowSection =
  | 'overview'
  | 'publication'
  | 'integrations'
  | 'commercial'
  | 'form'
  | 'benefits'
  | 'registrations'
  | 'check-in'
  | 'financial'
  | 'scientific';

export type EventFlowStepState = 'done' | 'current' | 'available';

export type EventFlowStep = {
  id: string;
  label: string;
  href: string;
  state: EventFlowStepState;
};

const PUBLISHED = new Set(['PUBLISHED', 'SUSPENDED', 'FINISHED']);
const REVIEWING = new Set(['HOMOLOGATION', 'READY_TO_PUBLISH']);
const REGISTRATION_SECTIONS = new Set<EventFlowSection>(['commercial', 'form', 'benefits', 'registrations']);

export function buildEventFlow(input: {
  eventId: string;
  status: string;
  section: EventFlowSection;
  scientific: boolean;
}): EventFlowStep[] {
  const published = PUBLISHED.has(input.status);
  const reviewing = REVIEWING.has(input.status);
  const onRegistration = REGISTRATION_SECTIONS.has(input.section);
  const steps: EventFlowStep[] = [
    {
      id: 'foundation',
      label: 'Fundação',
      href: `/eventos/${input.eventId}/configuracao?review=foundation`,
      state: 'done',
    },
    {
      id: 'disclosure',
      label: 'Divulgação',
      href: `/eventos/${input.eventId}/painel/divulgacao`,
      state: published || reviewing ? 'done' : input.section === 'overview' || input.section === 'publication' ? 'current' : 'available',
    },
    {
      id: 'registration',
      label: 'Inscrições',
      href: `/eventos/${input.eventId}/painel/inscricoes/categorias-lotes`,
      state: onRegistration ? 'current' : 'available',
    },
    {
      id: 'release',
      label: 'Publicação',
      href: `/eventos/${input.eventId}/painel/divulgacao`,
      state: published ? 'done' : reviewing ? 'current' : 'available',
    },
    {
      id: 'operation',
      label: 'Operação',
      href: `/eventos/${input.eventId}/painel/check-in`,
      state: input.section === 'check-in' || input.section === 'financial' || input.section === 'registrations' ? 'current' : 'available',
    },
  ];

  if (input.scientific) {
    steps.push({
      id: 'scientific',
      label: 'Científico',
      href: `/eventos/${input.eventId}/cientifico`,
      state: input.section === 'scientific' ? 'current' : 'available',
    });
  }

  return steps;
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

export function maskTaxId(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 3) return 'documento protegido';
  return `terminado em ${digits.slice(-2)}`;
}
