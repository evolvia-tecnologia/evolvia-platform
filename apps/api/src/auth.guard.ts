import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from './prisma.service';

export interface AuthenticatedRequest {
  user?: { id: string; email: string };
  headers: { authorization?: string };
}

type SessionTokenPayload = Readonly<{
  sub: string;
  email: string;
  cv?: number;
}>;

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Sessão não informada.');
    }

    try {
      const payload = await this.jwt.verifyAsync<SessionTokenPayload>(
        authorization.slice(7),
      );
      const credentialVersion = payload.cv ?? 0;
      if (
        !payload.sub
        || !payload.email
        || !Number.isInteger(credentialVersion)
        || credentialVersion < 0
      ) {
        throw new UnauthorizedException();
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, credentialVersion: true },
      });
      if (!user || user.credentialVersion !== credentialVersion) {
        throw new UnauthorizedException();
      }

      request.user = { id: user.id, email: user.email };
      return true;
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }
  }
}
