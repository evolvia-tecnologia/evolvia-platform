import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  MembershipRole,
  Prisma,
  RegistrationReservationStatus,
  ScientificInvitationStatus,
  ScientificPersonStatus,
  ScientificReviewAssignmentStatus,
  ScientificReviewConflictStatus,
  ScientificSubmissionStatus,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuthorizationService } from './authorization.service';
import {
  CERTIFICATE_ROLES,
  CertificateRole,
  CertificateRolePolicyError,
  DEFAULT_ROLE_BODY,
  DEFAULT_ROLE_TITLE,
  ROLE_CERTIFICATE_BATCH_MAX,
  ROLE_CERTIFICATE_LABEL,
  canIssueActivityCertificate,
  canIssueApprovedWorkCertificate,
  canIssueGuestCertificate,
  canIssuePresentationCertificate,
  canIssueReviewerCertificate,
  canReleaseRole,
  certificateRoleFeeCents,
  normalizeRoleSetting,
  parseCertificateRole,
  participantOwnsScientificPerson,
  publicRoleCertificateView,
  registrationEmail,
  sanitizeCertificateName,
  sanitizeSubjectLabel,
  workPaperRole,
} from './certificate-role.policy';
import {
  PresenceCertificatePolicyError,
  certificateDisplayName,
  normalizeCertificateCode,
} from './presence-certificate.policy';
import { PrismaService } from './prisma.service';

const STAFF_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.OPERATOR];
const EDITOR_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER];
const CLOSED = 'Este papel de certificado ainda não está liberado.';
const STALE = 'A liberação deste papel foi alterada. Recarregue antes de salvar.';
const LOOKAHEAD = 120;
const ACCEPTED = [ScientificSubmissionStatus.ACCEPTED, ScientificSubmissionStatus.ACCEPTED_WITH_CHANGES];

type EventScope = { id: string; organizationId: string; endDate: Date | null };
type Subject = {
  reservationId: string | null;
  personId: string | null;
  activityId: string | null;
  submissionId: string | null;
  displayName: string;
  subjectLabel: string;
  paperRole: string | null;
};
type StoredCertificate = { code: string; hours: number | null; issuedAt: Date; subjectLabel: string };
type ParticipantScope = {
  eventId: string;
  organizationId: string;
  reservationId: string;
  status: string;
  registrationData: unknown;
  eventEndDate: Date | null;
};

@Injectable()
export class CertificateRoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId, STAFF_ROLES);
    return this.snapshot(event);
  }

  async save(userId: string, eventId: string, rawRole: string, input: unknown) {
    const event = await this.eventFor(userId, eventId, EDITOR_ROLES);
    const role = this.roleOrReject(rawRole);
    const setting = this.policyOrReject(() => normalizeRoleSetting(role, input));
    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.eventCertificateRoleSetting.findFirst({
          where: { eventId: event.id, organizationId: event.organizationId, role },
          select: { revision: true },
        });
        if ((current?.revision ?? 0) !== setting.expectedRevision) throw new ConflictException(STALE);
        if (!current) {
          await tx.eventCertificateRoleSetting.create({
            data: {
              eventId: event.id,
              organizationId: event.organizationId,
              role,
              enabled: setting.enabled,
              releaseMode: setting.releaseMode,
              releaseDays: setting.releaseDays,
              hours: setting.hours,
              title: setting.title,
              body: setting.body,
              revision: 1,
            },
          });
        } else {
          const advanced = await tx.eventCertificateRoleSetting.updateMany({
            where: { eventId: event.id, organizationId: event.organizationId, role, revision: setting.expectedRevision },
            data: {
              enabled: setting.enabled,
              releaseMode: setting.releaseMode,
              releaseDays: setting.releaseDays,
              hours: setting.hours,
              title: setting.title,
              body: setting.body,
              revision: { increment: 1 },
            },
          });
          if (advanced.count !== 1) throw new ConflictException(STALE);
        }
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId,
            eventId: event.id,
            actorUserId: userId,
            action: 'certificate.role_setting_saved',
            entityType: 'EventCertificateRoleSetting',
            entityId: event.id,
            metadata: { role, enabled: setting.enabled, releaseMode: setting.releaseMode, releaseDays: setting.releaseDays, feeCents: certificateRoleFeeCents() },
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException(STALE);
      throw error;
    }
    return this.snapshot(event);
  }

  async issueEligible(userId: string, eventId: string, rawRole: string) {
    const event = await this.eventFor(userId, eventId, EDITOR_ROLES);
    const role = this.roleOrReject(rawRole);
    const setting = await this.prisma.eventCertificateRoleSetting.findFirst({
      where: { eventId: event.id, organizationId: event.organizationId, role },
      select: { enabled: true, releaseMode: true, releaseDays: true },
    });
    if (setting?.enabled !== true) throw new ForbiddenException(CLOSED);
    const open = canReleaseRole({
      enabled: true,
      releaseMode: setting.releaseMode === 'after_end' ? 'after_end' : 'manual',
      releaseDays: setting.releaseDays,
      eventEndDate: event.endDate,
      now: new Date(),
    });
    if (!open) throw new ForbiddenException('Este papel só pode ser emitido depois do fim do evento, no prazo configurado.');
    const { subjects, skipped, truncated } = await this.subjects(event, role, null);
    const result = await this.issueMany(event, role, subjects, userId);
    return { ...result, skipped, truncated, feeCents: certificateRoleFeeCents() };
  }

  async publicView(rawCode: string) {
    const code = this.codeOrReject(rawCode);
    const row = await this.prisma.eventRoleCertificate.findUnique({
      where: { code },
      select: {
        role: true,
        displayName: true,
        hours: true,
        issuedAt: true,
        subjectLabel: true,
        paperRole: true,
        code: true,
        eventId: true,
        organizationId: true,
        event: { select: { name: true } },
      },
    });
    if (!row) throw new NotFoundException('Certificado não encontrado.');
    const role = this.storedRole(row.role);
    if (!role) throw new NotFoundException('Certificado não encontrado.');
    const setting = await this.prisma.eventCertificateRoleSetting.findFirst({
      where: { eventId: row.eventId, organizationId: row.organizationId, role },
      select: { title: true, body: true },
    });
    return publicRoleCertificateView({
      role,
      eventName: row.event.name,
      displayName: row.displayName,
      hours: row.hours,
      issuedAt: row.issuedAt.toISOString(),
      code: row.code,
      title: setting?.title ?? DEFAULT_ROLE_TITLE[role],
      body: setting?.body ?? DEFAULT_ROLE_BODY[role],
      subjectLabel: row.subjectLabel,
      paperRole: row.paperRole,
    });
  }

  async participantOffer(scope: ParticipantScope) {
    return this.participantCopies(scope, false);
  }

  async participantIssue(scope: ParticipantScope) {
    return this.participantCopies(scope, true);
  }

  private async participantCopies(scope: ParticipantScope, issue: boolean) {
    const event: EventScope = { id: scope.eventId, organizationId: scope.organizationId, endDate: scope.eventEndDate };
    const email = registrationEmail(scope.registrationData);
    const copies = [];
    let created = 0;
    for (const role of CERTIFICATE_ROLES) {
      const open = await this.releaseOpen(event, role, new Date());
      const { subjects } = await this.subjects(event, role, { reservationId: scope.reservationId, registrationEmail: email, status: scope.status });
      for (const subject of subjects) {
        const existing = await this.findIssued(event, role, subject);
        if (!existing && !open) continue;
        if (!existing && open && issue && created < ROLE_CERTIFICATE_BATCH_MAX) {
          const issued = await this.issueOne(event, role, subject, null);
          if (issued.created) created += 1;
          copies.push(this.copy(role, subject.subjectLabel, issued.row));
          continue;
        }
        copies.push(this.copy(role, subject.subjectLabel, existing));
      }
    }
    return { feeCents: certificateRoleFeeCents(), certificates: copies };
  }

  private copy(role: CertificateRole, subjectLabel: string, row: StoredCertificate | null) {
    return {
      role,
      label: ROLE_CERTIFICATE_LABEL[role],
      subjectLabel,
      code: row?.code ?? null,
      hours: row?.hours ?? null,
      issuedAt: row?.issuedAt.toISOString() ?? null,
      feeCents: certificateRoleFeeCents(),
    };
  }

  private async snapshot(event: EventScope) {
    const [settings, counts, preview] = await Promise.all([
      this.prisma.eventCertificateRoleSetting.findMany({
        where: { eventId: event.id, organizationId: event.organizationId },
      }),
      this.prisma.eventRoleCertificate.groupBy({
        by: ['role'],
        where: { eventId: event.id, organizationId: event.organizationId },
        _count: { _all: true },
      }),
      this.prisma.eventRoleCertificate.findMany({
        where: { eventId: event.id, organizationId: event.organizationId },
        select: { role: true, displayName: true, subjectLabel: true, code: true, issuedAt: true },
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
        take: 8,
      }),
    ]);
    const byRole = new Map(settings.map((row) => [row.role, row]));
    const countByRole = new Map(counts.map((row) => [row.role, row._count._all]));
    return {
      feeCents: certificateRoleFeeCents(),
      roles: CERTIFICATE_ROLES.map((role) => {
        const row = byRole.get(role);
        return {
          role,
          label: ROLE_CERTIFICATE_LABEL[role],
          enabled: row?.enabled ?? false,
          releaseMode: row?.releaseMode === 'after_end' ? 'after_end' as const : 'manual' as const,
          releaseDays: row?.releaseDays ?? 0,
          hours: row?.hours ?? null,
          title: row?.title ?? DEFAULT_ROLE_TITLE[role],
          body: row?.body ?? DEFAULT_ROLE_BODY[role],
          revision: row?.revision ?? 0,
          issuedCount: countByRole.get(role) ?? 0,
          tags: role === 'activity'
            ? ['NOME', 'EVENTO', 'CARGA_HORARIA', 'DATA', 'CODIGO', 'ATIVIDADE']
            : role === 'guest' || role === 'reviewer'
              ? ['NOME', 'EVENTO', 'CARGA_HORARIA', 'DATA', 'CODIGO', 'PAPEL']
              : ['NOME', 'EVENTO', 'CARGA_HORARIA', 'DATA', 'CODIGO', 'TITULO', 'PAPEL'],
        };
      }),
      recent: preview.map((row) => ({
        role: row.role,
        displayName: row.displayName,
        subjectLabel: row.subjectLabel,
        code: row.code,
        issuedAt: row.issuedAt.toISOString(),
      })),
    };
  }

  private async subjects(event: EventScope, role: CertificateRole, participant: { reservationId: string; registrationEmail: string | null; status: string } | null) {
    if (role === 'activity') return this.activitySubjects(event, participant);
    if (role === 'guest') return this.guestSubjects(event, participant);
    if (role === 'reviewer') return this.reviewerSubjects(event, participant);
    return this.workSubjects(event, role, participant);
  }

  private async activitySubjects(event: EventScope, participant: { reservationId: string; status: string } | null) {
    const rows = await this.prisma.eventActivityAccess.findMany({
      where: {
        eventId: event.id,
        organizationId: event.organizationId,
        ...(participant ? { reservationId: participant.reservationId } : {}),
        reservation: { eventId: event.id, organizationId: event.organizationId, status: RegistrationReservationStatus.CONFIRMED },
        activity: { eventId: event.id, organizationId: event.organizationId },
      },
      select: {
        reservationId: true,
        activityId: true,
        activity: { select: { title: true } },
        reservation: { select: { status: true, registrationData: true } },
      },
      orderBy: { accessedAt: 'asc' },
      take: LOOKAHEAD,
    });
    const subjects: Subject[] = [];
    let skipped = 0;
    for (const row of rows) {
      if (!canIssueActivityCertificate({ releaseOpen: true, status: row.reservation.status, hasAccess: true })) continue;
      try {
        subjects.push({
          reservationId: row.reservationId,
          personId: null,
          activityId: row.activityId,
          submissionId: null,
          displayName: certificateDisplayName(row.reservation.registrationData),
          subjectLabel: sanitizeSubjectLabel(row.activity.title, 'Atividade'),
          paperRole: null,
        });
      } catch (error) {
        if (error instanceof PresenceCertificatePolicyError || error instanceof CertificateRolePolicyError) skipped += 1;
        else throw error;
      }
    }
    return { subjects, skipped, truncated: rows.length === LOOKAHEAD };
  }

  private async workSubjects(event: EventScope, role: 'approved_submission' | 'presentation', participant: { reservationId: string; registrationEmail: string | null } | null) {
    const rows = await this.prisma.scientificSubmissionAuthor.findMany({
      where: {
        eventId: event.id,
        organizationId: event.organizationId,
        ...(role === 'presentation' ? { isPresenter: true } : {}),
        person: { eventId: event.id, organizationId: event.organizationId, status: ScientificPersonStatus.ACTIVE },
        submission: { eventId: event.id, organizationId: event.organizationId, status: { in: ACCEPTED } },
      },
      select: {
        personId: true,
        sortOrder: true,
        isPresenter: true,
        scientificName: true,
        person: { select: { name: true, email: true } },
        submission: {
          select: {
            id: true,
            title: true,
            status: true,
            ownerReservationId: true,
            _count: { select: { authors: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: LOOKAHEAD,
    });
    const subjects: Subject[] = [];
    let skipped = 0;
    for (const row of rows) {
      const allowed = role === 'presentation'
        ? canIssuePresentationCertificate({ releaseOpen: true, status: row.submission.status, isPresenter: row.isPresenter })
        : canIssueApprovedWorkCertificate({ releaseOpen: true, status: row.submission.status, isAuthor: true });
      if (!allowed) continue;
      if (participant && !participantOwnsScientificPerson({
        personEmail: row.person.email,
        registrationEmail: participant.registrationEmail,
        authorCount: row.submission._count.authors,
        ownerReservationId: row.submission.ownerReservationId,
        reservationId: participant.reservationId,
      })) continue;
      try {
        subjects.push({
          reservationId: null,
          personId: row.personId,
          activityId: null,
          submissionId: row.submission.id,
          displayName: sanitizeCertificateName(row.scientificName?.trim() || row.person.name),
          subjectLabel: sanitizeSubjectLabel(row.submission.title, 'Trabalho'),
          paperRole: role === 'presentation' ? 'Apresentador' : workPaperRole(row.sortOrder),
        });
      } catch (error) {
        if (error instanceof CertificateRolePolicyError) skipped += 1;
        else throw error;
      }
    }
    return { subjects, skipped, truncated: rows.length === LOOKAHEAD };
  }

  private async guestSubjects(event: EventScope, participant: { registrationEmail: string | null } | null) {
    if (participant && !participant.registrationEmail) return { subjects: [], skipped: 0, truncated: false };
    const rows = await this.prisma.scientificGuestProfile.findMany({
      where: {
        eventId: event.id,
        organizationId: event.organizationId,
        invitationStatus: ScientificInvitationStatus.CONFIRMED,
        person: {
          eventId: event.id,
          organizationId: event.organizationId,
          status: ScientificPersonStatus.ACTIVE,
          ...(participant?.registrationEmail ? { email: { equals: participant.registrationEmail, mode: 'insensitive' } } : {}),
        },
      },
      select: {
        personId: true,
        displayName: true,
        invitationStatus: true,
        person: { select: { name: true, email: true } },
      },
      orderBy: { confirmedAt: 'asc' },
      take: LOOKAHEAD,
    });
    return this.personSubjects(rows.map((row) => ({
      personId: row.personId,
      email: row.person.email,
      name: row.displayName?.trim() || row.person.name,
      invitationStatus: row.invitationStatus,
      submittedWithoutConflict: false,
    })), 'guest', participant, rows.length === LOOKAHEAD);
  }

  private async reviewerSubjects(event: EventScope, participant: { registrationEmail: string | null } | null) {
    if (participant && !participant.registrationEmail) return { subjects: [], skipped: 0, truncated: false };
    const rows = await this.prisma.scientificReviewAssignment.findMany({
      where: {
        eventId: event.id,
        organizationId: event.organizationId,
        status: ScientificReviewAssignmentStatus.SUBMITTED,
        conflictStatus: { not: ScientificReviewConflictStatus.CONFLICT },
        reviewer: {
          eventId: event.id,
          organizationId: event.organizationId,
          status: ScientificPersonStatus.ACTIVE,
          ...(participant?.registrationEmail ? { email: { equals: participant.registrationEmail, mode: 'insensitive' } } : {}),
        },
      },
      select: { reviewerPersonId: true, reviewer: { select: { name: true, email: true } } },
      distinct: ['reviewerPersonId'],
      take: LOOKAHEAD,
    });
    return this.personSubjects(rows.map((row) => ({
      personId: row.reviewerPersonId,
      email: row.reviewer.email,
      name: row.reviewer.name,
      invitationStatus: '',
      submittedWithoutConflict: true,
    })), 'reviewer', participant, rows.length === LOOKAHEAD);
  }

  private personSubjects(
    rows: Array<{ personId: string; email: string | null; name: string; invitationStatus: string; submittedWithoutConflict: boolean }>,
    role: 'guest' | 'reviewer',
    participant: { registrationEmail: string | null } | null,
    truncated: boolean,
  ) {
    const seen = new Set<string>();
    const subjects: Subject[] = [];
    let skipped = 0;
    for (const row of rows) {
      if (seen.has(row.personId)) continue;
      const allowed = role === 'guest'
        ? canIssueGuestCertificate({ releaseOpen: true, invitationStatus: row.invitationStatus })
        : canIssueReviewerCertificate({ releaseOpen: true, submittedWithoutConflict: row.submittedWithoutConflict });
      if (!allowed) continue;
      if (participant) {
        const person = row.email?.trim().toLowerCase() ?? '';
        if (!participant.registrationEmail || person !== participant.registrationEmail) continue;
      }
      seen.add(row.personId);
      try {
        subjects.push({
          reservationId: null,
          personId: row.personId,
          activityId: null,
          submissionId: null,
          displayName: sanitizeCertificateName(row.name),
          subjectLabel: ROLE_CERTIFICATE_LABEL[role],
          paperRole: ROLE_CERTIFICATE_LABEL[role],
        });
      } catch (error) {
        if (error instanceof CertificateRolePolicyError) skipped += 1;
        else throw error;
      }
    }
    return { subjects, skipped, truncated };
  }

  private async issueMany(event: EventScope, role: CertificateRole, subjects: Subject[], actorUserId: string | null) {
    const setting = await this.prisma.eventCertificateRoleSetting.findFirst({
      where: { eventId: event.id, organizationId: event.organizationId, role },
      select: { hours: true },
    });
    let created = 0;
    let alreadyIssued = 0;
    let pending = 0;
    for (const subject of subjects) {
      const existing = await this.findIssued(event, role, subject);
      if (existing) {
        alreadyIssued += 1;
        continue;
      }
      if (created >= ROLE_CERTIFICATE_BATCH_MAX) {
        pending += 1;
        continue;
      }
      const result = await this.issueOne(event, role, subject, actorUserId, setting?.hours ?? null);
      if (result.created) created += 1;
      else alreadyIssued += 1;
    }
    return { role, created, alreadyIssued, pending };
  }

  private async issueOne(event: EventScope, role: CertificateRole, subject: Subject, actorUserId: string | null, hours?: number | null) {
    const resolvedHours = hours === undefined
      ? (await this.prisma.eventCertificateRoleSetting.findFirst({
        where: { eventId: event.id, organizationId: event.organizationId, role },
        select: { hours: true },
      }))?.hours ?? null
      : hours;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.eventRoleCertificate.findFirst({
          where: this.subjectWhere(event, role, subject),
          select: { code: true, hours: true, issuedAt: true, subjectLabel: true },
        });
        if (existing) return { created: false, row: existing };
        const created = await tx.eventRoleCertificate.create({
          data: {
            organizationId: event.organizationId,
            eventId: event.id,
            role,
            reservationId: subject.reservationId,
            personId: subject.personId,
            activityId: subject.activityId,
            submissionId: subject.submissionId,
            code: randomBytes(16).toString('hex'),
            displayName: subject.displayName,
            subjectLabel: subject.subjectLabel,
            paperRole: subject.paperRole,
            hours: resolvedHours,
            issuedByUserId: actorUserId,
          },
          select: { id: true, code: true, hours: true, issuedAt: true, subjectLabel: true },
        });
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId,
            eventId: event.id,
            actorUserId,
            action: 'certificate.role_issued',
            entityType: 'EventRoleCertificate',
            entityId: created.id,
            metadata: { role, feeCents: certificateRoleFeeCents() },
          },
        });
        return { created: true, row: created };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.findIssued(event, role, subject);
        if (existing) return { created: false, row: existing };
      }
      throw error;
    }
  }

  private async findIssued(event: EventScope, role: CertificateRole, subject: Subject): Promise<StoredCertificate | null> {
    return this.prisma.eventRoleCertificate.findFirst({
      where: this.subjectWhere(event, role, subject),
      select: { code: true, hours: true, issuedAt: true, subjectLabel: true },
    });
  }

  private subjectWhere(event: EventScope, role: CertificateRole, subject: Subject) {
    return {
      eventId: event.id,
      organizationId: event.organizationId,
      role,
      reservationId: subject.reservationId,
      personId: subject.personId,
      activityId: subject.activityId,
      submissionId: subject.submissionId,
    };
  }

  private async releaseOpen(event: EventScope, role: CertificateRole, now: Date) {
    const setting = await this.prisma.eventCertificateRoleSetting.findFirst({
      where: { eventId: event.id, organizationId: event.organizationId, role },
      select: { enabled: true, releaseMode: true, releaseDays: true },
    });
    return canReleaseRole({
      enabled: setting?.enabled === true,
      releaseMode: setting?.releaseMode === 'after_end' ? 'after_end' : 'manual',
      releaseDays: setting?.releaseDays ?? 0,
      eventEndDate: event.endDate,
      now,
    });
  }

  private async eventFor(userId: string, eventId: string, roles: readonly MembershipRole[]): Promise<EventScope> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true, endDate: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, roles);
    return { id: event.id, organizationId: event.organizationId, endDate: event.endDate };
  }

  private roleOrReject(value: string): CertificateRole {
    return this.policyOrReject(() => parseCertificateRole(value));
  }

  private storedRole(value: string): CertificateRole | null {
    try { return parseCertificateRole(value); }
    catch { return null; }
  }

  private codeOrReject(value: string): string {
    try { return normalizeCertificateCode(value); }
    catch (error) {
      if (error instanceof PresenceCertificatePolicyError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private policyOrReject<T>(read: () => T): T {
    try { return read(); }
    catch (error) {
      if (error instanceof CertificateRolePolicyError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
