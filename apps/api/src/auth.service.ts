import { BadRequestException, ConflictException, HttpException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { LoginDto } from './auth/login.dto';
import { RegisterDto } from './auth/register.dto';
import { ParticipantRegisterDto } from './auth/participant-register.dto';
import { PASSWORD_POLICY_MESSAGE, isPasswordStrong } from './password-policy';
import { PrismaService } from './prisma.service';
import { EmailVerificationService } from './email-verification.service';
import { LOGIN_TIMING_HASH } from './access-shield';
import { slugify } from './slug';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly emailVerification: EmailVerificationService,
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

      let emailVerificationSent = true;
      try { await this.emailVerification.issue(result.user.id, { organizationId: result.organization.id }); }
      catch (error) {
        this.logger.warn(`email_verification_issue_failed status=${error instanceof HttpException ? error.getStatus() : 'unexpected'}`);
        emailVerificationSent = false;
      }
      return {
        ...result,
        token: await this.jwt.signAsync({ sub: result.user.id, email: result.user.email }),
        emailVerificationRequired: true,
        emailVerificationSent,
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('Já existe uma conta com este e-mail.');
      }
      throw error;
    }
  }

  async registerParticipant(dto: ParticipantRegisterDto) {
    if (!isPasswordStrong(dto.password)) throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { name: dto.name.trim(), email, passwordHash },
          select: { id: true, name: true, email: true },
        });
        return created;
      });
      let emailVerificationSent = true;
      try {
        await this.emailVerification.issue(user.id);
      } catch (error) {
        this.logger.warn(`participant_email_verification_issue_failed status=${error instanceof HttpException ? error.getStatus() : 'unexpected'}`);
        emailVerificationSent = false;
      }
      return {
        user,
        token: await this.jwt.signAsync({ sub: user.id, email: user.email }),
        emailVerificationRequired: true,
        emailVerificationSent,
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('Já existe uma conta ou vínculo com este e-mail. Entre com sua senha.');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const passwordMatches = await bcrypt.compare(dto.password, user?.passwordHash ?? LOGIN_TIMING_HASH);
    if (!user || !user.passwordHash || !passwordMatches) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }
    return {
      user: { id: user.id, name: user.name, email: user.email },
      token: await this.jwt.signAsync({ sub: user.id, email: user.email }),
    };
  }
}
