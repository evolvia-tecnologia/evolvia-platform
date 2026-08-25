import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { LoginDto } from './auth/login.dto';
import { NoStore } from './auth/no-store.decorator';
import { RegisterDto } from './auth/register.dto';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { AuthService } from './auth.service';
import { PrismaService } from './prisma.service';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly prisma: PrismaService) {}

  @NoStore()
  @Post('auth/register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @NoStore()
  @Post('auth/login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @UseGuards(AuthGuard)
  @NoStore()
  @Get('me')
  async me(@Req() request: AuthenticatedRequest) {
    const user = await this.prisma.user.findUnique({
      where: { id: request.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        emailVerifiedAt: true,
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
    if (!user) return null;

    const { emailVerifiedAt, ...publicUser } = user;
    return {
      ...publicUser,
      emailVerification: {
        status: emailVerifiedAt ? 'VERIFIED' as const : 'PENDING' as const,
      },
    };
  }
}
