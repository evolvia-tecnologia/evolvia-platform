import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  MembershipRole,
  Prisma,
  ScientificInvitationStatus,
  ScientificPersonStatus,
  ScientificReviewAssignmentStatus,
  ScientificReviewConflictStatus,
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
import { certificatePdf, CertificateTextUnsupportedError } from './presence-certificate-pdf';

const STAFF_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.OPERATOR];
const EDITOR_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER];
const CLOSED = 'Este papel de certificado ainda não está liberado.';
const STALE = 'A liberação deste papel foi alterada. Recarregue antes de salvar.';
const PAGE = 80;
const MAX_PAGES = 40;

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
type SubjectParticipant = { reservationId: string; registrationEmail: string | null; status: string };

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
      select: { enabled: true, releaseMode: true, releaseDays: true, hours: true },
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
    const result = await this.issueMany(event, role, subjects, userId, setting.hours);
    return { ...result, pending: truncated ? 1 : 0, skipped, truncated, feeCents: certificateRoleFeeCents() };
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

  async publicPdf(rawCode: string) {
    const view = await this.publicView(rawCode);
    try {
      return {
        bytes: certificatePdf([{
          title: view.title, body: view.body, displayName: view.displayName,
          eventName: view.eventName, hours: view.hours, issuedAt: view.issuedAt,
          code: this.codeOrReject(rawCode),
        }]),
        feeCents: certificateRoleFeeCents(),
      };
    } catch (error) {
      if (error instanceof CertificateTextUnsupportedError) {
        throw new UnprocessableEntityException(`O PDF ainda não desenha estes caracteres: ${error.characters.join(' ')}. Nada foi trocado no certificado. A página deste certificado mostra o texto completo e pode ser impressa.`);
      }
      throw error;
    }
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
    const now = new Date();
    const [settings, issued] = await Promise.all([
      this.prisma.eventCertificateRoleSetting.findMany({
        where: { eventId: event.id, organizationId: event.organizationId, role: { in: [...CERTIFICATE_ROLES] } },
      }),
      this.participantIssued(event, scope.reservationId, email),
    ]);
    const settingsByRole = new Map(settings.map((row) => [row.role, row]));
    const copies = [];
    for (const row of issued) {
      const role = this.storedRole(row.role);
      if (!role) continue;
      copies.push(this.copy(role, row.subjectLabel, row));
    }
    const pending: Array<{ role: CertificateRole; subject: Subject; hours: number | null }> = [];
    for (const role of CERTIFICATE_ROLES) {
      const setting = settingsByRole.get(role);
      const open = canReleaseRole({
        enabled: setting?.enabled === true,
        releaseMode: setting?.releaseMode === 'after_end' ? 'after_end' : 'manual',
        releaseDays: setting?.releaseDays ?? 0,
        eventEndDate: event.endDate,
        now,
      });
      if (!open || pending.length >= ROLE_CERTIFICATE_BATCH_MAX) continue;
      const { subjects } = await this.subjects(event, role, { reservationId: scope.reservationId, registrationEmail: email, status: scope.status });
      for (const subject of subjects) {
        if (pending.length >= ROLE_CERTIFICATE_BATCH_MAX) break;
        if (issued.some((row) => row.role === role && this.sameSubject(row, subject))) continue;
        pending.push({ role, subject, hours: setting?.hours ?? null });
      }
    }
    if (!issue) {
      for (const item of pending) copies.push(this.copy(item.role, item.subject.subjectLabel, null));
      return { feeCents: certificateRoleFeeCents(), certificates: copies };
    }
    const created = await this.issueBatch(event, pending, null, { reservationId: scope.reservationId, registrationEmail: email, status: scope.status });
    for (const item of created) copies.push(this.copy(item.role, item.row.subjectLabel, item.row));
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

  private async subjects(event: EventScope, role: CertificateRole, participant: SubjectParticipant | null, db: Prisma.TransactionClient = this.prisma) {
    if (role === 'activity') return this.activitySubjects(event, participant, db);
    if (role === 'guest') return this.guestSubjects(event, participant, db);
    if (role === 'reviewer') return this.reviewerSubjects(event, participant, db);
    return this.workSubjects(event, role, participant, db);
  }

  private async activitySubjects(event: EventScope, participant: { reservationId: string } | null, db: Prisma.TransactionClient = this.prisma) {
    const subjects: Subject[] = [];
    let skipped = 0;
    let cursor: string | null = null;
    let truncated = false;
    for (let page = 0; page < MAX_PAGES && subjects.length <= ROLE_CERTIFICATE_BATCH_MAX; page += 1) {
      const rows = await this.activityPage(event, participant?.reservationId ?? null, cursor, db);
      if (!rows.length) break;
      for (const row of rows) {
        cursor = row.id;
        if (!canIssueActivityCertificate({ releaseOpen: true, status: row.status, hasAccess: true })) continue;
        try {
          subjects.push({
            reservationId: row.reservationId,
            personId: null,
            activityId: row.activityId,
            submissionId: null,
            displayName: certificateDisplayName(row.registrationData),
            subjectLabel: sanitizeSubjectLabel(row.title, 'Atividade'),
            paperRole: null,
          });
        } catch (error) {
          if (error instanceof PresenceCertificatePolicyError || error instanceof CertificateRolePolicyError) skipped += 1;
          else throw error;
        }
        if (subjects.length > ROLE_CERTIFICATE_BATCH_MAX) break;
      }
      if (subjects.length > ROLE_CERTIFICATE_BATCH_MAX) {
        truncated = true;
        break;
      }
      if (rows.length < PAGE) break;
      if (page === MAX_PAGES - 1) truncated = true;
    }
    return { subjects: subjects.slice(0, ROLE_CERTIFICATE_BATCH_MAX), skipped, truncated };
  }

  private activityPage(event: EventScope, reservationId: string | null, cursor: string | null, db: Prisma.TransactionClient = this.prisma) {
    const reservationSql = reservationId ? Prisma.sql`AND a."reservationId" = ${reservationId}` : Prisma.empty;
    const cursorSql = cursor ? Prisma.sql`AND a."id" > ${cursor}` : Prisma.empty;
    return db.$queryRaw<Array<{ id: string; reservationId: string; activityId: string; title: string; status: string; registrationData: unknown }>>(Prisma.sql`
      SELECT a."id", a."reservationId", a."activityId", act."title", r."status"::text AS status, r."registrationData"
      FROM "EventActivityAccess" a
      INNER JOIN "EventRegistrationReservation" r
        ON r."id" = a."reservationId" AND r."eventId" = a."eventId" AND r."organizationId" = a."organizationId"
      INNER JOIN "ScientificProgramActivity" act
        ON act."id" = a."activityId" AND act."eventId" = a."eventId" AND act."organizationId" = a."organizationId"
      WHERE a."eventId" = ${event.id}
        AND a."organizationId" = ${event.organizationId}
        AND r."status"::text = 'CONFIRMED'
        AND NOT EXISTS (
          SELECT 1 FROM "EventRoleCertificate" c
          WHERE c."eventId" = a."eventId"
            AND c."organizationId" = a."organizationId"
            AND c."role" = 'activity'
            AND c."reservationId" = a."reservationId"
            AND c."activityId" = a."activityId"
        )
        ${reservationSql}
        ${cursorSql}
      ORDER BY a."id" ASC
      LIMIT ${PAGE}
    `);
  }

  private async workSubjects(event: EventScope, role: 'approved_submission' | 'presentation', participant: { reservationId: string; registrationEmail: string | null } | null, db: Prisma.TransactionClient = this.prisma) {
    const subjects: Subject[] = [];
    let skipped = 0;
    let cursor: string | null = null;
    let truncated = false;
    for (let page = 0; page < MAX_PAGES && subjects.length <= ROLE_CERTIFICATE_BATCH_MAX; page += 1) {
      const rows = await this.workPage(event, role, participant, cursor, db);
      if (!rows.length) break;
      for (const row of rows) {
        cursor = row.id;
        const allowed = role === 'presentation'
          ? canIssuePresentationCertificate({ releaseOpen: true, status: row.status, isPresenter: row.isPresenter })
          : canIssueApprovedWorkCertificate({ releaseOpen: true, status: row.status, isAuthor: true });
        if (!allowed) continue;
        if (participant && !participantOwnsScientificPerson({
          personEmail: row.personEmail,
          registrationEmail: participant.registrationEmail,
          authorCount: Number(row.authorCount),
          ownerReservationId: row.ownerReservationId,
          reservationId: participant.reservationId,
        })) continue;
        try {
          subjects.push({
            reservationId: null,
            personId: row.personId,
            activityId: null,
            submissionId: row.submissionId,
            displayName: sanitizeCertificateName(row.scientificName?.trim() || row.nameSnapshot || row.personName),
            subjectLabel: sanitizeSubjectLabel(row.title, 'Trabalho'),
            paperRole: role === 'presentation' ? 'Apresentador' : workPaperRole(row.sortOrder - row.firstAuthorOrder),
          });
        } catch (error) {
          if (error instanceof CertificateRolePolicyError) skipped += 1;
          else throw error;
        }
        if (subjects.length > ROLE_CERTIFICATE_BATCH_MAX) break;
      }
      if (subjects.length > ROLE_CERTIFICATE_BATCH_MAX) {
        truncated = true;
        break;
      }
      if (rows.length < PAGE) break;
      if (page === MAX_PAGES - 1) truncated = true;
    }
    return { subjects: subjects.slice(0, ROLE_CERTIFICATE_BATCH_MAX), skipped, truncated };
  }

  private workPage(event: EventScope, role: 'approved_submission' | 'presentation', participant: { reservationId: string; registrationEmail: string | null } | null, cursor: string | null, db: Prisma.TransactionClient = this.prisma) {
    const presenterSql = role === 'presentation' ? Prisma.sql`AND author."isPresenter" = true` : Prisma.empty;
    const cursorSql = cursor ? Prisma.sql`AND author."id" > ${cursor}` : Prisma.empty;
    const ownerSql = participant
      ? Prisma.sql`AND (
          (${participant.registrationEmail}::text IS NOT NULL AND lower(person."email") = ${participant.registrationEmail})
          OR (
            submission."ownerReservationId" = ${participant.reservationId}
            AND (SELECT COUNT(*) FROM "ScientificSubmissionAuthor" sibling WHERE sibling."submissionId" = submission."id" AND sibling."eventId" = submission."eventId") = 1
          )
        )`
      : Prisma.empty;
    return db.$queryRaw<Array<{
      id: string;
      personId: string;
      sortOrder: number;
      firstAuthorOrder: number;
      isPresenter: boolean;
      scientificName: string | null;
      personName: string;
      nameSnapshot: string | null;
      personEmail: string | null;
      submissionId: string;
      title: string;
      status: string;
      ownerReservationId: string | null;
      authorCount: number;
    }>>(Prisma.sql`
      SELECT author."id", author."personId", author."sortOrder", author."isPresenter", author."scientificName",
        author."nameSnapshot", person."name" AS "personName", person."email" AS "personEmail",
        submission."id" AS "submissionId", submission."title", submission."status"::text AS status,
        submission."ownerReservationId",
        (SELECT COUNT(*)::int FROM "ScientificSubmissionAuthor" sibling WHERE sibling."submissionId" = submission."id" AND sibling."eventId" = submission."eventId") AS "authorCount",
        (SELECT MIN(sibling."sortOrder") FROM "ScientificSubmissionAuthor" sibling WHERE sibling."submissionId" = submission."id" AND sibling."eventId" = submission."eventId" AND sibling."organizationId" = submission."organizationId") AS "firstAuthorOrder"
      FROM "ScientificSubmissionAuthor" author
      INNER JOIN "ScientificPerson" person
        ON person."id" = author."personId" AND person."eventId" = author."eventId" AND person."organizationId" = author."organizationId"
      INNER JOIN "ScientificSubmission" submission
        ON submission."id" = author."submissionId" AND submission."eventId" = author."eventId" AND submission."organizationId" = author."organizationId"
      WHERE author."eventId" = ${event.id}
        AND author."organizationId" = ${event.organizationId}
        AND person."status"::text = 'ACTIVE'
        AND submission."status"::text IN ('ACCEPTED', 'ACCEPTED_WITH_CHANGES')
        AND NOT EXISTS (
          SELECT 1 FROM "EventRoleCertificate" c
          WHERE c."eventId" = author."eventId"
            AND c."organizationId" = author."organizationId"
            AND c."role" = ${role}
            AND c."personId" = author."personId"
            AND c."submissionId" = author."submissionId"
        )
        ${presenterSql}
        ${ownerSql}
        ${cursorSql}
      ORDER BY author."id" ASC
      LIMIT ${PAGE}
    `);
  }

  private async guestSubjects(event: EventScope, participant: { registrationEmail: string | null } | null, db: Prisma.TransactionClient = this.prisma) {
    if (participant && !participant.registrationEmail) return { subjects: [], skipped: 0, truncated: false };
    const rows = await db.scientificGuestProfile.findMany({
      where: {
        eventId: event.id,
        organizationId: event.organizationId,
        invitationStatus: ScientificInvitationStatus.CONFIRMED,
        person: {
          eventId: event.id,
          organizationId: event.organizationId,
          status: ScientificPersonStatus.ACTIVE,
          roleCertificates: { none: { role: 'guest', eventId: event.id, organizationId: event.organizationId } },
          ...(participant?.registrationEmail ? { email: { equals: participant.registrationEmail, mode: 'insensitive' } } : {}),
        },
      },
      select: {
        personId: true,
        displayName: true,
        invitationStatus: true,
        person: { select: { name: true, email: true } },
      },
      orderBy: { id: 'asc' },
      take: ROLE_CERTIFICATE_BATCH_MAX + 1,
    });
    return this.personSubjects(rows.map((row) => ({
      personId: row.personId,
      email: row.person.email,
      name: row.displayName?.trim() || row.person.name,
      invitationStatus: row.invitationStatus,
      submittedWithoutConflict: false,
    })), 'guest', participant, rows.length > ROLE_CERTIFICATE_BATCH_MAX);
  }

  private async reviewerSubjects(event: EventScope, participant: { registrationEmail: string | null } | null, db: Prisma.TransactionClient = this.prisma) {
    if (participant && !participant.registrationEmail) return { subjects: [], skipped: 0, truncated: false };
    const rows = await db.scientificReviewAssignment.findMany({
      where: {
        eventId: event.id,
        organizationId: event.organizationId,
        status: ScientificReviewAssignmentStatus.SUBMITTED,
        conflictStatus: { not: ScientificReviewConflictStatus.CONFLICT },
        reviewer: {
          eventId: event.id,
          organizationId: event.organizationId,
          status: ScientificPersonStatus.ACTIVE,
          roleCertificates: { none: { role: 'reviewer', eventId: event.id, organizationId: event.organizationId } },
          ...(participant?.registrationEmail ? { email: { equals: participant.registrationEmail, mode: 'insensitive' } } : {}),
        },
      },
      select: { reviewerPersonId: true, reviewer: { select: { name: true, email: true } } },
      distinct: ['reviewerPersonId'],
      orderBy: { reviewerPersonId: 'asc' },
      take: ROLE_CERTIFICATE_BATCH_MAX + 1,
    });
    return this.personSubjects(rows.map((row) => ({
      personId: row.reviewerPersonId,
      email: row.reviewer.email,
      name: row.reviewer.name,
      invitationStatus: '',
      submittedWithoutConflict: true,
    })), 'reviewer', participant, rows.length > ROLE_CERTIFICATE_BATCH_MAX);
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
    return {
      subjects: subjects.slice(0, ROLE_CERTIFICATE_BATCH_MAX),
      skipped,
      truncated: truncated || subjects.length > ROLE_CERTIFICATE_BATCH_MAX,
    };
  }

  private async participantIssued(event: EventScope, reservationId: string, email: string | null) {
    const personIds = new Set<string>();
    if (email) {
      const people = await this.prisma.scientificPerson.findMany({
        where: {
          eventId: event.id,
          organizationId: event.organizationId,
          status: ScientificPersonStatus.ACTIVE,
          email: { equals: email, mode: 'insensitive' },
        },
        select: { id: true, email: true },
      });
      const matched = people.filter((person) => person.email?.trim().toLowerCase() === email);
      if (matched.length === 1) personIds.add(matched[0].id);
    }
    const owned = await this.prisma.scientificSubmission.findMany({
      where: { eventId: event.id, organizationId: event.organizationId, ownerReservationId: reservationId },
      select: { authors: { select: { personId: true } } },
    });
    for (const submission of owned) {
      if (submission.authors.length === 1) personIds.add(submission.authors[0].personId);
    }
    return this.prisma.eventRoleCertificate.findMany({
      where: {
        eventId: event.id,
        organizationId: event.organizationId,
        OR: [
          { role: 'activity', reservationId },
          ...(personIds.size
            ? [{ personId: { in: [...personIds] }, role: { in: ['approved_submission', 'presentation', 'guest', 'reviewer'] } }]
            : []),
        ],
      },
      select: {
        role: true,
        code: true,
        hours: true,
        issuedAt: true,
        subjectLabel: true,
        reservationId: true,
        personId: true,
        activityId: true,
        submissionId: true,
      },
      orderBy: { issuedAt: 'asc' },
      take: 200,
    });
  }

  private sameSubject(row: { reservationId: string | null; personId: string | null; activityId: string | null; submissionId: string | null }, subject: Subject) {
    return row.reservationId === subject.reservationId
      && row.personId === subject.personId
      && row.activityId === subject.activityId
      && row.submissionId === subject.submissionId;
  }

  private async issueMany(event: EventScope, role: CertificateRole, subjects: Subject[], actorUserId: string | null, hours: number | null) {
    const created = await this.issueBatch(event, subjects.map((subject) => ({ role, subject, hours })), actorUserId);
    return { role, created: created.length, alreadyIssued: subjects.length - created.length, pending: 0 };
  }

  private async issueBatch(event: EventScope, items: Array<{ role: CertificateRole; subject: Subject; hours: number | null }>, actorUserId: string | null, participant: SubjectParticipant | null = null) {
    if (!items.length) return [];
    try {
      return await this.prisma.$transaction(async (tx) => {
        const freshEvent = await tx.event.findUnique({
          where: { id: event.id, organizationId: event.organizationId },
          select: { id: true, organizationId: true, endDate: true },
        });
        if (!freshEvent?.organizationId || freshEvent.organizationId !== event.organizationId) throw new NotFoundException('Evento não encontrado.');
        const freshEventScope: EventScope = { id: freshEvent.id, organizationId: freshEvent.organizationId, endDate: freshEvent.endDate };
        let freshParticipant = participant;
        if (participant) {
          const reservation = await tx.eventRegistrationReservation.findFirst({
            where: { id: participant.reservationId, eventId: event.id, organizationId: event.organizationId, status: 'CONFIRMED' },
            select: { status: true, registrationData: true },
          });
          if (!reservation) throw new ForbiddenException('A inscrição confirmada não está disponível para esta emissão.');
          freshParticipant = { reservationId: participant.reservationId, status: reservation.status, registrationEmail: registrationEmail(reservation.registrationData) };
        }
        const freshByRole = new Map<CertificateRole, { subjects: Subject[]; hours: number | null }>();
        for (const role of new Set(items.map((item) => item.role))) {
          const setting = await tx.eventCertificateRoleSetting.findFirst({
            where: { eventId: event.id, organizationId: event.organizationId, role },
            select: { enabled: true, releaseMode: true, releaseDays: true, hours: true },
          });
          if (!canReleaseRole({ enabled: setting?.enabled === true, releaseMode: setting?.releaseMode === 'after_end' ? 'after_end' : 'manual', releaseDays: setting?.releaseDays ?? 0, eventEndDate: freshEvent.endDate, now: new Date() })) throw new ForbiddenException(CLOSED);
          const eligible = await this.subjects(freshEventScope, role, freshParticipant, tx);
          freshByRole.set(role, { subjects: eligible.subjects, hours: setting?.hours ?? null });
        }
        const created: Array<{ role: CertificateRole; row: StoredCertificate }> = [];
        for (const item of items) {
          const existing = await tx.eventRoleCertificate.findFirst({
            where: this.subjectWhere(event, item.role, item.subject),
            select: { code: true, hours: true, issuedAt: true, subjectLabel: true },
          });
          if (existing) continue;
          const eligible = freshByRole.get(item.role);
          const subject = eligible?.subjects.find((current) => this.sameSubject(current, item.subject));
          if (!subject) throw new ConflictException('A elegibilidade foi alterada. Atualize a lista antes de emitir novamente.');
          const row = await tx.eventRoleCertificate.create({
            data: {
              organizationId: event.organizationId,
              eventId: event.id,
              role: item.role,
              reservationId: subject.reservationId,
              personId: subject.personId,
              activityId: subject.activityId,
              submissionId: subject.submissionId,
              code: randomBytes(16).toString('hex'),
              displayName: subject.displayName,
              subjectLabel: subject.subjectLabel,
              paperRole: subject.paperRole,
              hours: eligible?.hours ?? null,
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
              entityId: row.id,
              metadata: { role: item.role, feeCents: certificateRoleFeeCents() },
            },
          });
          created.push({ role: item.role, row });
        }
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('A elegibilidade foi alterada durante a emissão. Atualize a lista antes de tentar novamente.');
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A emissão encontrou um certificado criado ao mesmo tempo. Chame de novo.');
      }
      throw error;
    }
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


