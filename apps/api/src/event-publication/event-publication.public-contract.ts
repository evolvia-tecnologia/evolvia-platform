import { EventFormat, EventStatus, Prisma } from '@prisma/client';

export type PublicEventCanonicalSource = {
  id: string;
  name: string;
  slug: string;
  status: EventStatus;
  format: EventFormat;
  startDate: Date | null;
  endDate: Date | null;
  venue: string | null;
};

export type PublicEventPublicationSource = {
  shortDescription: string | null;
  fullDescription: string | null;
  publicContactEmail: string | null;
  publicContactPhone: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  accessibilitySummary: string | null;
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
    id: string;
    name: string;
    slug: string;
    format: EventFormat;
    startDate: Date | null;
    endDate: Date | null;
    venue: string | null;
  };
  publication: {
    shortDescription: string | null;
    fullDescription: string | null;
    publicContactEmail: string | null;
    publicContactPhone: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    accessibilitySummary: string | null;
    themeConfig: Prisma.JsonValue | null;
  };
  sections: Array<{
    kind: string;
    title: string | null;
    sortOrder: number;
    content: Prisma.JsonValue;
  }>;
};

/**
 * Contrato público minimizado da Fase 1 / Lote 2.
 *
 * Este helper NÃO é um endpoint público. Ele existe para fixar desde já a fronteira
 * de dados que o renderer do Lote 4 poderá expor. Rascunho, homologação, revisão,
 * organizationId, auditoria, respostas do Wizard, IDs internos de seção e campos de
 * controle editorial ficam deliberadamente fora deste DTO.
 */
export function buildPublicEventDto(
  event: PublicEventCanonicalSource,
  publication: PublicEventPublicationSource | null,
  sections: PublicEventSectionSource[] = [],
): PublicEventDto | null {
  if (event.status !== EventStatus.PUBLISHED) return null;

  return {
    event: {
      id: event.id,
      name: event.name,
      slug: event.slug,
      format: event.format,
      startDate: event.startDate,
      endDate: event.endDate,
      venue: event.venue,
    },
    publication: {
      shortDescription: publication?.shortDescription ?? null,
      fullDescription: publication?.fullDescription ?? null,
      publicContactEmail: publication?.publicContactEmail ?? null,
      publicContactPhone: publication?.publicContactPhone ?? null,
      seoTitle: publication?.seoTitle ?? null,
      seoDescription: publication?.seoDescription ?? null,
      accessibilitySummary: publication?.accessibilitySummary ?? null,
      themeConfig: publication?.themeConfig ?? null,
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
