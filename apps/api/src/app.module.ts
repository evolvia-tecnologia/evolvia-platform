import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JWT_SIGN_OPTIONS, jwtSecret } from './access-shield';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { CheckInController } from './check-in.controller';
import { CheckInService } from './check-in.service';
import { EventDeskController } from './event-desk.controller';
import { EventDeskService } from './event-desk.service';
import { SelfCheckInController } from './self-check-in.controller';
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
import { EventIntegrationsController, EventIntegrationsService } from './event-integrations.controller';
import { IntegrationFoundationController, IntegrationFoundationPublicController } from './integration-foundation.controller';
import { IntegrationFoundationService } from './integration-foundation.service';
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
import { RegistrationTermsDocumentService } from './registration-terms-document.service';
import { LocalRegistrationTermsDocumentStorage, RegistrationTermsDocumentStorage } from './registration-terms-document.storage';
import { RegistrationCommercialController } from './registration-commercial.controller';
import { RegistrationCommercialService } from './registration-commercial.service';
import { RegistrationBenefitsController } from './registration-benefits.controller';
import { RegistrationBenefitsService } from './registration-benefits.service';
import { RegistrationReservationsController } from './registration-reservations.controller';
import { RegistrationReservationsService } from './registration-reservations.service';
import { RegistrationCategoryProofService } from './registration-category-proof.service';
import { LocalRegistrationCategoryProofStorage, RegistrationCategoryProofStorage } from './registration-category-proof.storage';
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
      secret: jwtSecret(),
      signOptions: JWT_SIGN_OPTIONS,
    }),
  ],
  controllers: [
    HealthController,
    AuthController,
    OrganizationsController,
    EventsController,
    EventFinancialResponsibilityController,
    EventWizardController,
    EventIntegrationsController,
    IntegrationFoundationController,
    IntegrationFoundationPublicController,
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
    SelfCheckInController,
    EventDeskController,
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
    EventIntegrationsService,
    IntegrationFoundationService,
    EventPublicationRepository,
    { provide: EventPublicationMediaStorage, useClass: LocalEventPublicationMediaStorage },
    EventPublicationMediaService,
    EventPublicationService,
    EventPublicationPreviewService,
    EventPublicationSectionsService,
    EventPublicationPublicService,
    RegistrationFormsService,
    RegistrationTermsDocumentService,
    { provide: RegistrationTermsDocumentStorage, useClass: LocalRegistrationTermsDocumentStorage },
    RegistrationCommercialService,
    RegistrationBenefitsService,
    RegistrationReservationsService,
    RegistrationCategoryProofService,
    { provide: RegistrationCategoryProofStorage, useClass: LocalRegistrationCategoryProofStorage },
    RegistrationOperationsService,
    AsaasCheckoutGateway,
    AsaasCheckoutService,
    ParticipantAreaService,
    ParticipantDashboardService,
    CheckInService,
    EventDeskService,
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


