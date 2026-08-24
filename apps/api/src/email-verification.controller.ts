import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ConfirmEmailDto } from './auth/confirm-email.dto';
import { EmailVerificationConfirmationService } from './auth/email-verification-confirmation.service';
import {
  EmailVerificationDispatchRateLimitedError,
  EmailVerificationDispatchService,
  EmailVerificationDispatchUnavailableError,
} from './auth/email-verification-dispatch.service';
import {
  EMAIL_VERIFICATION_REJECTED_MESSAGE,
  EMAIL_VERIFICATION_UNAVAILABLE_MESSAGE,
  EmailVerificationRejectedError,
  EmailVerificationUnavailableError,
} from './auth/email-verification.service';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';

export const EMAIL_VERIFICATION_COMPLETED_MESSAGE =
  'E-mail confirmado com segurança. Você já pode entrar na Evolvia.';
export const EMAIL_VERIFICATION_RESEND_MESSAGE =
  'Se sua conta ainda precisar de confirmação, enviaremos um novo link.';

@Controller('auth/email')
export class EmailVerificationController {
  constructor(
    private readonly confirmation: EmailVerificationConfirmationService,
    private readonly dispatch: EmailVerificationDispatchService,
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

  @UseGuards(AuthGuard)
  @Post('resend')
  async resend(
    @Req() request: AuthenticatedRequest,
  ): Promise<Readonly<{ message: string }>> {
    try {
      await this.dispatch.send(request.user!.id);
      return { message: EMAIL_VERIFICATION_RESEND_MESSAGE };
    } catch (reason) {
      if (reason instanceof EmailVerificationDispatchRateLimitedError) {
        throw new HttpException(
          { message: EMAIL_VERIFICATION_RESEND_MESSAGE },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (reason instanceof EmailVerificationDispatchUnavailableError) {
        throw new ServiceUnavailableException(
          'Não foi possível reenviar o link agora. Tente novamente mais tarde.',
        );
      }
      throw new ServiceUnavailableException(
        'Não foi possível reenviar o link agora. Tente novamente mais tarde.',
      );
    }
  }
}
