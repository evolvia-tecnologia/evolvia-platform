import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface AuthenticatedRequest {
  user?: { id: string; email: string };
  headers: { authorization?: string };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Sessão não informada.');
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email: string }>(authorization.slice(7));
      request.user = { id: payload.sub, email: payload.email };
      return true;
    } catch { throw new UnauthorizedException('Sessão inválida ou expirada.'); }
  }
}
