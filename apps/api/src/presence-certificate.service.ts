import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuthorizationService } from './authorization.service';
import { PrismaService } from './prisma.service';
import {
  PresenceCertificatePolicyError,
  canIssuePresenceCertificate,
  certificateDisplayName,
  certificateFeeCents,
  normalizeCertificateCode,
  normalizeCertificateSetting,
  publicCertificateView,
} from './presence-certificate.policy';

const STAFF_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.OPERATOR];
const EDITOR_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER];
const UNAVAILABLE = 'O certificado só é emitido para inscrição confirmada com presença registrada, quando a organização libera.';

type IssueInput = {
  eventId: string;
  organizationId: string;
  reservationId: string;
  status: string;
  checkedIn: boolean;
  registrationData: unknown;
};

type OfferInput = {
  eventId: string;
  organizationId: string;
  reservationId: string;
  status: string;
  checkedIn: boolean;
};

@Injectable()
export class PresenceCertificateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async publicView(rawCode: string) {
    let code: string;
    try { code = normalizeCertificateCode(rawCode); }
    catch (error) {
      if (error instanceof PresenceCertificatePolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    const row = await this.prisma.eventCertificate.findUnique({
      where: { code },
      select: { displayName: true, hours: true, issuedAt: true, event: { select: { name: true } } },
    });
    if (!row) throw new NotFoundException('Certificado não encontrado.');
    return publicCertificateView({
      eventName: row.event.name,
      displayName: row.displayName,
      hours: row.hours,
      issuedAt: row.issuedAt.toISOString(),
    });
  }

  async offer(input: OfferInput) {
    const setting = await this.prisma.eventCertificateSetting.findFirst({
      where: { eventId: input.eventId, organizationId: input.organizationId },
      select: { enabled: true },
    });
    const eligible = canIssuePresenceCertificate({
      enabled: setting?.enabled === true,
      status: input.status,
      checkedIn: input.checkedIn,
    });
    if (!eligible) return { eligible: false as const, code: null, hours: null, issuedAt: null, feeCents: certificateFeeCents() };
    const existing = await this.prisma.eventCertificate.findFirst({
      where: { reservationId: input.reservationId, eventId: input.eventId, organizationId: input.organizationId },
      select: { code: true, hours: true, issuedAt: true },
    });
    return {
      eligible: true as const,
      code: existing?.code ?? null,
      hours: existing?.hours ?? null,
      issuedAt: existing?.issuedAt.toISOString() ?? null,
      feeCents: certificateFeeCents(),
    };
  }

  async issue(input: IssueInput) {
    let displayName: string;
    try { displayName = certificateDisplayName(input.registrationData); }
    catch (error) {
      if (error instanceof PresenceCertificatePolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const setting = await tx.eventCertificateSetting.findFirst({
          where: { eventId: input.eventId, organizationId: input.organizationId },
          select: { enabled: true, hours: true },
        });
        if (!setting || !canIssuePresenceCertificate({ enabled: setting.enabled, status: input.status, checkedIn: input.checkedIn })) {
          throw new ForbiddenException(UNAVAILABLE);
        }
        const existing = await tx.eventCertificate.findFirst({
          where: { reservationId: input.reservationId, eventId: input.eventId, organizationId: input.organizationId },
          select: { code: true, hours: true, issuedAt: true },
        });
        if (existing) return this.participantCopy(existing);
        const created = await tx.eventCertificate.create({
          data: {
            organizationId: input.organizationId,
            eventId: input.eventId,
            reservationId: input.reservationId,
            code: randomBytes(16).toString('hex'),
            displayName,
            hours: setting.hours,
          },
          select: { id: true, code: true, hours: true, issuedAt: true },
        });
        await tx.auditLog.create({
          data: {
            organizationId: input.organizationId,
            eventId: input.eventId,
            action: 'certificate.issued',
            entityType: 'EventCertificate',
            entityId: created.id,
            metadata: { role: 'participation', hours: created.hours, feeCents: certificateFeeCents() } as Prisma.InputJsonObject,
          },
        });
        return this.participantCopy(created);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.eventCertificate.findFirst({
          where: { reservationId: input.reservationId, eventId: input.eventId, organizationId: input.organizationId },
          select: { code: true, hours: true, issuedAt: true },
        });
        if (existing) return this.participantCopy(existing);
      }
      throw error;
    }
  }

  async get(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId, STAFF_ROLES);
    const [setting, issuedCount] = await Promise.all([
      this.prisma.eventCertificateSetting.findFirst({
        where: { eventId: event.id, organizationId: event.organizationId },
        select: { enabled: true, hours: true, revision: true },
      }),
      this.prisma.eventCertificate.count({ where: { eventId: event.id, organizationId: event.organizationId } }),
    ]);
    return {
      enabled: setting?.enabled ?? false,
      hours: setting?.hours ?? null,
      revision: setting?.revision ?? 0,
      feeCents: certificateFeeCents(),
      role: 'participation' as const,
      issuedCount,
    };
  }

  async save(userId: string, eventId: string, input: unknown) {
    const event = await this.eventFor(userId, eventId, EDITOR_ROLES);
    let setting: ReturnType<typeof normalizeCertificateSetting>;
    try { setting = normalizeCertificateSetting(input); }
    catch (error) {
      if (error instanceof PresenceCertificatePolicyError) throw new BadRequestException(error.message);
      throw error;
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.eventCertificateSetting.findFirst({
          where: { eventId: event.id, organizationId: event.organizationId },
          select: { revision: true },
        });
        if ((current?.revision ?? 0) !== setting.expectedRevision) {
          throw new ConflictException('A liberação do certificado foi alterada. Recarregue antes de salvar.');
        }
        const saved = current
          ? await (async () => {
              const advanced = await tx.eventCertificateSetting.updateMany({
                where: { eventId: event.id, organizationId: event.organizationId, revision: setting.expectedRevision },
                data: { enabled: setting.enabled, hours: setting.hours, revision: { increment: 1 } },
              });
              if (advanced.count !== 1) throw new ConflictException('A liberação do certificado foi alterada. Recarregue antes de salvar.');
              return tx.eventCertificateSetting.findFirstOrThrow({
                where: { eventId: event.id, organizationId: event.organizationId },
                select: { revision: true },
              });
            })()
          : await tx.eventCertificateSetting.create({
              data: {
                eventId: event.id,
                organizationId: event.organizationId,
                enabled: setting.enabled,
                hours: setting.hours,
              },
              select: { revision: true },
            });
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId,
            eventId: event.id,
            actorUserId: userId,
            action: 'certificate.setting_saved',
            entityType: 'EventCertificateSetting',
            entityId: event.id,
            metadata: { enabled: setting.enabled, hours: setting.hours, revision: saved.revision, feeCents: certificateFeeCents() } as Prisma.InputJsonObject,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A liberação do certificado foi alterada. Recarregue antes de salvar.');
      }
      throw error;
    }
    return this.get(userId, eventId);
  }

  private participantCopy(row: { code: string; hours: number | null; issuedAt: Date }) {
    return { code: row.code, hours: row.hours, issuedAt: row.issuedAt.toISOString(), feeCents: certificateFeeCents() };
  }

  private async eventFor(userId: string, eventId: string, roles: readonly MembershipRole[]) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, roles);
    return { id: event.id, organizationId: event.organizationId };
  }
}
