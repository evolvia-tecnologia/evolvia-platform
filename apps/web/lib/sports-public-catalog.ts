import { sportsKitAvailability, validateSportsKitVariants, type SportsKitVariant } from './sports-athlete-and-kits';
import { validateSportsModalities, type SportsModality } from './sports-public-profile';

export type SportsPublicCatalog = {
  modalities: SportsModality[];
  kits: Array<SportsKitVariant & { available: number }>;
};

function contentRow(content: unknown): Record<string, unknown> | null {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  return content as Record<string, unknown>;
}

/** Lê só o que o organizador salvou e a validação aceita. Não reserva estoque nem cria modalidade. */
export function readSportsCatalog(sections: Array<{ content: unknown }>): SportsPublicCatalog {
  const modalities: SportsModality[] = [];
  const kits: SportsPublicCatalog['kits'] = [];
  const modalityIds = new Set<string>();
  const kitIds = new Set<string>();
  for (const section of sections) {
    const row = contentRow(section.content);
    if (!row) continue;
    if (Array.isArray(row.modalities) && validateSportsModalities(row.modalities).length === 0) {
      for (const modality of row.modalities as SportsModality[]) {
        if (modalityIds.has(modality.id)) continue;
        modalityIds.add(modality.id);
        modalities.push(modality);
      }
    }
    if (Array.isArray(row.kits) && validateSportsKitVariants(row.kits).length === 0) {
      for (const kit of row.kits as SportsKitVariant[]) {
        if (kitIds.has(kit.id)) continue;
        kitIds.add(kit.id);
        kits.push({ ...kit, available: sportsKitAvailability(kit) });
      }
    }
  }
  return { modalities, kits };
}
