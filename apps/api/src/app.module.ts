import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import {
  EmailVerificationDispatchService,
  EmailVerificationOperationalDiagnostics,
  PrismaEmailVerificationDispatchAudit,
} from './auth/email-verification-dispatch.service';
import { PrismaEmailVerificationStore } from './auth/email-verification-prisma.store';
import { EmailVerificationService } from './auth/email-verification.service';
import {
  HttpEmailVerificationDelivery,
  HttpPasswordRecoveryDelivery,
} from './auth/password-recovery-http.delivery';
import { PrismaPasswordRecoveryRequestStore } from './auth/password-recovery-prisma.store';
import { PrismaPasswordResetStore } from './auth/password-reset-prisma.store';
import {
  PasswordRecoveryOperationalDiagnostics,
  PrismaPasswordRecoveryAudit,
} from './auth/password-recovery-observability';
import { PrismaPasswordRecoveryRateLimiter } from './auth/password-recovery-rate-limiter';
import { AuthorizationService } from './authorization.service';
import { EventsController } from './events.controller';
import { EventMutationPolicy } from './event-mutation-policy.service';
import { EventPublicationPreviewService } from './event-publication/event-publication-preview.service';
import { EventPublicationPublicController } from './event-publication/event-publication-public.controller';
import { EventPublicationPublicService } from './event-publication/event-publication-public.service';
import { EventPublicationController } from './event-publication/event-publication.controller';
import { EventPublicationRepository } from './event-publication/event-publication.repository';
import { EventPublicationSectionsService } from './event-publication/event-publication-sections.service';
import { EventPublicationService } from './event-publication/event-publication.service';
import { EventWizardController } from './event-wizard.controller';
import { EventWizardService } from './event-wizard.service';
import { EventsService } from './events.service';
import { HealthController } from './health.controller';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from './prisma.service';
import { RequestContextMiddleware } from './request-context.middleware';
import { ScientificEventCentralController } from './scientific-event-central.controller';
import { ScientificEventCentralService } from './scientific-event-central.service';
import { ScientificGuestsController, ScientificInvitationController } from './scientific-guests.controller';
import { ScientificGuestsService } from './scientific-guests.service';
import { ScientificProgramController } from './scientific-program.controller';
import { ScientificProgramService } from './scientific-program.service';
import { ScientificReviewsController } from './scientific-reviews.controller';
import { ScientificReviewsService } from './scientific-reviews.service';
import { ScientificStructureController } from './scientific-structure.controller';
import { ScientificStructureService } from './scientific-structure.service';
import { ScientificSubmissionsController } from './scientific-submissions.controller';
import { ScientificSubmissionsService } from './scientific-submissions.service';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [
    HealthController,
    AuthController,
    OrganizationsController,
    EventsController,
    EventWizardController,
    EventPublicationController,
    EventPublicationPublicController,
    ScientificEventCentralController,
    ScientificStructureController,
    ScientificGuestsController,
    ScientificInvitationController,
    ScientificProgramController,
    ScientificSubmissionsController,
    ScientificReviewsController,
  ],
  providers: [
    PrismaService,
    PrismaEmailVerificationStore,
    HttpEmailVerificationDelivery,
    HttpPasswordRecoveryDelivery,
    PrismaEmailVerificationDispatchAudit,
    EmailVerificationOperationalDiagnostics,
    {
      provide: EmailVerificationDispatchService,
      inject: [
        PrismaEmailVerificationStore,
        HttpEmailVerificationDelivery,
        PrismaEmailVerificationDispatchAudit,
        EmailVerificationOperationalDiagnostics,
      ],
      useFactory: (
        store: PrismaEmailVerificationStore,
        delivery: HttpEmailVerificationDelivery,
        audit: PrismaEmailVerificationDispatchAudit,
        diagnostics: EmailVerificationOperationalDiagnostics,
      ) => new EmailVerificationDispatchService({
        verification: new EmailVerificationService({ store }),
        delivery,
        audit,
        diagnostics,
      }),
    },
    PrismaPasswordRecoveryRequestStore,
    PrismaPasswordResetStore,
    PrismaPasswordRecoveryAudit,
    PasswordRecoveryOperationalDiagnostics,
    PrismaPasswordRecoveryRateLimiter,
    AuthService,
    AuthGuard,
    AuthorizationService,
    OrganizationsService,
    EventsService,
    EventMutationPolicy,
    EventWizardService,
    EventPublicationRepository,
    EventPublicationService,
    EventPublicationPreviewService,
    EventPublicationSectionsService,
    EventPublicationPublicService,
    ScientificEventCentralService,
    ScientificStructureService,
    ScientificGuestsService,
    ScientificProgramService,
    ScientificSubmissionsService,
    ScientificReviewsService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
