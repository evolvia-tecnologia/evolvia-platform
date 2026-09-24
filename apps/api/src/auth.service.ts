import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { EventStatus, MembershipRole, MembershipStatus, Prisma, RegistrationReservationStatus } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { LoginDto } from './auth/login.dto';
import { RegisterDto } from './auth/register.dto';
import { ParticipantRegisterDto } from './auth/participant-register.dto';
import { normalizeParticipantAccess, participantHash, secureHashMatches } from './participant-area-policy';
import { PASSWORD_POLICY_MESSAGE, isPasswordStrong } from './password-policy';
import { PrismaService } from './prisma.service';
import { EmailVerificationService } from './email-verification.service';
import { slugify } from './slug';

@Injectable()
export class AuthService {
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
      try { await this.emailVerification.issue(result.user.id); }
      catch { emailVerificationSent = false; }
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
    let input: { protocol: string; identityDocument: string };
    try { input = normalizeParticipantAccess(dto); }
    catch { throw new UnauthorizedException('Não foi possível confirmar a inscrição.'); }
    const reservation = await this.prisma.eventRegistrationReservation.findUnique({
      where: { protocol: input.protocol },
      select: { id: true, eventId: true, organizationId: true, identityHash: true, emailHash: true,
        status: true, expiresAt: true, event: { select: { status: true, endDate: true } } },
    });
    const now = new Date();
    if (!reservation || reservation.emailHash !== participantHash(email)
      || !secureHashMatches(reservation.identityHash, participantHash(input.identityDocument))
      || reservation.event.status !== EventStatus.PUBLISHED
      || (reservation.event.endDate && reservation.event.endDate < now)
      || (reservation.status !== RegistrationReservationStatus.CONFIRMED
        && (reservation.status !== RegistrationReservationStatus.PENDING_PAYMENT
          || !reservation.expiresAt || reservation.expiresAt <= now))) {
      throw new UnauthorizedException('Não foi possível confirmar a inscrição.');
    }
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
        await this.emailVerification.issue(user.id, {
          organizationId: reservation.organizationId,
          eventId: reservation.eventId,
          identityHash: reservation.identityHash,
          emailHash: reservation.emailHash,
        });
      } catch { emailVerificationSent = false; }
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
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }
    return {
      user: { id: user.id, name: user.name, email: user.email },
      token: await this.jwt.signAsync({ sub: user.id, email: user.email }),
    };
  }
}
