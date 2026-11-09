import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthorizationService } from './authorization.service';
import { EventMutationPolicy } from './event-mutation-policy.service';
import { EVENT_EDITOR_ROLES } from './membership-policy';
import { PrismaService } from './prisma.service';
import { lotesRemovidos } from './registration-catalog-removal';
import {
  RegistrationCategoryInput,
  RegistrationCommercialPolicyError,
  normalizeRegistrationCatalog,
} from './registration-commercial-policy';

type SaveRegistrationCommercialInput = {
  expectedRevision: number;
  categories: RegistrationCategoryInput[];
};

@Injectable()
export class RegistrationCommercialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly mutationPolicy: EventMutationPolicy,
  ) {}

  async get(userId: string, eventId: string) {
    const event = await this.requireEvent(userId, eventId);
    const scope = { eventId, organizationId: event.organizationId! };
    const catalog = await this.prisma.eventRegistrationCatalog.findUnique({
      where: { eventId_organizationId: scope },
      include: {
        categories: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: { lots: { orderBy: [{ sortOrder: 'asc' }, { startsAt: 'asc' }] } },
        },
      },
    });

    return {
      event: {
        id: event.id,
        name: event.name,
        status: event.status,
        registrationMode: event.registrationMode,
        endDate: event.endDate?.toISOString() ?? null,
      },
      revision: catalog?.revision ?? 0,
      categories: (catalog?.categories ?? []).map((category) => ({
        id: category.id,
        code: category.code,
        name: category.name,
        description: category.description,
        capacity: category.capacity,
        proofRequirement: category.proofRequirement,
        active: category.active,
        sortOrder: category.sortOrder,
        lots: category.lots.map((lot) => ({
          id: lot.id,
          code: lot.code,
          name: lot.name,
          startsAt: lot.startsAt.toISOString(),
          endsAt: lot.endsAt.toISOString(),
          quantity: lot.quantity,
          priceCents: lot.priceCents,
          active: lot.active,
          sortOrder: lot.sortOrder,
        })),
      })),
      currency: 'BRL',
      publicRegistrationEnabled: false,
      message:
        'Configure categorias e lotes aqui. Salvar não publica o evento nem abre inscrições; a inscrição pública exige publicação explícita e lote vigente. O pagamento depende da configuração do provedor.',
    };
  }

  async save(userId: string, eventId: string, input: SaveRegistrationCommercialInput) {
    const event = await this.requireMutableEvent(userId, eventId);
    let categories;
    try {
      categories = normalizeRegistrationCatalog(input.categories, event.registrationMode, event.endDate);
    } catch (error) {
      if (error instanceof RegistrationCommercialPolicyError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const organizationId = event.organizationId!;
    const scope = { eventId, organizationId };
    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.eventRegistrationCatalog.findUnique({
          where: { eventId_organizationId: scope },
          include: { categories: { include: { lots: true } } },
        });
        if ((existing?.revision ?? 0) !== input.expectedRevision) {
          throw new ConflictException(
            'As categorias e lotes foram alterados em outra sessão. Recarregue antes de salvar novamente.',
          );
        }

        // Antes de qualquer escrita: o que este salvamento REMOVERIA, e se
        // alguém já se inscreveu nisso.
        //
        // A reconciliação por `code` apaga o que não veio no corpo. Isso é
        // correto enquanto ninguém se inscreveu. Depois, não é:
        // `EventRegistrationReservation` referencia lote e categoria com
        // `onDelete: Restrict`, então o banco recusa — mas recusa com violação
        // de chave estrangeira, que sem tratamento chega ao organizador como
        // 500, no meio de um salvamento que podia ter outras onze alterações
        // legítimas, e sem dizer qual lote travou.
        //
        // Conferir ANTES de avançar a revisão também evita queimar um número
        // de revisão num salvamento que não vai acontecer.
        const removidos = lotesRemovidos(existing?.categories ?? [], categories);
        if (removidos.length > 0) {
          const presos = await tx.eventRegistrationReservation.findMany({
            where: { ...scope, lotId: { in: removidos.map((lote) => lote.id) } },
            select: { lotId: true },
            distinct: ['lotId'],
          });
          if (presos.length > 0) {
            const codigoPorId = new Map(removidos.map((lote) => [lote.id, lote.code]));
            const codigos = presos.map((reserva) => codigoPorId.get(reserva.lotId) ?? reserva.lotId).sort();
            throw new ConflictException(
              `Não é possível remover lote que já tem inscrição: ${codigos.join(', ')}. `
              + 'Desative o lote em vez de removê-lo, para preservar as inscrições, o preço praticado e o histórico.',
            );
          }
        }

        let catalog;
        if (existing) {
          const advanced = await tx.eventRegistrationCatalog.updateMany({
            where: { id: existing.id, ...scope, revision: input.expectedRevision },
            data: { revision: { increment: 1 } },
          });
          if (advanced.count !== 1) {
            throw new ConflictException(
              'As categorias e lotes foram alterados em outra sessão. Recarregue antes de salvar novamente.',
            );
          }
          catalog = await tx.eventRegistrationCatalog.findUniqueOrThrow({
            where: { id: existing.id },
          });
        } else {
          try {
            catalog = await tx.eventRegistrationCatalog.create({
              data: { ...scope, revision: 1 },
            });
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002'
            ) {
              throw new ConflictException(
                'As categorias e lotes foram alterados em outra sessão. Recarregue antes de salvar novamente.',
              );
            }
            throw error;
          }
        }

        for (const categoryInput of categories) {
          const previousCategory = existing?.categories.find(
            (category) => category.code === categoryInput.code,
          );
          const categoryData = {
            name: categoryInput.name,
            description: categoryInput.description,
            capacity: categoryInput.capacity,
            proofRequirement: categoryInput.proofRequirement,
            active: categoryInput.active,
            sortOrder: categoryInput.sortOrder,
          };
          const category = previousCategory
            ? await tx.eventRegistrationCategory.update({
                where: { id: previousCategory.id },
                data: categoryData,
              })
            : await tx.eventRegistrationCategory.create({
                data: {
                  ...scope,
                  catalogId: catalog.id,
                  code: categoryInput.code,
                  ...categoryData,
                },
              });

          for (const lotInput of categoryInput.lots) {
            const previousLot = previousCategory?.lots.find((lot) => lot.code === lotInput.code);
            const lotData = {
              name: lotInput.name,
              startsAt: new Date(lotInput.startsAt),
              endsAt: new Date(lotInput.endsAt),
              quantity: lotInput.quantity,
              priceCents: lotInput.priceCents,
              active: lotInput.active,
              sortOrder: lotInput.sortOrder,
            };
            if (previousLot) {
              await tx.eventRegistrationLot.update({
                where: { id: previousLot.id },
                data: lotData,
              });
            } else {
              await tx.eventRegistrationLot.create({
                data: {
                  ...scope,
                  categoryId: category.id,
                  code: lotInput.code,
                  ...lotData,
                },
              });
            }
          }

          await tx.eventRegistrationLot.deleteMany({
            where: {
              ...scope,
              categoryId: category.id,
              code: { notIn: categoryInput.lots.map((lot) => lot.code) },
            },
          });
        }

        await tx.eventRegistrationCategory.deleteMany({
          where: {
            ...scope,
            catalogId: catalog.id,
            code: { notIn: categories.map((category) => category.code) },
          },
        });

        await tx.auditLog.create({
          data: {
            organizationId,
            eventId,
            actorUserId: userId,
            action: 'registration.commercial_catalog_saved',
            entityType: 'EventRegistrationCatalog',
            entityId: catalog.id,
            metadata: {
              revision: catalog.revision,
              categoryCount: categories.length,
              lotCount: categories.reduce((total, category) => total + category.lots.length, 0),
            } as Prisma.InputJsonObject,
          },
        });
      });
    } catch (error) {
      // Rede de segurança para a corrida entre a conferência acima e o
      // `deleteMany`: se uma inscrição nascer nesse intervalo, o `Restrict` do
      // banco recusa com P2003. Sem isto, essa corrida voltaria a aparecer
      // como 500 — rara, mas exatamente no momento de maior movimento.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException(
          'Uma inscrição foi criada durante o salvamento e impede remover categoria ou lote. Recarregue e tente novamente.',
        );
      }
      throw error;
    }

    return this.get(userId, eventId);
  }

  private async requireEvent(userId: string, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento não encontrado.');
    if (event.organizationId) {
      await this.authorization.requireRole(userId, event.organizationId, EVENT_EDITOR_ROLES);
    } else if (event.ownerId !== userId) {
      throw new NotFoundException('Evento não encontrado.');
    }
    if (!event.organizationId) {
      throw new BadRequestException('O evento precisa estar vinculado a uma organização.');
    }
    return event;
  }

  private async requireMutableEvent(userId: string, eventId: string) {
    const event = await this.requireEvent(userId, eventId);
    this.mutationPolicy.assertFoundationMutable(event.status);
    return event;
  }
}
