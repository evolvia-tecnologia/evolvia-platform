import { Controller, Get, Injectable, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { AuthorizationService } from './authorization.service';
import {
  INTEGRATION_AUTH_TYPE_LABELS,
  INTEGRATION_AVAILABILITY_HINTS,
  INTEGRATION_AVAILABILITY_LABELS,
  INTEGRATION_CATALOG,
  INTEGRATION_CATEGORIES,
  INTEGRATION_CATEGORY_LABELS,
  INTEGRATION_OBJECTIVES,
  INTEGRATION_OBJECTIVE_LABELS,
  INTEGRATION_RECIPE_DIRECTION_LABELS,
  type IntegrationCatalogItem,
} from './integrations-catalog';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';

export type IntegrationCatalogItemView = {
  code: string;
  name: string;
  category: IntegrationCatalogItem['category'];
  categoryLabel: string;
  summary: string;
  useCases: string[];
  requirements: string[];
  dataShared: string[];
  authType: IntegrationCatalogItem['authType'];
  authTypeLabel: string;
  availability: IntegrationCatalogItem['availability'];
  availabilityLabel: string;
  availabilityHint: string;
  objectives: Array<{ code: IntegrationCatalogItem['objectives'][number]; label: string }>;
  recipes: Array<{
    trigger: string;
    action: string;
    direction: IntegrationCatalogItem['recipes'][number]['direction'];
    directionLabel: string;
    statusLabel: string;
  }>;
  connectable: false;
  foundation: 'api' | 'webhook' | 'presence' | null;
  documentationUrl?: string;
};

@Injectable()
export class EventIntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(userId: string, eventId: string) {
    const event = await this.requireReadableEvent(userId, eventId);

    return {
      event: {
        id: event.id,
        name: event.name,
        organizationId: event.organizationId,
      },
      guidance: {
        title: 'A EVA explica o que cada integração fará',
        summary:
          'As ferramentas de terceiros continuam somente leitura. API, webhooks e presença em sites já podem ser configurados neste evento, sem enviar dados cadastrais.',
      },
      categories: INTEGRATION_CATEGORIES.map((code) => ({
        code,
        label: INTEGRATION_CATEGORY_LABELS[code],
      })),
      objectives: INTEGRATION_OBJECTIVES.map((code) => ({
        code,
        label: INTEGRATION_OBJECTIVE_LABELS[code],
      })),
      items: INTEGRATION_CATALOG.map((item) => this.present(item)),
    };
  }

  private present(item: IntegrationCatalogItem): IntegrationCatalogItemView {
    const view: IntegrationCatalogItemView = {
      code: item.code,
      name: item.name,
      category: item.category,
      categoryLabel: INTEGRATION_CATEGORY_LABELS[item.category],
      summary: item.summary,
      useCases: [...item.useCases],
      requirements: [...item.requirements],
      dataShared: [...item.dataShared],
      authType: item.authType,
      authTypeLabel: INTEGRATION_AUTH_TYPE_LABELS[item.authType],
      availability: item.availability,
      availabilityLabel: INTEGRATION_AVAILABILITY_LABELS[item.availability],
      availabilityHint: INTEGRATION_AVAILABILITY_HINTS[item.availability],
      objectives: item.objectives.map((code) => ({
        code,
        label: INTEGRATION_OBJECTIVE_LABELS[code],
      })),
      recipes: item.recipes.map((entry) => ({
        trigger: entry.trigger,
        action: entry.action,
        direction: entry.direction,
        directionLabel: INTEGRATION_RECIPE_DIRECTION_LABELS[entry.direction],
        statusLabel: INTEGRATION_AVAILABILITY_LABELS[item.availability],
      })),
      connectable: false,
      foundation: item.foundation,
    };

    if (item.documentationUrl) view.documentationUrl = item.documentationUrl;
    return view;
  }

  private async requireReadableEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, organizationId: true },
    });

    if (!event?.organizationId) {
      throw new NotFoundException('Evento não encontrado.');
    }

    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    return { ...event, organizationId: event.organizationId };
  }
}

@UseGuards(AuthGuard)
@Controller('events/:eventId/integrations')
export class EventIntegrationsController {
  constructor(private readonly integrations: EventIntegrationsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.integrations.list(request.user!.id, eventId);
  }
}
