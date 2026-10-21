import { Injectable, NotFoundException } from '@nestjs/common';
import {
  EventActivityEnrollmentStatus,
  ScientificProgramActivityStatus,
  ScientificReviewAssignmentStatus,
  RegistrationWaitlistStatus,
} from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import {
  assembleOperationalReadings,
  worksWithoutReview,
} from './operational-readings.policy';
import { PrismaService } from './prisma.service';

@Injectable()
export class OperationalReadingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async get(userId: string, eventId: string) {
    const event = await this.eventFor(userId, eventId);
    const scope = { eventId: event.id, organizationId: event.organizationId };
    const [
      dayPresence,
      presenceDayGroups,
      dayPresenceReversed,
      activityPresence,
      activityGroups,
      materialReversed,
      checkInReversed,
      waitlistWaiting,
      waitlistOffered,
      activityEnrollments,
      publishedActivities,
      reviewsSubmitted,
      reviewsOpen,
      submissions,
      reviewedGroups,
      certificatesIssued,
    ] = await Promise.all([
      this.prisma.eventDayPresence.count({ where: { ...scope, reversedAt: null } }),
      this.prisma.eventDayPresence.groupBy({ by: ['day'], where: { ...scope, reversedAt: null } }),
      this.prisma.eventDayPresence.count({ where: { ...scope, reversedAt: { not: null } } }),
      this.prisma.eventActivityAccess.count({ where: scope }),
      this.prisma.eventActivityAccess.groupBy({ by: ['activityId'], where: scope }),
      this.prisma.eventMaterialDelivery.count({ where: { ...scope, reversedAt: { not: null } } }),
      this.prisma.eventRegistrationCheckIn.count({ where: { ...scope, reversedAt: { not: null } } }),
      this.prisma.eventRegistrationWaitlistEntry.count({ where: { ...scope, status: RegistrationWaitlistStatus.WAITING } }),
      this.prisma.eventRegistrationWaitlistEntry.count({ where: { ...scope, status: RegistrationWaitlistStatus.OFFERED } }),
      this.prisma.eventActivityEnrollment.count({ where: { ...scope, status: EventActivityEnrollmentStatus.ENROLLED } }),
      this.prisma.scientificProgramActivity.count({ where: { ...scope, status: ScientificProgramActivityStatus.PUBLISHED } }),
      this.prisma.scientificReviewAssignment.count({ where: { ...scope, status: ScientificReviewAssignmentStatus.SUBMITTED } }),
      this.prisma.scientificReviewAssignment.count({
        where: { ...scope, status: { in: [ScientificReviewAssignmentStatus.ASSIGNED, ScientificReviewAssignmentStatus.IN_PROGRESS] } },
      }),
      this.prisma.scientificSubmission.count({ where: scope }),
      this.prisma.scientificReviewAssignment.groupBy({
        by: ['submissionId'],
        where: { ...scope, status: ScientificReviewAssignmentStatus.SUBMITTED },
      }),
      this.prisma.eventCertificate.count({ where: scope }),
    ]);
    return {
      readings: assembleOperationalReadings({
        dayPresence,
        presenceDays: presenceDayGroups.length,
        dayPresenceReversed,
        activityPresence,
        activitiesWithPresence: activityGroups.length,
        materialReversed,
        checkInReversed,
        waitlistWaiting,
        waitlistOffered,
        activityEnrollments,
        publishedActivities,
        reviewsSubmitted,
        reviewsOpen,
        worksWithoutReview: worksWithoutReview(submissions, reviewedGroups.length),
        certificatesIssued,
      }),
    };
  }

  private async eventFor(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    return { id: event.id, organizationId: event.organizationId };
  }
}
