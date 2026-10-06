import { EventProfileCode, Prisma } from '@prisma/client';

export const PUBLIC_SUBJECT_AREAS = [
  {
    id: 'educacao',
    label: 'Educação',
    profiles: [EventProfileCode.SCIENTIFIC_EVENT],
    terms: ['educação', 'educacao', 'formação', 'formacao', 'pedagógico', 'pedagogico'],
  },
  {
    id: 'saude',
    label: 'Saúde',
    profiles: [],
    terms: ['saúde', 'saude', 'medicina', 'enfermagem', 'hospital', 'odonto'],
  },
  {
    id: 'direito',
    label: 'Direito',
    profiles: [],
    terms: ['direito', 'jurídico', 'juridico', 'advocacia', 'oab'],
  },
  {
    id: 'entretenimento',
    label: 'Entretenimento',
    profiles: [EventProfileCode.ENTERTAINMENT],
    terms: ['entretenimento', 'show', 'festival'],
  },
  {
    id: 'espiritualidade',
    label: 'Religiosos ou espiritualidade',
    profiles: [],
    terms: ['religioso', 'religião', 'religiao', 'espiritual', 'beneficente'],
  },
  {
    id: 'engenharias',
    label: 'Engenharias',
    profiles: [],
    terms: ['engenharia', 'engenheiros'],
  },
  {
    id: 'empreendedorismo',
    label: 'Empreendedorismo e inovação',
    profiles: [],
    terms: ['empreendedor', 'inovação', 'inovacao', 'startup'],
  },
  {
    id: 'negocios',
    label: 'Negócios',
    profiles: [EventProfileCode.CORPORATE_TRAINING],
    terms: ['negócio', 'negocio', 'corporativ', 'convenção', 'convencao'],
  },
  {
    id: 'tecnologia',
    label: 'Tecnologia',
    profiles: [],
    terms: ['tecnologia', 'software', 'digital', 'dados'],
  },
] as const;

export type PublicSubjectAreaId = (typeof PUBLIC_SUBJECT_AREAS)[number]['id'];

export const PUBLIC_REGIONS = [
  { id: 'AC', label: 'Acre', terms: ['Acre'] },
  { id: 'AL', label: 'Alagoas', terms: ['Alagoas'] },
  { id: 'AP', label: 'Amapá', terms: ['Amapá', 'Amapa'] },
  { id: 'AM', label: 'Amazonas', terms: ['Amazonas'] },
  { id: 'BA', label: 'Bahia', terms: ['Bahia'] },
  { id: 'CE', label: 'Ceará', terms: ['Ceará', 'Ceara'] },
  { id: 'DF', label: 'Distrito Federal', terms: ['Distrito Federal', 'Brasília', 'Brasilia'] },
  { id: 'ES', label: 'Espírito Santo', terms: ['Espírito Santo', 'Espirito Santo'] },
  { id: 'GO', label: 'Goiás', terms: ['Goiás', 'Goias'] },
  { id: 'MA', label: 'Maranhão', terms: ['Maranhão', 'Maranhao'] },
  { id: 'MT', label: 'Mato Grosso', terms: ['Mato Grosso'] },
  { id: 'MS', label: 'Mato Grosso do Sul', terms: ['Mato Grosso do Sul'] },
  { id: 'MG', label: 'Minas Gerais', terms: ['Minas Gerais'] },
  { id: 'PA', label: 'Pará', terms: ['Pará'] },
  { id: 'PB', label: 'Paraíba', terms: ['Paraíba', 'Paraiba'] },
  { id: 'PR', label: 'Paraná', terms: ['Paraná', 'Parana'] },
  { id: 'PE', label: 'Pernambuco', terms: ['Pernambuco'] },
  { id: 'PI', label: 'Piauí', terms: ['Piauí', 'Piaui'] },
  { id: 'RJ', label: 'Rio de Janeiro', terms: ['Rio de Janeiro'] },
  { id: 'RN', label: 'Rio Grande do Norte', terms: ['Rio Grande do Norte'] },
  { id: 'RS', label: 'Rio Grande do Sul', terms: ['Rio Grande do Sul'] },
  { id: 'RO', label: 'Rondônia', terms: ['Rondônia', 'Rondonia'] },
  { id: 'RR', label: 'Roraima', terms: ['Roraima'] },
  { id: 'SC', label: 'Santa Catarina', terms: ['Santa Catarina'] },
  { id: 'SP', label: 'São Paulo', terms: ['São Paulo', 'Sao Paulo'] },
  { id: 'SE', label: 'Sergipe', terms: ['Sergipe'] },
  { id: 'TO', label: 'Tocantins', terms: ['Tocantins'] },
] as const;

export type PublicRegionId = (typeof PUBLIC_REGIONS)[number]['id'];

const SUBJECT_BY_ID = new Map(PUBLIC_SUBJECT_AREAS.map((area) => [area.id, area]));
const REGION_BY_ID = new Map(PUBLIC_REGIONS.map((region) => [region.id, region]));

export function publicSubjectArea(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  return SUBJECT_BY_ID.get(normalized as PublicSubjectAreaId);
}

export function publicRegion(value: string | undefined) {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return undefined;
  return REGION_BY_ID.get(normalized as PublicRegionId);
}

function contains(term: string): Prisma.StringFilter {
  return { contains: term, mode: 'insensitive' };
}

export function subjectAreaWhere(areaId: string | undefined): Prisma.EventWhereInput | undefined {
  const area = publicSubjectArea(areaId);
  if (!area) return undefined;
  const keywords: Prisma.EventWhereInput[] = [];
  for (const term of area.terms) {
    keywords.push({ name: contains(term) });
    keywords.push({ eventType: contains(term) });
    keywords.push({ eventPublication: { is: { shortDescription: contains(term) } } });
  }
  return {
    OR: [
      { subjectAreas: { has: area.id } },
      { AND: [{ subjectAreas: { isEmpty: true } }, { OR: keywords }] },
    ],
  };
}

export function regionWhere(regionId: string | undefined): Prisma.EventWhereInput | undefined {
  const region = publicRegion(regionId);
  if (!region) return undefined;
  const match: Prisma.EventWhereInput = {
    OR: [
      ...region.terms.map((term) => ({ venue: contains(term) })),
      { venue: contains(`/${region.id}`) },
      { venue: contains(`- ${region.id}`) },
      { venue: contains(`, ${region.id}`) },
      { venue: contains(` ${region.id}`) },
    ],
  };
  if (region.id === 'MT') return { AND: [match, { NOT: { venue: contains('Mato Grosso do Sul') } }] };
  if (region.id === 'PA') {
    return {
      AND: [
        match,
        {
          NOT: {
            OR: [
              { venue: contains('Paraíba') },
              { venue: contains('Paraná') },
            ],
          },
        },
      ],
    };
  }
  return match;
}

export function discoveryTextWhere(query: string | undefined): Prisma.EventWhereInput | undefined {
  const normalized = query?.trim().slice(0, 120);
  if (!normalized) return undefined;
  return {
    OR: [
      { name: contains(normalized) },
      { venue: contains(normalized) },
      { eventType: contains(normalized) },
      { eventPublication: { is: { shortDescription: contains(normalized) } } },
    ],
  };
}
