import { BadRequestException } from '@nestjs/common';

export const CONDITION_SOURCE_TYPES = ['SELECT', 'RADIO'] as const;
export type ConditionSourceType = (typeof CONDITION_SOURCE_TYPES)[number];

export const CONDITION_OPERATORS = [
  { id: 'EQUALS', label: 'for igual a' },
  { id: 'NOT_EQUALS', label: 'for diferente de' },
] as const;
export type ConditionOperatorId = (typeof CONDITION_OPERATORS)[number]['id'];

export type FieldCondition = { fieldId: string; operator: ConditionOperatorId; value: string };
export type ConditionSourceField = {
  id: string;
  type: string;
  enabled?: boolean;
  options?: Array<{ id: string; label: string }>;
};

const OPERATORS = new Set<string>(CONDITION_OPERATORS.map((operator) => operator.id));

export function isConditionSourceType(type: string): type is ConditionSourceType {
  return (CONDITION_SOURCE_TYPES as readonly string[]).includes(type);
}

export function validateFieldCondition(
  condition: unknown,
  context: { dependentIndex: number; dependentLocked: boolean; fields: ConditionSourceField[] },
): FieldCondition {
  if (context.dependentLocked) {
    throw new BadRequestException('Campos essenciais não podem ter condição de exibição.');
  }
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
    throw new BadRequestException('A condição de exibição é inválida.');
  }

  const candidate = condition as { fieldId?: unknown; operator?: unknown; value?: unknown };
  if (context.dependentIndex === 0) {
    throw new BadRequestException('A condição deve depender de um campo anterior da ficha.');
  }

  const sourceIndex = context.fields.findIndex((field) => field.id === candidate.fieldId);
  if (sourceIndex === -1) {
    throw new BadRequestException('O campo fonte da condição não existe nesta ficha.');
  }
  if (sourceIndex >= context.dependentIndex) {
    throw new BadRequestException('A condição deve depender de um campo anterior da ficha.');
  }

  const source = context.fields[sourceIndex];
  if (source.enabled === false) {
    throw new BadRequestException('A condição deve depender de um campo habilitado.');
  }
  if (!isConditionSourceType(source.type)) {
    throw new BadRequestException('A condição só pode depender de um campo de lista ou escolha única.');
  }
  if (typeof candidate.operator !== 'string' || !OPERATORS.has(candidate.operator)) {
    throw new BadRequestException('Operador condicional não permitido.');
  }
  const option = source.options?.find((item) => item.id === candidate.value);
  if (!option) {
    throw new BadRequestException('O valor da condição deve ser uma opção atual do campo fonte.');
  }

  return { fieldId: source.id, operator: candidate.operator as ConditionOperatorId, value: option.id };
}
