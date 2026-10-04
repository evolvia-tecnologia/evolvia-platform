import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventStatus, MembershipRole, Prisma, RegistrationCheckoutStatus, RegistrationProofRequirement, RegistrationProofState, RegistrationReservationStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthorizationService } from './authorization.service';
import { PrismaService } from './prisma.service';
import { RegistrationCategoryProofStorage } from './registration-category-proof.storage';
import { validateRegistrationTermsPdf } from './registration-terms-document.policy';

const REVIEW_ROLES = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.MANAGER];
const PROTOCOL = /^EVO-[A-F0-9]{16}$/u;
const OPEN_CHECKOUT = new Set<RegistrationCheckoutStatus>([
  RegistrationCheckoutStatus.CREATING,
  RegistrationCheckoutStatus.ACTIVE,
  RegistrationCheckoutStatus.PAID,
  RegistrationCheckoutStatus.PAID_REVIEW,
]);

const PROOF_HEADERS = {
  'Content-Type': 'application/pdf',
  'Content-Disposition': 'inline; filename="comprovante-de-categoria.pdf"',
  'Content-Security-Policy': "sandbox; default-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'private, no-store',
} as const;

@Injectable()
export class RegistrationCategoryProofService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly storage: RegistrationCategoryProofStorage,
  ) {}

  headers() {
    return PROOF_HEADERS;
  }

  async attach(slug: string, protocol: string, input: unknown) {
    const normalizedProtocol = this.protocol(protocol);
    let validated: ReturnType<typeof validateRegistrationTermsPdf>;
    try {
      validated = validateRegistrationTermsPdf(input as { contentBase64?: string; fileName?: string });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Anexe o PDF que comprova a categoria.');
    }
    const event = await this.publishedEvent(slug);
    const reservation = await this.reservation(event.id, event.organizationId, normalizedProtocol);
    this.assertCanReplace(reservation);
    if (reservation.category.proofRequirement !== RegistrationProofRequirement.REQUIRED_BEFORE_PAYMENT) {
      throw new BadRequestException('Esta categoria não pede comprovante.');
    }
    if (reservation.categoryProof?.state === RegistrationProofState.APPROVED) {
      throw new ConflictException('O comprovante desta inscrição já foi aprovado.');
    }
    if (reservation.categoryProof?.checksumSha256 === validated.checksumSha256) {
      return { protocol: reservation.protocol, state: reservation.categoryProof.state, fileName: reservation.categoryProof.fileName, byteSize: reservation.categoryProof.byteSize };
    }
    const documentId = randomUUID();
    const storageKey = `${event.organizationId}/${event.id}/${documentId}.pdf`;
    await this.storage.write(storageKey, validated.bytes);
    try {
      const saved = await this.prisma.$transaction(async (tx) => {
        const current = await tx.eventRegistrationCategoryProof.findUnique({ where: { reservationId: reservation.id } });
        if (current?.state === RegistrationProofState.APPROVED) throw new ConflictException('O comprovante desta inscrição já foi aprovado.');
        const data = {
          storageKey,
          fileName: validated.fileName,
          byteSize: validated.bytes.length,
          checksumSha256: validated.checksumSha256,
          state: RegistrationProofState.PENDING_REVIEW,
          reviewedByUserId: null,
          reviewedAt: null,
        };
        const proof = current
          ? await tx.eventRegistrationCategoryProof.update({ where: { id: current.id }, data, select: { state: true, fileName: true, byteSize: true } })
          : await tx.eventRegistrationCategoryProof.create({
            data: { id: documentId, organizationId: event.organizationId, eventId: event.id, reservationId: reservation.id, ...data },
            select: { state: true, fileName: true, byteSize: true },
          });
        await tx.auditLog.create({
          data: {
            organizationId: event.organizationId,
            eventId: event.id,
            action: 'registration.category_proof_received',
            entityType: 'EventRegistrationCategoryProof',
            entityId: current?.id ?? documentId,
            metadata: { byteSize: validated.bytes.length, checksumSha256: validated.checksumSha256, replaced: Boolean(current) } as Prisma.InputJsonObject,
          },
        });
        return { proof, previousKey: current?.storageKey ?? null };
      });
      if (saved.previousKey && saved.previousKey !== storageKey) await this.storage.remove(saved.previousKey);
      return { protocol: reservation.protocol, state: saved.proof.state, fileName: saved.proof.fileName, byteSize: saved.proof.byteSize };
    } catch (error) {
      await this.storage.remove(storageKey);
      throw error;
    }
  }

  async review(userId: string, eventId: string, protocol: string, input: unknown) {
    const decision = this.decision(input);
    const event = await this.organizerEvent(userId, eventId);
    const reservation = await this.reservation(event.id, event.organizationId, this.protocol(protocol));
    if (!reservation.categoryProof) throw new NotFoundException('Esta inscrição não tem comprovante.');
    const reviewedAt = new Date();
    const updated = await this.prisma.eventRegistrationCategoryProof.update({
      where: { id: reservation.categoryProof.id },
      data: { state: decision, reviewedByUserId: userId, reviewedAt },
      select: { state: true },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId: event.organizationId,
        eventId: event.id,
        actorUserId: userId,
        action: 'registration.category_proof_reviewed',
        entityType: 'EventRegistrationCategoryProof',
        entityId: reservation.categoryProof.id,
        metadata: { state: updated.state } as Prisma.InputJsonObject,
      },
    });
    return { protocol: reservation.protocol, state: updated.state };
  }

  async readForOrganizer(userId: string, eventId: string, protocol: string) {
    const event = await this.organizerEvent(userId, eventId);
    const reservation = await this.reservation(event.id, event.organizationId, this.protocol(protocol));
    if (!reservation.categoryProof) throw new NotFoundException('Esta inscrição não tem comprovante.');
    return { bytes: await this.storage.read(reservation.categoryProof.storageKey) };
  }

  private protocol(value: string) {
    const protocol = value?.trim().toUpperCase() ?? '';
    if (!PROTOCOL.test(protocol)) throw new BadRequestException('Protocolo inválido.');
    return protocol;
  }

  private decision(input: unknown): RegistrationProofState {
    const decision = input && typeof input === 'object' && !Array.isArray(input) ? (input as { decision?: unknown }).decision : undefined;
    if (decision === 'APPROVED') return RegistrationProofState.APPROVED;
    if (decision === 'REJECTED') return RegistrationProofState.REJECTED;
    throw new BadRequestException('Informe se o comprovante foi aprovado ou recusado.');
  }

  private async publishedEvent(slug: string) {
    const event = await this.prisma.event.findUnique({
      where: { slug: slug.trim().toLowerCase() },
      select: { id: true, organizationId: true, status: true },
    });
    if (!event?.organizationId || event.status !== EventStatus.PUBLISHED) throw new NotFoundException('Inscrição não encontrada.');
    return { id: event.id, organizationId: event.organizationId };
  }

  private async organizerEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizationId: true },
    });
    if (!event?.organizationId) throw new NotFoundException('Evento não encontrado.');
    await this.authorization.requireRole(userId, event.organizationId, REVIEW_ROLES);
    return { id: event.id, organizationId: event.organizationId };
  }

  private async reservation(eventId: string, organizationId: string, protocol: string) {
    const reservation = await this.prisma.eventRegistrationReservation.findFirst({
      where: { protocol, eventId, organizationId },
      select: {
        id: true,
        protocol: true,
        status: true,
        expiresAt: true,
        category: { select: { proofRequirement: true } },
        categoryProof: { select: { id: true, state: true, storageKey: true, checksumSha256: true, fileName: true, byteSize: true } },
        checkout: { select: { status: true } },
      },
    });
    if (!reservation) throw new NotFoundException('Inscrição não encontrada.');
    return reservation;
  }

  private assertCanReplace(reservation: { status: RegistrationReservationStatus; expiresAt: Date | null; checkout: { status: RegistrationCheckoutStatus } | null }) {
    const expired = reservation.status === RegistrationReservationStatus.PENDING_PAYMENT && reservation.expiresAt !== null && reservation.expiresAt <= new Date();
    if (reservation.status !== RegistrationReservationStatus.PENDING_PAYMENT || expired) {
      throw new ConflictException('Esta reserva não aceita mais o comprovante.');
    }
    if (reservation.checkout && OPEN_CHECKOUT.has(reservation.checkout.status)) {
      throw new ConflictException('O pagamento desta reserva já foi iniciado.');
    }
  }
}
