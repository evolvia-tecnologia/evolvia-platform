import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventStatus, Prisma, RegistrationTermsDocumentState } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthorizationService } from './authorization.service';
import { EventMutationPolicy } from './event-mutation-policy.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import { validateRegistrationTermsPdf } from './registration-terms-document.policy';
import { RegistrationTermsDocumentStorage } from './registration-terms-document.storage';

export type RegistrationTermsSummary = {
  fileName: string;
  byteSize: number;
  version: number;
};

const PUBLIC_TERMS_HEADERS = {
  'Content-Type': 'application/pdf',
  'Content-Disposition': 'inline; filename="termos-de-inscricao.pdf"',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'private, no-store',
} as const;

@Injectable()
export class RegistrationTermsDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly mutationPolicy: EventMutationPolicy,
    private readonly storage: RegistrationTermsDocumentStorage,
  ) {}

  async current(organizationId: string, eventId: string): Promise<RegistrationTermsSummary | null> {
    const document = await this.prisma.eventRegistrationTermsDocument.findFirst({
      where: { organizationId, eventId, state: RegistrationTermsDocumentState.ACTIVE },
      select: { fileName: true, byteSize: true, version: true },
    });
    return document;
  }

  async attach(userId: string, eventId: string, input: unknown) {
    const event = await this.requireMutableEvent(userId, eventId);
    let validated: ReturnType<typeof validateRegistrationTermsPdf>;
    try { validated = validateRegistrationTermsPdf(input as { contentBase64?: string; fileName?: string }); }
    catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Anexe o PDF dos termos de inscrição e da Política de Privacidade.');
    }
    const documentId = randomUUID();
    const storageKey = `${event.organizationId}/${event.id}/${documentId}.pdf`;
    await this.storage.write(storageKey, validated.bytes);
    try {
      const summary = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${event.id} AND "organizationId" = ${event.organizationId} FOR UPDATE`;
        const latest = await tx.eventRegistrationTermsDocument.findFirst({
          where: { eventId: event.id, organizationId: event.organizationId! },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        await tx.eventRegistrationTermsDocument.updateMany({
          where: { eventId: event.id, organizationId: event.organizationId!, state: RegistrationTermsDocumentState.ACTIVE },
          data: { state: RegistrationTermsDocumentState.REPLACED, replacedAt: new Date() },
        });
        const created = await tx.eventRegistrationTermsDocument.create({
          data: {
            id: documentId,
            organizationId: event.organizationId!,
            eventId: event.id,
            storageKey,
            fileName: validated.fileName,
            byteSize: validated.bytes.length,
            checksumSha256: validated.checksumSha256,
            version: (latest?.version ?? 0) + 1,
            createdByUserId: userId,
          },
          select: { fileName: true, byteSize: true, version: true, checksumSha256: true },
        });
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId!,
            eventId: event.id,
            actorUserId: userId,
            action: 'registration.terms_document_attached',
            entityType: 'EventRegistrationTermsDocument',
            entityId: documentId,
            metadata: { version: created.version, byteSize: created.byteSize, checksumSha256: created.checksumSha256 } as Prisma.InputJsonObject,
          },
        });
        return { fileName: created.fileName, byteSize: created.byteSize, version: created.version };
      });
      return summary;
    } catch (error) {
      await this.storage.rollbackNewWrite(storageKey);
      throw error;
    }
  }

  async readForOrganizer(userId: string, eventId: string) {
    const event = await this.requireEvent(userId, eventId);
    return this.readActive(event.organizationId!, event.id);
  }

  async readPublic(slug: string) {
    const event = await this.prisma.event.findUnique({
      where: { slug: slug.trim().toLowerCase() },
      select: { id: true, organizationId: true, status: true },
    });
    if (!event?.organizationId || event.status !== EventStatus.PUBLISHED) {
      throw new NotFoundException('Documento dos termos não encontrado.');
    }
    return this.readActive(event.organizationId, event.id);
  }

  headers() {
    return PUBLIC_TERMS_HEADERS;
  }

  private async readActive(organizationId: string, eventId: string) {
    const document = await this.prisma.eventRegistrationTermsDocument.findFirst({
      where: { organizationId, eventId, state: RegistrationTermsDocumentState.ACTIVE },
      select: { storageKey: true },
    });
    if (!document) throw new NotFoundException('Documento dos termos não encontrado.');
    const bytes = await this.storage.read(document.storageKey);
    return { bytes };
  }

  private async requireEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    return event;
  }

  private async requireMutableEvent(userId: string, eventId: string) {
    const event = await this.requireEvent(userId, eventId);
    this.mutationPolicy.assertFoundationMutable(event.status);
    return event;
  }
}
