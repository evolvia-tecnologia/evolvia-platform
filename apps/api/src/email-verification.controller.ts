import {
  BadRequestException,
  Body,
  Controller,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfirmEmailDto } from './auth/confirm-email.dto';
import { EmailVerificationConfirmationService } from './auth/email-verification-confirmation.service';
import {
  EMAIL_VERIFICATION_REJECTED_MESSAGE,
  EMAIL_VERIFICATION_UNAVAILABLE_MESSAGE,
  EmailVerificationRejectedError,
  EmailVerificationUnavailableError,
} from './auth/email-verification.service';

export const EMAIL_VERIFICATION_COMPLETED_MESSAGE =
  'E-mail confirmado com segurança. Você já pode entrar na Evolvia.';

@Controller('auth/email')
export class EmailVerificationController {
  constructor(
    private readonly confirmation: EmailVerificationConfirmationService,
  ) {}

  @Post('verify')
  async verify(
    @Body() dto: ConfirmEmailDto,
  ): Promise<Readonly<{ message: string }>> {
    try {
      await this.confirmation.confirm(dto.token);
      return { message: EMAIL_VERIFICATION_COMPLETED_MESSAGE };
    } catch (reason) {
      if (reason instanceof EmailVerificationRejectedError) {
        throw new BadRequestException(EMAIL_VERIFICATION_REJECTED_MESSAGE);
      }
      if (reason instanceof EmailVerificationUnavailableError) {
        throw new ServiceUnavailableException(
          EMAIL_VERIFICATION_UNAVAILABLE_MESSAGE,
        );
      }
      throw new ServiceUnavailableException(
        EMAIL_VERIFICATION_UNAVAILABLE_MESSAGE,
      );
    }
  }
}
