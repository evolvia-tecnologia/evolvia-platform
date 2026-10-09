import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { normalizeEventTimeZone } from './time-zone-policy';

export const EVENT_REUSE_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,120}$/u;

export type EventReuseInput = {
  name: string;
  confirmationName: string;
  startDate: Date;
  endDate: Date;
  timeZone: string;
  copyVenue: boolean;
  copyCapabilities: boolean;
};

function requiredText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') throw new BadRequestException(`${label} é obrigatório.`);
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (!normalized) throw new BadRequestException(`${label} é obrigatório.`);
  if (normalized.length > max) throw new BadRequestException(`${label} deve ter no máximo ${max} caracteres.`);
  return normalized;
}

function absoluteDate(value: unknown, label: string): Date {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) {
    throw new BadRequestException(`${label} deve incluir data, hora e fuso horário.`);
  }
  const components = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-](\d{2}):(\d{2}))$/u.exec(value);
  if (!components) throw new BadRequestException(`${label} é inválida.`);
  const [, year, month, day, hour, minute, second = '00', , , offsetHour, offsetMinute] = components;
  const calendar = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  if (
    Number.isNaN(calendar.getTime())
    || calendar.getUTCFullYear() !== Number(year)
    || calendar.getUTCMonth() + 1 !== Number(month)
    || calendar.getUTCDate() !== Number(day)
    || calendar.getUTCHours() !== Number(hour)
    || calendar.getUTCMinutes() !== Number(minute)
    || calendar.getUTCSeconds() !== Number(second)
    || (offsetHour !== undefined && (Number(offsetHour) > 23 || Number(offsetMinute) > 59))
  ) {
    throw new BadRequestException(`${label} é inválida.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${label} é inválida.`);
  return parsed;
}

export function parseEventReuseInput(value: unknown, now = new Date()): EventReuseInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Informe os dados da reutilização.');
  }
  const input = value as Record<string, unknown>;
  const name = requiredText(input.name, 'Nome do novo evento', 120);
  if (name.length < 3) throw new BadRequestException('Nome do novo evento deve ter ao menos 3 caracteres.');
  const confirmationName = requiredText(input.confirmationName, 'Confirmação do evento de origem', 160);
  const startDate = absoluteDate(input.startDate, 'Data de início');
  const endDate = absoluteDate(input.endDate, 'Data de término');
  if (startDate.getTime() <= now.getTime()) throw new BadRequestException('A data de início deve estar no futuro.');
  if (endDate.getTime() < startDate.getTime()) {
    throw new BadRequestException('A data de término não pode ser anterior à data de início.');
  }
  const timeZone = normalizeEventTimeZone(input.timeZone);
  if (!timeZone) throw new BadRequestException('Fuso horário do novo evento é inválido.');
  return {
    name,
    confirmationName,
    startDate,
    endDate,
    timeZone,
    copyVenue: input.copyVenue !== false,
    copyCapabilities: input.copyCapabilities !== false,
  };
}

export function requireEventReuseKey(value: unknown): string {
  if (typeof value !== 'string' || !EVENT_REUSE_KEY_PATTERN.test(value)) {
    throw new BadRequestException('Chave de idempotência inválida.');
  }
  return value;
}

export function eventReuseHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}


