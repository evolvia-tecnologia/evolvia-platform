export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

const ACRONYM_FILLERS = new Set(['a', 'as', 'de', 'do', 'da', 'dos', 'das', 'e', 'em', 'o', 'os', 'para']);

/** Identificador público de novos eventos: sigla legível + código gerado no servidor. */
export function eventPublicSlug(name: string, code: string): string {
  if (!/^[a-f0-9]{12}$/u.test(code)) throw new Error('Código público inválido.');
  const words = slugify(name).split('-').filter(Boolean);
  const meaningful = words.filter((word) => !ACRONYM_FILLERS.has(word));
  const initials = meaningful.slice(0, 8).map((word) => word[0]).join('');
  const acronym = meaningful.length === 1 ? meaningful[0].slice(0, 4) : initials;
  return `${acronym || 'evt'}-${code}`;
}
