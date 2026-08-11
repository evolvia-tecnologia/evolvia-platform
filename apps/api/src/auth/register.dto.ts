import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const HUMAN_NAME_PATTERN = /^[\p{L}\p{M}'’.\-\s]+$/u;

function normalizeHumanName(value: unknown): unknown {
  return typeof value === 'string'
    ? value.normalize('NFC').trim().replace(/\s+/gu, ' ')
    : value;
}

function normalizeEmail(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class RegisterDto {
  @Transform(({ value }) => normalizeHumanName(value))
  @IsString({ message: 'Informe seu nome.' })
  @MinLength(2, { message: 'O nome deve ter pelo menos 2 caracteres.' })
  @MaxLength(120, { message: 'O nome deve ter no máximo 120 caracteres.' })
  @Matches(HUMAN_NAME_PATTERN, {
    message: 'O nome deve conter apenas letras, espaços, hífen, apóstrofo ou ponto.',
  })
  name!: string;

  @Transform(({ value }) => normalizeEmail(value))
  @IsString({ message: 'Informe seu e-mail.' })
  @MaxLength(254, { message: 'O e-mail deve ter no máximo 254 caracteres.' })
  @IsEmail(
    { require_tld: true, allow_utf8_local_part: true },
    { message: 'Informe um e-mail válido, por exemplo nome@dominio.com.br.' },
  )
  email!: string;

  @IsString({ message: 'Informe uma senha.' })
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres.' })
  password!: string;
}
