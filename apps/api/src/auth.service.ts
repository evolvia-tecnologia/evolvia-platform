import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { EmailVerificationDispatchService } from './auth/email-verification-dispatch.service';
import { LoginDto } from './auth/login.dto';
import { RegisterDto } from './auth/register.dto';
import { PASSWORD_POLICY_MESSAGE, isPasswordStrong } from './password-policy';
import { PrismaService } from './prisma.service';
import { slugify } from './slug';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly emailVerification: EmailVerificationDispatchService,
  ) {}

  async register(dto: RegisterDto) {
    if (!isPasswordStrong(dto.password)) {
      throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
    }

    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('Já existe uma conta com este e-mail.');
    }

    const name = dto.name.trim();
    const passwordHash = await bcrypt.hash(dto.password, 12);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { name, email, passwordHash },
          select: { id: true, name: true, email: true, createdAt: true },
        });
        const organization = await tx.organization.create({
          data: {
            name: `Organização de ${name}`,
            slug: `${slugify(name) || 'pessoal'}-${user.id.slice(-8)}`,
            createdById: user.id,
          },
          select: { id: true, name: true, slug: true, status: true, createdAt: true },
        });
        await tx.organizationMembership.create({
          data: {
            organizationId: organization.id,
            userId: user.id,
            role: MembershipRole.OWNER,
            status: MembershipStatus.ACTIVE,
            joinedAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: organization.id,
            actorUserId: user.id,
            action: 'organization.personal_created',
            entityType: 'Organization',
            entityId: organization.id,
          },
        });
        return { user, organization };
      });

      let emailVerificationStatus: 'SENT' | 'PENDING' = 'SENT';
      try {
        await this.emailVerification.send(result.user.id);
      } catch {
        // O coordenador já revoga o token e registra apenas diagnóstico sanitizado.
        // A conta criada permanece válida para permitir reenvio posterior.
        emailVerificationStatus = 'PENDING';
      }

      return {
        ...result,
        emailVerification: { status: emailVerificationStatus },
        token: await this.jwt.signAsync({ sub: result.user.id, email: result.user.email }),
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('Já existe uma conta com este e-mail.');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }
    return {
      user: { id: user.id, name: user.name, email: user.email },
      token: await this.jwt.signAsync({ sub: user.id, email: user.email }),
    };
  }
}
