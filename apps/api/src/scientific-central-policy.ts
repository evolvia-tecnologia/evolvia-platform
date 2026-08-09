export type ScientificCentralChoice = 'RECOMMENDED' | 'CUSTOMIZED' | 'LATER';
export type ScientificCentralModuleStatus = 'AVAILABLE' | 'PREPARATION_ONLY';

export type ScientificCentralBlockDefinition = {
  id: string;
  capabilityCode: string;
  label: string;
  description: string;
  gate: string;
  availabilityLabel: string;
};

export const SCIENTIFIC_CENTRAL_BLOCKS: readonly ScientificCentralBlockDefinition[] = [
  {
    id: 'structure',
    capabilityCode: 'scientific_structure',
    label: 'Grade científica',
    description: 'Membros da programação científica, tipos de participação, comissões, áreas, subáreas e temas que organizam a jornada científica.',
    gate: 'A3',
    availabilityLabel: 'Editor disponível',
  },
  {
    id: 'submissions',
    capabilityCode: 'scientific_submission',
    label: 'Trabalhos e submissões',
    description: 'Modalidades, formulários, autores, arquivos e regras para recebimento de trabalhos.',
    gate: 'A6',
    availabilityLabel: 'Preparação das submissões',
  },
  {
    id: 'review',
    capabilityCode: 'scientific_review',
    label: 'Avaliação científica',
    description: 'Rodadas, critérios, pareceristas, conflitos de interesse e regras de avaliação cega.',
    gate: 'A7',
    availabilityLabel: 'Preparação da avaliação',
  },
  {
    id: 'decisions',
    capabilityCode: 'scientific_decision',
    label: 'Decisões e resultados',
    description: 'Aceite, recusa, cartas, recursos, versões finais e definição de apresentação.',
    gate: 'A8',
    availabilityLabel: 'Preparação das decisões',
  },
  {
    id: 'speakers',
    capabilityCode: 'speakers_guests',
    label: 'Palestrantes e convidados',
    description: 'Cadastro, convites, confirmações, perfis e acompanhamento de palestrantes e convidados.',
    gate: 'A4',
    availabilityLabel: 'Editor disponível',
  },
  {
    id: 'program',
    capabilityCode: 'scientific_program',
    label: 'Espaços e programação científica',
    description: 'Salas, horários, atividades, participantes e conflitos em uma construção progressiva da programação.',
    gate: 'A5',
    availabilityLabel: 'Editor disponível',
  },
  {
    id: 'communication',
    capabilityCode: 'communication',
    label: 'Comunicação',
    description: 'Mensagens transacionais e avisos para autores, avaliadores, palestrantes e participantes.',
    gate: 'Transversal',
    availabilityLabel: 'Preparação da comunicação',
  },
  {
    id: 'publication',
    capabilityCode: 'publication_readiness',
    label: 'Homologação e publicação',
    description: 'Pendências, critérios Go/No-Go, homologação, publicação e fechamento operacional.',
    gate: 'A9',
    availabilityLabel: 'Preparação para homologação',
  },
] as const;

export function getScientificCentralBlock(blockId: string): ScientificCentralBlockDefinition | undefined {
  return SCIENTIFIC_CENTRAL_BLOCKS.find((block) => block.id === blockId);
}

export function readScientificCentralChoice(config: unknown): ScientificCentralChoice | null {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
  const value = (config as Record<string, unknown>).centralChoice;
  return value === 'RECOMMENDED' || value === 'CUSTOMIZED' || value === 'LATER' ? value : null;
}

export function inferScientificCentralChoice(
  capability: { status: string; config?: unknown } | undefined,
): ScientificCentralChoice | null {
  const persisted = readScientificCentralChoice(capability?.config);
  if (persisted) return persisted;
  return capability?.status === 'ACTIVE' ? 'RECOMMENDED' : null;
}

export function scientificCentralModuleStatus(blockId: string): ScientificCentralModuleStatus {
  return blockId === 'structure' || blockId === 'speakers' || blockId === 'program'
    ? 'AVAILABLE'
    : 'PREPARATION_ONLY';
}

export function publicScientificCentralBlock(
  definition: ScientificCentralBlockDefinition,
  capability: { status: string; config?: unknown } | undefined,
) {
  const choice = inferScientificCentralChoice(capability);
  const active = capability?.status === 'ACTIVE' && choice !== 'LATER';

  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    gate: definition.gate,
    availabilityLabel: definition.availabilityLabel,
    moduleStatus: scientificCentralModuleStatus(definition.id),
    choice,
    active,
    decisionStatus: choice ? (choice === 'LATER' ? 'LATER' : 'DECIDED') : 'PENDING',
  };
}
