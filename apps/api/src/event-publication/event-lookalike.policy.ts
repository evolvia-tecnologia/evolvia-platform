export type LookalikeFingerprint = {
  logoChecksum: string | null;
  categoryNames: string[];
  priceCents: number[];
};

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR').replace(/\s+/gu, ' ');
}

function positivePrices(values: number[]): Set<number> {
  return new Set(values.filter((price) => Number.isInteger(price) && price > 0));
}

export function lookalikeSignals(current: LookalikeFingerprint, other: LookalikeFingerprint): string[] | null {
  const currentNames = new Set(current.categoryNames.map(normalizeName).filter(Boolean));
  const otherNames = new Set(other.categoryNames.map(normalizeName).filter(Boolean));
  let sharedNames = 0;
  for (const name of currentNames) if (otherNames.has(name)) sharedNames += 1;

  const currentPrices = positivePrices(current.priceCents);
  const otherPrices = positivePrices(other.priceCents);
  let sharedPrices = 0;
  for (const price of currentPrices) if (otherPrices.has(price)) sharedPrices += 1;

  const sameLogo = Boolean(current.logoChecksum && current.logoChecksum === other.logoChecksum);
  const sameCategories = currentNames.size > 0 && currentNames.size === otherNames.size && sharedNames === currentNames.size;
  const samePrices = currentPrices.size > 0 && currentPrices.size === otherPrices.size && sharedPrices === currentPrices.size;
  const repeatedCommercialPattern = sharedNames >= 2 && sharedPrices >= 1;
  if (!sameLogo && !(sameCategories && samePrices) && !repeatedCommercialPattern) return null;

  const signals = ['venue', 'dates'];
  if (sameLogo) signals.push('logo');
  if (sharedNames > 0) signals.push('categories');
  if (sharedPrices > 0) signals.push('prices');
  return signals;
}
