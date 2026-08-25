import { IsString, Matches } from 'class-validator';
import { EMAIL_VERIFICATION_REJECTED_MESSAGE } from './email-verification.service';

const EMAIL_VERIFICATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export class ConfirmEmailDto {
  @IsString({ message: EMAIL_VERIFICATION_REJECTED_MESSAGE })
  @Matches(EMAIL_VERIFICATION_TOKEN_PATTERN, {
    message: EMAIL_VERIFICATION_REJECTED_MESSAGE,
  })
  token!: string;
}
