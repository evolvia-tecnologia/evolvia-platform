export type BenefitField = 'name' | 'code' | 'discountPercent' | 'maxUses' | 'validFrom' | 'validUntil';

export const BENEFIT_CATALOG_UNCONFIRMED = 'O servidor manteve a lista anterior. A alteração desta tela não foi gravada.';

export type BenefitCatalogRow = {
  code: string;
  name: string;
  kind: string;
  discountPercent: number;
  maxUses: number;
  validFrom: string;
  validUntil: string;
  active: boolean;
  sortOrder: number;
};

function sameInstant(left: string, right: string): boolean {
  const parsedLeft = Date.parse(left);
  const parsedRight = Date.parse(right);
  if (Number.isNaN(parsedLeft) || Number.isNaN(parsedRight)) return left === right;
  return parsedLeft === parsedRight;
}

/** A resposta só confirma quando a lista devolvida é a que esta tela enviou. */
export function benefitCatalogConfirmed(
  sent: readonly BenefitCatalogRow[],
  returned: readonly BenefitCatalogRow[] | null | undefined,
): boolean {
  const server = returned ?? [];
  if (sent.length !== server.length) return false;
  return sent.every((item, index) => {
    const other = server[index];
    if (!other) return false;
    return item.code === other.code
      && item.name === other.name
      && item.kind === other.kind
      && item.discountPercent === other.discountPercent
      && item.maxUses === other.maxUses
      && item.active === other.active
      && item.sortOrder === other.sortOrder
      && sameInstant(item.validFrom, other.validFrom)
      && sameInstant(item.validUntil, other.validUntil);
  });
}

export type BenefitErrorRow = {
  code: string;
  name: string;
  validFrom: string;
  validUntil: string;
};

/** A API vigente devolve uma frase, sem índice. O campo sai dessa frase. */
export function benefitFieldFromApiMessage(message: string): BenefitField | null {
  const text = message.trim();
  if (/nome do benefício/iu.test(text)) return 'name';
  if (/código/iu.test(text)) return 'code';
  if (/desconto|percentual/iu.test(text)) return 'discountPercent';
  if (/limite de usos/iu.test(text)) return 'maxUses';
  if (/expir/iu.test(text)) return 'validUntil';
  if (/abertura/iu.test(text)) return 'validFrom';
  return null;
}

function localIndexes(message: string, field: BenefitField, rows: readonly BenefitErrorRow[]): number[] {
  if (field === 'code' && /único/iu.test(message)) {
    const groups = new Map<string, number[]>();
    rows.forEach((row, index) => {
      const code = row.code.trim().toUpperCase();
      groups.set(code, [...(groups.get(code) ?? []), index]);
    });
    return [...groups.values()].filter((indexes) => indexes.length > 1).flat();
  }
  if (field === 'name') return rows.flatMap((row, index) => (/[<>]/u.test(row.name) ? [index] : []));
  if (field === 'validUntil' && /depois da abertura/iu.test(message)) {
    return rows.flatMap((row, index) => (row.validFrom && row.validUntil && row.validFrom >= row.validUntil ? [index] : []));
  }
  return [];
}

/** Sem linha identificável e com mais de um código, o resumo permanece e nenhum campo é marcado. */
export function benefitErrorTargets(message: string, rows: readonly BenefitErrorRow[]): Array<{ index: number; field: BenefitField }> {
  const field = benefitFieldFromApiMessage(message);
  if (!field) return [];
  const found = localIndexes(message, field, rows);
  const indexes = found.length > 0 ? found : rows.length === 1 ? [0] : [];
  return indexes.map((index) => ({ index, field }));
}
