import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { assertAccessRate, type AccessShieldRequest, shieldDigest } from './access-shield';
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
  register(@Req() request: AccessShieldRequest, @Body() dto: RegisterDto) {
    assertAccessRate(request, 'register', 5);
    return this.auth.register(dto);
  }

  @Post('auth/participant/register')
  registerParticipant(@Req() request: AccessShieldRequest, @Body() dto: ParticipantRegisterDto) {
    assertAccessRate(request, 'participant-register', 5);
    return this.auth.registerParticipant(dto);
  }

  @Post('auth/login')
  login(@Req() request: AccessShieldRequest, @Body() dto: LoginDto) {
    assertAccessRate(request, 'login', 20);
    assertAccessRate(request, `login:${shieldDigest(dto.email.trim().toLowerCase())}`, 8);
    return this.auth.login(dto);
  }

  @Post('auth/email-verification/confirm')
  confirmEmail(@Req() request: AccessShieldRequest, @Body() dto: ConfirmEmailDto) {
    assertAccessRate(request, 'email-confirm', 10);
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
