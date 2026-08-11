import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

export type ValidationFieldError = {
  field: string;
  message: string;
};

export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ValidationFieldError[] {
  const result: ValidationFieldError[] = [];

  for (const error of errors) {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;

    if (error.constraints) {
      for (const message of Object.values(error.constraints)) {
        result.push({ field, message });
      }
    }

    if (error.children?.length) {
      result.push(...flattenValidationErrors(error.children, field));
    }
  }

  return result;
}

export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_ERROR',
    message: 'Revise os campos informados.',
    fields: flattenValidationErrors(errors),
  });
}
