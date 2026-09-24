import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { LoginDto } from './auth/login.dto';
import { RegisterDto } from './auth/register.dto';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { AuthService } from './auth.service';
import { PrismaService } from './prisma.service';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly prisma: PrismaService) {}

  @Post('auth/register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('auth/participant/register')
  registerParticipant(@Body() dto: RegisterDto) {
    return this.auth.registerParticipant(dto);
  }

  @Post('auth/login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
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
