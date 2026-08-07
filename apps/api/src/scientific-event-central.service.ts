import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CapabilityStatus, EventProfileCode, Prisma } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { ScientificCentralChoiceDto, UpdateScientificCentralBlockDto } from './dto';
import { EventMutationPolicy } from './event-mutation-policy.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import {
  SCIENTIFIC_CENTRAL_BLOCKS,
  getScientificCentralBlock,
  publicScientificCentralBlock,
} from './scientific-central-policy';

@Injectable()
export class ScientificEventCentralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly mutationPolicy: EventMutationPolicy,
  ) {}

  async get(userId: string, eventId: string) {
    const event = await this.requireScientificEvent(userId, eventId);
    const capabilities = new Map(event.capabilities.map((item) => [item.code, item]));
    const blocks = SCIENTIFIC_CENTRAL_BLOCKS.map((definition) =>
      publicScientificCentralBlock(definition, capabilities.get(definition.capabilityCode)),
    );
    const decided = blocks.filter((block) => block.choice !== null).length;
    const next = blocks.find((block) => block.choice === null);

    return {
      event: {
        id: event.id,
        name: event.name,
        status: event.status,
        profileCode: event.profileCode,
        organizationId: event.organizationId,
        organization: event.organization,
        updatedAt: event.updatedAt,
      },
      central: {
        completionPercent: Math.round((decided / blocks.length) * 100),
        decidedCount: decided,
        totalCount: blocks.length,
        pendingCount: blocks.length - decided,
        nextAction: next
          ? `Defina como deseja preparar “${next.label}”.`
          : 'As decisões iniciais da Central estão completas. A configuração detalhada seguirá pelos Gates A3–A9.',
      },
      blocks,
    };
  }

  async updateBlock(userId: string, eventId: string, dto: UpdateScientificCentralBlockDto) {
    const event = await this.requireScientificEvent(userId, eventId);
    this.mutationPolicy.assertFoundationMutable(event.status);

    const definition = getScientificCentralBlock(dto.blockId);
    if (!definition) throw new BadRequestException('Bloco da Central científica inválido.');

    const existing = event.capabilities.find((item) => item.code === definition.capabilityCode);
    const currentConfig = this.configObject(existing?.config);
    const status = dto.choice === ScientificCentralChoiceDto.LATER
      ? CapabilityStatus.DISABLED
      : CapabilityStatus.ACTIVE;

    await this.prisma.$transaction(async (tx) => {
      await tx.eventCapability.upsert({
        where: { eventId_code: { eventId, code: definition.capabilityCode } },
        create: {
          eventId,
          code: definition.capabilityCode,
          status,
          schemaVersion: 1,
          config: {
            ...currentConfig,
            centralChoice: dto.choice,
            centralUpdatedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
        update: {
          status,
          config: {
            ...currentConfig,
            centralChoice: dto.choice,
            centralUpdatedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: event.organizationId!,
          actorUserId: userId,
          eventId,
          action: 'scientific.central_block_decided',
          entityType: 'EventCapability',
          entityId: definition.capabilityCode,
          metadata: {
            blockId: definition.id,
            gate: definition.gate,
            choice: dto.choice,
            resultingStatus: status,
          },
        },
      });
    });

    return this.get(userId, eventId);
  }

  private configObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>) }
      : {};
  }

  private async requireScientificEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        organization: { select: { id: true, name: true, slug: true, status: true } },
        capabilities: {
          select: { code: true, status: true, config: true },
          orderBy: { code: 'asc' },
        },
      },
    });

    if (!event) throw new NotFoundException('Evento não encontrado.');

    if (event.organizationId) {
      await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    } else if (event.ownerId !== userId) {
      throw new NotFoundException('Evento não encontrado.');
    }

    if (event.profileCode !== EventProfileCode.SCIENTIFIC_EVENT) {
      throw new BadRequestException('A Central científica está disponível apenas para eventos técnico-científicos.');
    }

    if (!event.organizationId) {
      throw new BadRequestException('O evento científico precisa estar vinculado a uma organização.');
    }

    return event;
  }
}
