import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { CheckInController } from './check-in.controller';
import { CheckInService } from './check-in.service';
import { AuthorizationService } from './authorization.service';
import { EventsController } from './events.controller';
import { EventFinancialResponsibilityController } from './event-financial-responsibility.controller';
import { EventFinancialResponsibilityService } from './event-financial-responsibility.service';
import { EventMutationPolicy } from './event-mutation-policy.service';
import { EventPublicationPreviewService } from './event-publication/event-publication-preview.service';
import { EventPublicationMediaService } from './event-publication/event-publication-media.service';
import { EventPublicationMediaStorage, LocalEventPublicationMediaStorage } from './event-publication/event-publication-media.storage';
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
import { RegistrationFormsController } from './registration-forms.controller';
import { RegistrationFormsService } from './registration-forms.service';
import { RegistrationCommercialController } from './registration-commercial.controller';
import { RegistrationCommercialService } from './registration-commercial.service';
import { RegistrationBenefitsController } from './registration-benefits.controller';
import { RegistrationBenefitsService } from './registration-benefits.service';
import { RegistrationReservationsController } from './registration-reservations.controller';
import { RegistrationReservationsService } from './registration-reservations.service';
import { RegistrationOperationsController } from './registration-operations.controller';
import { RegistrationOperationsService } from './registration-operations.service';
import { AsaasCheckoutGateway } from './asaas-checkout.gateway';
import { PublicAsaasCheckoutController, AsaasCheckoutWebhookController } from './asaas-checkout.controller';
import { AsaasCheckoutService } from './asaas-checkout.service';
import { ParticipantDashboardController } from './participant-dashboard.controller';
import { ParticipantDashboardService } from './participant-dashboard.service';
import { ParticipantAreaController } from './participant-area.controller';
import { ParticipantAreaService } from './participant-area.service';
import { ScientificAuthorController } from './scientific-author.controller';
import { ScientificAuthorService } from './scientific-author.service';
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
    EventFinancialResponsibilityController,
    EventWizardController,
    EventPublicationController,
    EventPublicationPublicController,
    RegistrationFormsController,
    RegistrationCommercialController,
    RegistrationBenefitsController,
    RegistrationReservationsController,
    RegistrationOperationsController,
    PublicAsaasCheckoutController,
    AsaasCheckoutWebhookController,
    ParticipantAreaController,
    ParticipantDashboardController,
    CheckInController,
    ScientificAuthorController,
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
    AuthService,
    EmailVerificationService,
    AuthGuard,
    AuthorizationService,
    OrganizationsService,
    EventsService,
    EventFinancialResponsibilityService,
    EventMutationPolicy,
    EventWizardService,
    EventPublicationRepository,
    { provide: EventPublicationMediaStorage, useClass: LocalEventPublicationMediaStorage },
    EventPublicationMediaService,
    EventPublicationService,
    EventPublicationPreviewService,
    EventPublicationSectionsService,
    EventPublicationPublicService,
    RegistrationFormsService,
    RegistrationCommercialService,
    RegistrationBenefitsService,
    RegistrationReservationsService,
    RegistrationOperationsService,
    AsaasCheckoutGateway,
    AsaasCheckoutService,
    ParticipantAreaService,
    ParticipantDashboardService,
    CheckInService,
    ScientificAuthorService,
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
