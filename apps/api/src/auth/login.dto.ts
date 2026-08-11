import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

function normalizeEmail(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class LoginDto {
  @Transform(({ value }) => normalizeEmail(value))
  @IsString({ message: 'Informe seu e-mail.' })
  @MaxLength(254, { message: 'O e-mail deve ter no máximo 254 caracteres.' })
  @IsEmail(
    { require_tld: true, allow_utf8_local_part: true },
    { message: 'Informe um e-mail válido, por exemplo nome@dominio.com.br.' },
  )
  email!: string;

  @IsString({ message: 'Informe sua senha.' })
  @MinLength(1, { message: 'Informe sua senha.' })
  password!: string;
}
