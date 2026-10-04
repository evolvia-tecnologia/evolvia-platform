export const PUBLIC_SUBJECT_AREAS = [
  { id: 'educacao', label: 'Educação', description: 'Congressos, cursos, jornadas e formação.' },
  { id: 'saude', label: 'Saúde', description: 'Encontros de cuidado, clínica e pesquisa em saúde.' },
  { id: 'direito', label: 'Direito', description: 'Eventos jurídicos, acadêmicos e de prática profissional.' },
  { id: 'entretenimento', label: 'Entretenimento', description: 'Shows, festivais e experiências de público.' },
  { id: 'espiritualidade', label: 'Religiosos ou espiritualidade', description: 'Encontros religiosos, espirituais e beneficentes.' },
  { id: 'engenharias', label: 'Engenharias', description: 'Congressos, seminários e encontros técnicos.' },
  { id: 'empreendedorismo', label: 'Empreendedorismo e inovação', description: 'Startups, inovação e novos negócios.' },
  { id: 'negocios', label: 'Negócios', description: 'Convenções, treinamentos e eventos corporativos.' },
  { id: 'tecnologia', label: 'Tecnologia', description: 'Software, dados e encontros digitais.' },
] as const;

export type PublicSubjectAreaId = (typeof PUBLIC_SUBJECT_AREAS)[number]['id'];

export const PUBLIC_REGIONS = [
  { id: 'AC', label: 'Acre' },
  { id: 'AL', label: 'Alagoas' },
  { id: 'AP', label: 'Amapá' },
  { id: 'AM', label: 'Amazonas' },
  { id: 'BA', label: 'Bahia' },
  { id: 'CE', label: 'Ceará' },
  { id: 'DF', label: 'Distrito Federal' },
  { id: 'ES', label: 'Espírito Santo' },
  { id: 'GO', label: 'Goiás' },
  { id: 'MA', label: 'Maranhão' },
  { id: 'MT', label: 'Mato Grosso' },
  { id: 'MS', label: 'Mato Grosso do Sul' },
  { id: 'MG', label: 'Minas Gerais' },
  { id: 'PA', label: 'Pará' },
  { id: 'PB', label: 'Paraíba' },
  { id: 'PR', label: 'Paraná' },
  { id: 'PE', label: 'Pernambuco' },
  { id: 'PI', label: 'Piauí' },
  { id: 'RJ', label: 'Rio de Janeiro' },
  { id: 'RN', label: 'Rio Grande do Norte' },
  { id: 'RS', label: 'Rio Grande do Sul' },
  { id: 'RO', label: 'Rondônia' },
  { id: 'RR', label: 'Roraima' },
  { id: 'SC', label: 'Santa Catarina' },
  { id: 'SP', label: 'São Paulo' },
  { id: 'SE', label: 'Sergipe' },
  { id: 'TO', label: 'Tocantins' },
] as const;

export type PublicRegionId = (typeof PUBLIC_REGIONS)[number]['id'];

const REGION_BOXES: Array<{ id: PublicRegionId; south: number; north: number; west: number; east: number }> = [
  { id: 'AC', south: -11.2, north: -7.1, west: -74.0, east: -66.6 },
  { id: 'AL', south: -10.5, north: -8.8, west: -38.3, east: -35.1 },
  { id: 'AP', south: -1.3, north: 4.5, west: -54.9, east: -49.9 },
  { id: 'AM', south: -9.8, north: 2.3, west: -73.8, east: -56.1 },
  { id: 'BA', south: -18.4, north: -8.5, west: -46.6, east: -37.3 },
  { id: 'CE', south: -7.9, north: -2.8, west: -41.5, east: -37.2 },
  { id: 'DF', south: -16.1, north: -15.5, west: -48.3, east: -47.3 },
  { id: 'ES', south: -21.3, north: -17.9, west: -41.9, east: -39.6 },
  { id: 'GO', south: -19.5, north: -12.4, west: -53.3, east: -45.9 },
  { id: 'MA', south: -10.3, north: -1.0, west: -48.8, east: -41.8 },
  { id: 'MT', south: -18.1, north: -7.3, west: -61.6, east: -50.2 },
  { id: 'MS', south: -24.1, north: -17.2, west: -58.2, east: -50.9 },
  { id: 'MG', south: -22.9, north: -14.2, west: -51.1, east: -39.8 },
  { id: 'PA', south: -9.9, north: 2.6, west: -58.9, east: -46.0 },
  { id: 'PB', south: -8.4, north: -6.0, west: -38.8, east: -34.7 },
  { id: 'PR', south: -26.8, north: -22.5, west: -54.6, east: -48.0 },
  { id: 'PE', south: -9.5, north: -7.2, west: -41.4, east: -34.8 },
  { id: 'PI', south: -10.9, north: -2.7, west: -46.0, east: -40.4 },
  { id: 'RJ', south: -23.4, north: -20.7, west: -44.9, east: -40.9 },
  { id: 'RN', south: -6.9, north: -4.8, west: -38.6, east: -34.9 },
  { id: 'RS', south: -33.8, north: -27.1, west: -57.7, east: -49.7 },
  { id: 'RO', south: -13.7, north: -7.9, west: -66.8, east: -59.8 },
  { id: 'RR', south: 0.6, north: 5.3, west: -64.8, east: -58.8 },
  { id: 'SC', south: -29.4, north: -25.9, west: -53.8, east: -48.3 },
  { id: 'SP', south: -25.3, north: -19.8, west: -53.2, east: -44.0 },
  { id: 'SE', south: -11.6, north: -9.5, west: -38.3, east: -36.4 },
  { id: 'TO', south: -13.5, north: -5.2, west: -50.8, east: -45.7 },
];

export function isPublicSubjectArea(value: string): value is PublicSubjectAreaId {
  return PUBLIC_SUBJECT_AREAS.some((area) => area.id === value);
}

export function isPublicRegion(value: string): value is PublicRegionId {
  return PUBLIC_REGIONS.some((region) => region.id === value);
}

export function publicSubjectAreaLabel(value: string): string | null {
  return PUBLIC_SUBJECT_AREAS.find((area) => area.id === value)?.label ?? null;
}

export function publicRegionLabel(value: string): string | null {
  return PUBLIC_REGIONS.find((region) => region.id === value)?.label ?? null;
}

export function suggestBrazilianRegion(latitude: number, longitude: number): PublicRegionId | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const matches = REGION_BOXES.filter((box) => (
    latitude >= box.south && latitude <= box.north && longitude >= box.west && longitude <= box.east
  ));
  if (matches.length === 0) return null;
  matches.sort((left, right) => {
    const leftArea = (left.north - left.south) * (left.east - left.west);
    const rightArea = (right.north - right.south) * (right.east - right.west);
    return leftArea - rightArea;
  });
  return matches[0].id;
}
