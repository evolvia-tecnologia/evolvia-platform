import { IsString, Matches, MinLength } from 'class-validator';
import { PASSWORD_RESET_REJECTED_MESSAGE } from './password-reset.service';

const PASSWORD_RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export class ResetPasswordDto {
  @IsString({ message: PASSWORD_RESET_REJECTED_MESSAGE })
  @Matches(PASSWORD_RESET_TOKEN_PATTERN, {
    message: PASSWORD_RESET_REJECTED_MESSAGE,
  })
  token!: string;

  @IsString({ message: 'Informe a nova senha.' })
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres.' })
  newPassword!: string;
}
