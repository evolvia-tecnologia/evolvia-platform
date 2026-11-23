import { ScientificReviewDistributionController } from './scientific-review-distribution.controller';
import { ScientificReviewDistributionService } from './scientific-review-distribution.service';
import { EventCommunicationAudienceController } from './event-communication-audience.controller';
import { EventCommunicationAudienceService } from './event-communication-audience.service';
import { EventCommunicationController } from './event-communication.controller';
import { EventCommunicationService } from './event-communication.service';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JWT_SIGN_OPTIONS, jwtSecret } from './access-shield';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';
import { CheckInController } from './check-in.controller';
import { CheckInService } from './check-in.service';
import { ActivityCourtesyController } from './activity-courtesy.controller';
import { ActivityCourtesyService } from './activity-courtesy.service';
import { ActivityEnrollmentLimitController } from './activity-enrollment-limit.controller';
import { ActivityEnrollmentLimitService } from './activity-enrollment-limit.service';
import { ActivityPreferenceController } from './activity-preference.controller';
import { ActivityPreferenceService } from './activity-preference.service';
import { EventDeskController } from './event-desk.controller';
import { EventEvaluationOrganizerController, EventEvaluationParticipantController } from './event-evaluation.controller';
import { EventEvaluationService } from './event-evaluation.service';
import { ExhibitorCompanyController } from './exhibitor-company.controller';
import { ExhibitorCompanyService } from './exhibitor-company.service';
import { ExhibitorController } from './exhibitor.controller';
import { ExhibitorIdentityController } from './exhibitor-identity.controller';
import { ExhibitorIdentityService } from './exhibitor-identity.service';
import { ExhibitorService } from './exhibitor.service';
import { EventDeskService } from './event-desk.service';
import { PlatformMasterController } from './platform-master.controller';
import { PlatformMasterGuard, PlatformSessionGuard } from './platform-master.guard';
import { PlatformMasterRepository } from './platform-master.repository';
import { PlatformMasterService } from './platform-master.service';
import { PlatformWebAuthnService } from './platform-webauthn';
import { OperatorCapabilityController } from './operator-capability.controller';
import { OperatorCapabilityGuard } from './operator-capability.guard';
import { OperatorCapabilityRepository } from './operator-capability.repository';
import { OperatorCapabilityService } from './operator-capability.service';
import { CredentialPrintConfirmationController } from './credential-print-confirmation.controller';
import { CredentialPrintConfirmationService } from './credential-print-confirmation.service';
import { SelfCheckInController } from './self-check-in.controller';
import { ShowOperationsController } from './show-operations.controller';
import { ShowOperationsService } from './show-operations.service';
import { TurnstileController } from './turnstile.controller';
import { TurnstileService } from './turnstile.service';
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
import { RegistrationConfirmationMailService } from './registration-confirmation-mail.service';
import { EventWizardController } from './event-wizard.controller';
import { EventWizardService } from './event-wizard.service';
import { EventReuseController } from './event-reuse.controller';
import { EventReuseService } from './event-reuse.service';
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
import { RegistrationOrderCheckoutIntentService } from './registration-order-checkout-intent.service';
import { RegistrationOrderCheckoutService } from './registration-order-checkout.service';
import { RegistrationCategoryProofService } from './registration-category-proof.service';
import { LocalRegistrationCategoryProofStorage, RegistrationCategoryProofStorage } from './registration-category-proof.storage';
import { RegistrationOperationsController } from './registration-operations.controller';
import { RegistrationOperationsService } from './registration-operations.service';
import { RegistrationWaitlistController } from './registration-waitlist.controller';
import {
  RegistrationRefundAccountController,
  RegistrationRefundOrganizerController,
  RegistrationRefundParticipantController,
  RegistrationRefundPublicController,
} from './registration-refund.controller';
import { RegistrationRefundService } from './registration-refund.service';
import { RegistrationWaitlistService } from './registration-waitlist.service';
import { AsaasCheckoutGateway } from './asaas-checkout.gateway';
import { PublicAsaasCheckoutController, PublicRegistrationOrderCheckoutController, AsaasCheckoutWebhookController } from './asaas-checkout.controller';
import { AsaasCheckoutService } from './asaas-checkout.service';
import { ParticipantDashboardController } from './participant-dashboard.controller';
import { ParticipantDashboardService } from './participant-dashboard.service';
import { ParticipantAreaController } from './participant-area.controller';
import { ParticipantAgendaService } from './participant-agenda.service';
import { ActivityWaitlistOrganizerController, ActivityWaitlistParticipantController } from './activity-waitlist.controller';
import { ActivityWaitlistService } from './activity-waitlist.service';
import { ParticipantAreaService } from './participant-area.service';
import { ScientificAuthorController } from './scientific-author.controller';
import { ScientificAuthorService } from './scientific-author.service';
import { ScientificAuthorNoticeMailService } from './scientific-author-notice-mail.service';
import { ScientificEventCentralController } from './scientific-event-central.controller';
import { ScientificEventCentralService } from './scientific-event-central.service';
import { ScientificGuestsController, ScientificInvitationController } from './scientific-guests.controller';
import { ScientificGuestsService } from './scientific-guests.service';
import { ScientificProgramController } from './scientific-program.controller';
import { ScientificProgramPublicController } from './scientific-program-public.controller';
import { ScientificProgramPublicService } from './scientific-program-public.service';
import { ScientificProgramService } from './scientific-program.service';
import { ScientificReviewsController } from './scientific-reviews.controller';
import { ScientificReviewerController, ScientificReviewerOrganizerController } from './scientific-reviewer.controller';
import { ScientificReviewerService } from './scientific-reviewer.service';
import { ScientificReviewsService } from './scientific-reviews.service';
import { LocalScientificFileStorage, ScientificFileStorage } from './scientific-file.storage';
import { ScientificStructureController } from './scientific-structure.controller';
import { ScientificStructureService } from './scientific-structure.service';
import { ScientificStationOrganizerController, ScientificStationPublicController } from './scientific-station.controller';
import { ScientificStationService } from './scientific-station.service';
import { ScientificSubmissionsController } from './scientific-submissions.controller';
import { ScientificSubmissionsService } from './scientific-submissions.service';
import { CertificateRoleController } from './certificate-role.controller';
import { CertificateRoleService } from './certificate-role.service';
import { PresenceCertificateController } from './presence-certificate.controller';
import { PresenceCertificatePublicController } from './presence-certificate-public.controller';
import { PresenceCertificateService } from './presence-certificate.service';
import { TransmissionController } from './transmission.controller';
import { TransmissionService } from './transmission.service';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: jwtSecret(),
      signOptions: JWT_SIGN_OPTIONS,
    }),
  ],
  controllers: [
    ScientificReviewDistributionController,
    HealthController,
    AuthController,
    OrganizationsController,
    EventsController,
    EventReuseController,
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
    RegistrationWaitlistController,
    RegistrationRefundPublicController,
    RegistrationRefundParticipantController,
    RegistrationRefundAccountController,
    RegistrationRefundOrganizerController,
    PublicAsaasCheckoutController,
    PublicRegistrationOrderCheckoutController,
    AsaasCheckoutWebhookController,
    ParticipantAreaController,
    ActivityWaitlistParticipantController,
    ActivityWaitlistOrganizerController,
    ParticipantDashboardController,
    CheckInController,
    SelfCheckInController,
    ActivityCourtesyController,
    ActivityEnrollmentLimitController,
    ActivityPreferenceController,
    EventDeskController,
    PlatformMasterController,
    OperatorCapabilityController,
    CredentialPrintConfirmationController,
    ExhibitorController,
    ExhibitorCompanyController,
    ExhibitorIdentityController,
    EventCommunicationAudienceController,
    EventCommunicationController,
    EventEvaluationOrganizerController,
    EventEvaluationParticipantController,
    ShowOperationsController,
    TurnstileController,
    ScientificAuthorController,
    ScientificEventCentralController,
    ScientificStructureController,
    ScientificGuestsController,
    ScientificInvitationController,
    ScientificProgramController,
    ScientificProgramPublicController,
    ScientificSubmissionsController,
    ScientificStationPublicController,
    ScientificStationOrganizerController,
    ScientificReviewsController,
    ScientificReviewerController,
    ScientificReviewerOrganizerController,
    TransmissionController,
    PresenceCertificateController,
    PresenceCertificatePublicController,
    CertificateRoleController,
  ],
  providers: [
    ScientificReviewDistributionService,
    PrismaService,
    AuthService,
    EmailVerificationService,
    AuthGuard,
    AuthorizationService,
    OrganizationsService,
    EventsService,
    EventReuseService,
    EventFinancialResponsibilityService,
    EventMutationPolicy,
    EventWizardService,
    EventIntegrationsService,
    RegistrationConfirmationMailService,
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
    RegistrationOrderCheckoutIntentService,
    RegistrationOrderCheckoutService,
    RegistrationCategoryProofService,
    { provide: RegistrationCategoryProofStorage, useClass: LocalRegistrationCategoryProofStorage },
    RegistrationOperationsService,
    RegistrationWaitlistService,
    RegistrationRefundService,
    AsaasCheckoutGateway,
    AsaasCheckoutService,
    ParticipantAreaService,
    ParticipantAgendaService,
    ActivityWaitlistService,
    ParticipantDashboardService,
    CheckInService,
    ActivityCourtesyService,
    ActivityEnrollmentLimitService,
    ActivityPreferenceService,
    EventDeskService,
    PlatformMasterRepository,
    PlatformMasterService,
    PlatformWebAuthnService,
    PlatformSessionGuard,
    PlatformMasterGuard,
    OperatorCapabilityRepository,
    OperatorCapabilityGuard,
    OperatorCapabilityService,
    CredentialPrintConfirmationService,
    ExhibitorService,
    ExhibitorIdentityService,
    {
      provide: ExhibitorCompanyService,
      useFactory: (prisma: PrismaService) => new ExhibitorCompanyService(prisma),
      inject: [PrismaService],
    },
    EventCommunicationAudienceService,
    EventCommunicationService,
    EventEvaluationService,
    ShowOperationsService,
    TurnstileService,
    ScientificAuthorService,
    ScientificAuthorNoticeMailService,
    ScientificEventCentralService,
    ScientificStructureService,
    ScientificGuestsService,
    ScientificProgramService,
    ScientificProgramPublicService,
    ScientificSubmissionsService,
    ScientificStationService,
    ScientificReviewsService,
    ScientificReviewerService,
    { provide: ScientificFileStorage, useClass: LocalScientificFileStorage },
    TransmissionService,
    PresenceCertificateService,
    CertificateRoleService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}








