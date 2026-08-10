import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AuthorizationService } from './authorization.service';
import { EventsController } from './events.controller';
import { EventMutationPolicy } from './event-mutation-policy.service';
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
    AuthGuard,
    AuthorizationService,
    OrganizationsService,
    EventsService,
    EventMutationPolicy,
    EventWizardService,
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
