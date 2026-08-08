import { ScientificTaxonomyLevel } from '@prisma/client';

export function normalizeScientificText(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function scientificCodeBase(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

  return normalized || 'ITEM';
}

export function taxonomyParentError(
  level: ScientificTaxonomyLevel,
  parentLevel?: ScientificTaxonomyLevel | null,
): string | null {
  if (level === ScientificTaxonomyLevel.AREA) {
    return parentLevel ? 'Uma área não pode ficar abaixo de outro item da taxonomia.' : null;
  }

  if (level === ScientificTaxonomyLevel.SUBAREA) {
    return parentLevel === ScientificTaxonomyLevel.AREA
      ? null
      : 'Uma subárea precisa estar vinculada a uma área.';
  }

  if (level === ScientificTaxonomyLevel.TOPIC) {
    return parentLevel === ScientificTaxonomyLevel.SUBAREA
      ? null
      : 'Um tema precisa estar vinculado a uma subárea.';
  }

  return 'Nível de taxonomia inválido.';
}
