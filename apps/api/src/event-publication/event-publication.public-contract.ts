import { EventFormat, EventProfileCode, EventStatus, Prisma } from '@prisma/client';
import {
  projectPublicEventPublicationTheme,
  PublicEventPublicationTheme,
} from './event-publication-theme.policy';

export type PublicEventCanonicalSource = {
  id: string;
  name: string;
  slug: string;
  status: EventStatus;
  eventType: string;
  profileCode: EventProfileCode | null;
  format: EventFormat;
  startDate: Date | null;
  endDate: Date | null;
  timeZone: string | null;
  venue: string | null;
  estimatedAudience: number | null;
};

export type PublicEventPublicationSource = {
  shortDescription: string | null;
  fullDescription: string | null;
  publicContactEmail: string | null;
  publicContactPhone: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  accessibilitySummary: string | null;
  catalogListed?: boolean;
  themeConfig: Prisma.JsonValue | null;
};

export type PublicEventSectionSource = {
  kind: string;
  title: string | null;
  enabled: boolean;
  sortOrder: number;
  content: Prisma.JsonValue;
};

export type PublicEventDto = {
  event: {
    name: string;
    slug: string;
    eventType: string;
    profileCode: EventProfileCode | null;
    format: EventFormat;
    startDate: Date | null;
    endDate: Date | null;
    timeZone: string | null;
    venue: string | null;
    estimatedAudience: number | null;
  };
  publication: {
    shortDescription: string | null;
    fullDescription: string | null;
    publicContactEmail: string | null;
    publicContactPhone: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    accessibilitySummary: string | null;
    catalogListed: boolean;
    themeConfig: PublicEventPublicationTheme | null;
  };
  media: {
    logo: PublicEventMediaSource | null;
    cover: PublicEventMediaSource | null;
    socialShare: PublicEventMediaSource | null;
  };
  sections: Array<{
    kind: string;
    title: string | null;
    sortOrder: number;
    content: Prisma.JsonValue;
  }>;
};

export type PublicEventMediaSource = {
  usage: 'LOGO' | 'COVER' | 'SOCIAL_SHARE';
  mimeType: string;
  width: number;
  height: number;
  altText: string | null;
  decorative: boolean;
  url: string;
};

function buildEventPresentationDto(
  event: PublicEventCanonicalSource,
  publication: PublicEventPublicationSource | null,
  sections: PublicEventSectionSource[] = [],
  media: PublicEventMediaSource[] = [],
): PublicEventDto {
  const mediaByUsage = new Map(media.map((item) => [item.usage, {
    usage: item.usage,
    mimeType: item.mimeType,
    width: item.width,
    height: item.height,
    altText: item.altText,
    decorative: item.decorative,
    url: item.url,
  }]));
  return {
    event: {
      name: event.name,
      slug: event.slug,
      eventType: event.eventType,
      profileCode: event.profileCode,
      format: event.format,
      startDate: event.startDate,
      endDate: event.endDate,
      timeZone: event.timeZone,
      venue: event.venue,
      estimatedAudience: event.estimatedAudience,
    },
    publication: {
      shortDescription: publication?.shortDescription ?? null,
      fullDescription: publication?.fullDescription ?? null,
      publicContactEmail: publication?.publicContactEmail ?? null,
      publicContactPhone: publication?.publicContactPhone ?? null,
      seoTitle: publication?.seoTitle ?? null,
      seoDescription: publication?.seoDescription ?? null,
      accessibilitySummary: publication?.accessibilitySummary ?? null,
      catalogListed: publication?.catalogListed !== false,
      themeConfig: projectPublicEventPublicationTheme(publication?.themeConfig ?? null),
    },
    media: {
      logo: mediaByUsage.get('LOGO') ?? null,
      cover: mediaByUsage.get('COVER') ?? null,
      socialShare: mediaByUsage.get('SOCIAL_SHARE') ?? null,
    },
    sections: sections
      .filter((section) => section.enabled)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((section) => ({
        kind: section.kind,
        title: section.title,
        sortOrder: section.sortOrder,
        content: section.content,
      })),
  };
}

/**
 * Contrato de apresentação usado pelo preview autenticado.
 *
 * A autorização e o estado permitido são verificados antes da construção deste DTO.
 * O formato é deliberadamente idêntico ao contrato público para evitar que o preview
 * revele IDs, tenant, revisão, auditoria ou qualquer outro dado administrativo.
 */
export function buildPreviewEventDto(
  event: PublicEventCanonicalSource,
  publication: PublicEventPublicationSource | null,
  sections: PublicEventSectionSource[] = [],
  media: PublicEventMediaSource[] = [],
): PublicEventDto {
  return buildEventPresentationDto(event, publication, sections, media);
}

/**
 * Contrato público minimizado da Fase 1.
 *
 * Rascunho, homologação, revisão, organizationId, auditoria, respostas do Wizard,
 * IDs internos e campos de controle editorial ficam deliberadamente fora deste DTO.
 */
export function buildPublicEventDto(
  event: PublicEventCanonicalSource,
  publication: PublicEventPublicationSource | null,
  sections: PublicEventSectionSource[] = [],
  media: PublicEventMediaSource[] = [],
): PublicEventDto | null {
  if (event.status !== EventStatus.PUBLISHED) return null;
  return buildEventPresentationDto(event, publication, sections, media);
}
