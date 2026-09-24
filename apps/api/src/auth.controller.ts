import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { LoginDto } from './auth/login.dto';
import { ConfirmEmailDto } from './auth/confirm-email.dto';
import { ParticipantRegisterDto } from './auth/participant-register.dto';
import { RegisterDto } from './auth/register.dto';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { AuthService } from './auth.service';
import { PrismaService } from './prisma.service';
import { EmailVerificationService } from './email-verification.service';

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  @Post('auth/register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('auth/participant/register')
  registerParticipant(@Body() dto: ParticipantRegisterDto) {
    return this.auth.registerParticipant(dto);
  }

  @Post('auth/login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('auth/email-verification/confirm')
  confirmEmail(@Body() dto: ConfirmEmailDto) {
    return this.emailVerification.confirm(dto.token);
  }

  @UseGuards(AuthGuard)
  @Post('auth/email-verification/request')
  requestEmailVerification(@Req() request: AuthenticatedRequest) {
    return this.emailVerification.issue(request.user!.id);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return this.prisma.user.findUnique({
      where: { id: request.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        memberships: {
          where: { status: MembershipStatus.ACTIVE },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            organization: { select: { id: true, name: true, slug: true, status: true } },
          },
        },
      },
    });
  }
}
