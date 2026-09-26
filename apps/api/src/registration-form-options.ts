import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

export const CHOICE_FIELD_TYPES = ['SELECT', 'RADIO', 'CHECKBOX'] as const;
export type ChoiceFieldType = (typeof CHOICE_FIELD_TYPES)[number];

export const REGISTRATION_OPTION_CONSTRAINTS = {
  minCount: 1,
  maxCount: 50,
  labelMinLength: 1,
  labelMaxLength: 100,
} as const;

const OPTION_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,79}$/u;

export type ValidatedFieldOption = { id: string; label: string };

export function isChoiceFieldType(type: string): type is ChoiceFieldType {
  return (CHOICE_FIELD_TYPES as readonly string[]).includes(type);
}

export function createStableOptionId(entropy: (size: number) => Buffer = randomBytes): string {
  return `opt_${entropy(12).toString('hex')}`;
}

export function normalizeOptionLabel(value: string | undefined): string {
  return value?.trim().replace(/\s+/gu, ' ').normalize('NFC') ?? '';
}

export function validateChoiceOptions(options: unknown): ValidatedFieldOption[] {
  const { minCount, maxCount, labelMinLength, labelMaxLength } = REGISTRATION_OPTION_CONSTRAINTS;
  if (!Array.isArray(options) || options.length < minCount || options.length > maxCount) {
    throw new BadRequestException(`Campos de escolha precisam ter entre ${minCount} e ${maxCount} opções.`);
  }

  const ids = new Set<string>();
  const labels = new Set<string>();
  return options.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new BadRequestException('Opção de campo inválida.');
    const option = raw as { id?: string; label?: string };
    if (!OPTION_ID.test(option.id ?? '')) throw new BadRequestException('O identificador da opção é inválido.');
    const label = normalizeOptionLabel(option.label);
    if (!label || label.length < labelMinLength || label.length > labelMaxLength || /[<>]/u.test(label)) {
      throw new BadRequestException('A opção é inválida.');
    }
    if (ids.has(option.id!)) throw new BadRequestException('Cada opção deve possuir identificador único.');
    const labelKey = label.toLocaleLowerCase('pt-BR');
    if (labels.has(labelKey)) throw new BadRequestException('Cada opção deve possuir um rótulo único.');
    ids.add(option.id!);
    labels.add(labelKey);
    return { id: option.id!, label };
  });
}
