import {
  BadRequestException,
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ForgotPasswordDto } from './auth/forgot-password.dto';
import { NoStore } from './auth/no-store.decorator';
import {
  PasswordRecoveryOriginService,
  PasswordRecoveryPublicRequest,
} from './auth/password-recovery-public';
import {
  PasswordRecoveryRequestService,
} from './auth/password-recovery-request.service';
import { PasswordRecoveryRateLimitExceededError } from './auth/password-recovery-rate-limiter';
import { PASSWORD_RECOVERY_PUBLIC_MESSAGE } from './auth/password-recovery';
import { ResetPasswordDto } from './auth/reset-password.dto';
import {
  PASSWORD_RESET_REJECTED_MESSAGE,
  PASSWORD_RESET_UNAVAILABLE_MESSAGE,
  PasswordResetPasswordPolicyError,
  PasswordResetRejectedError,
  PasswordResetService,
  PasswordResetUnavailableError,
} from './auth/password-reset.service';

export const PASSWORD_RESET_COMPLETED_MESSAGE =
  'Senha redefinida com segurança. Você já pode entrar na Evolvia.';

@Controller('auth/password')
export class PasswordRecoveryController {
  constructor(
    private readonly recovery: PasswordRecoveryRequestService,
    private readonly resetService: PasswordResetService,
    private readonly origin: PasswordRecoveryOriginService,
  ) {}

  @NoStore()
  @Post('forgot')
  async forgot(
    @Body() dto: ForgotPasswordDto,
    @Req() request: PasswordRecoveryPublicRequest,
  ): Promise<Readonly<{ message: string }>> {
    try {
      return await this.recovery.request({
        email: dto.email,
        originKey: this.origin.createKey(request),
      });
    } catch (reason) {
      if (reason instanceof PasswordRecoveryRateLimitExceededError) {
        throw new HttpException(
          { message: PASSWORD_RECOVERY_PUBLIC_MESSAGE },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new ServiceUnavailableException(
        'Não foi possível processar a solicitação agora. Tente novamente mais tarde.',
      );
    }
  }

  @NoStore()
  @Post('reset')
  async reset(@Body() dto: ResetPasswordDto): Promise<Readonly<{ message: string }>> {
    try {
      await this.resetService.reset({
        token: dto.token,
        newPassword: dto.newPassword,
      });
      return { message: PASSWORD_RESET_COMPLETED_MESSAGE };
    } catch (reason) {
      if (reason instanceof PasswordResetPasswordPolicyError) {
        throw new BadRequestException(reason.message);
      }
      if (reason instanceof PasswordResetRejectedError) {
        throw new BadRequestException(PASSWORD_RESET_REJECTED_MESSAGE);
      }
      if (reason instanceof PasswordResetUnavailableError) {
        throw new ServiceUnavailableException(PASSWORD_RESET_UNAVAILABLE_MESSAGE);
      }
      throw new ServiceUnavailableException(PASSWORD_RESET_UNAVAILABLE_MESSAGE);
    }
  }
}
