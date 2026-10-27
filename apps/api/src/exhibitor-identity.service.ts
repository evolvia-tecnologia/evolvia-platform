import { Injectable, NotFoundException } from '@nestjs/common';
import { CapabilityStatus, EventMediaAssetState, EventMediaUsage, EventStatus } from '@prisma/client';
import { EventPublicationMediaStorage } from './event-publication/event-publication-media.storage';
import { organizerSupport, type OrganizerSupport } from './exhibitor-identity.policy';
import { PrismaService } from './prisma.service';

const EVENT_DENIED = 'Evento não encontrado.';

type IdentityScope = { id: string; organizationId: string; name: string; slug: string; status: EventStatus };

export type ExhibitorIdentity = {
  event: { name: string; slug: string };
  logo: { url: string; width: number; height: number } | null;
  support: OrganizerSupport;
};

export function exhibitorPortalOpen(status: EventStatus): boolean {
  return status !== EventStatus.DRAFT && status !== EventStatus.CANCELLED;
}

export function exhibitorLogoUrl(slug: string, assetId: string): string {
  return `/api/public/events/${encodeURIComponent(slug)}/exhibitor-identity/logo?v=${encodeURIComponent(assetId)}`;
}

// Shared by the public portal entry and the authorized CAEX home so both
// resolve the logo and organizer support from the same event-scoped record.
export async function loadExhibitorIdentity(prisma: PrismaService, event: IdentityScope): Promise<ExhibitorIdentity> {
  const publication = await prisma.eventPublication.findUnique({
    where: { eventId_organizationId: { eventId: event.id, organizationId: event.organizationId } },
    select: {
      publicContactEmail: true,
      publicContactPhone: true,
      logoAsset: { select: { id: true, usage: true, state: true, width: true, height: true } },
    },
  });
  const asset = publication?.logoAsset;
  const logoReady = exhibitorPortalOpen(event.status) && asset?.state === EventMediaAssetState.ACTIVE
    && asset.usage === EventMediaUsage.LOGO && asset.width > 0 && asset.height > 0;
  return {
    event: { name: event.name, slug: event.slug },
    logo: logoReady ? { url: exhibitorLogoUrl(event.slug, asset.id), width: asset.width, height: asset.height } : null,
    support: organizerSupport(publication ?? null),
  };
}

@Injectable()
export class ExhibitorIdentityService {
  constructor(private readonly prisma: PrismaService, private readonly storage: EventPublicationMediaStorage) {}

  async forSlug(slug: string): Promise<ExhibitorIdentity> {
    return loadExhibitorIdentity(this.prisma, await this.portalEvent(slug));
  }

  async logo(slug: string) {
    const event = await this.portalEvent(slug);
    const publication = await this.prisma.eventPublication.findUnique({
      where: { eventId_organizationId: { eventId: event.id, organizationId: event.organizationId } },
      select: { logoAsset: { select: { storageKey: true, mimeType: true, usage: true, state: true } } },
    });
    const asset = publication?.logoAsset;
    if (!asset || asset.state !== EventMediaAssetState.ACTIVE || asset.usage !== EventMediaUsage.LOGO) {
      throw new NotFoundException('Mídia não encontrada.');
    }
    return { mimeType: asset.mimeType, bytes: await this.storage.read(asset.storageKey) };
  }

  private async portalEvent(slug: string): Promise<IdentityScope> {
    if (typeof slug !== 'string' || !/^[a-z0-9-]{3,80}$/u.test(slug)) throw new NotFoundException(EVENT_DENIED);
    const event = await this.prisma.event.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        organizationId: true,
        capabilities: { where: { code: 'exhibitor', status: CapabilityStatus.ACTIVE }, select: { id: true } },
      },
    });
    if (!event?.organizationId || !exhibitorPortalOpen(event.status) || event.capabilities.length === 0) {
      throw new NotFoundException(EVENT_DENIED);
    }
    return { id: event.id, organizationId: event.organizationId, name: event.name, slug: event.slug, status: event.status };
  }
}
