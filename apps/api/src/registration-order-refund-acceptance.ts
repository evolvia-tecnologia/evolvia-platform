import { ConflictException } from '@nestjs/common';
import type { PrismaService } from './prisma.service';

/**
 * Nenhum checkout agrupado novo pode chamar o provedor antes de existir
 * aceite financeiro persistido para todas as entradas da compra.
 * O G2.11 grava as aceitações na mesma transação; esta é a barreira final.
 */
export async function requirePersistedGroupRefundConsent(
  prisma: PrismaService,
  scope: { orderId: string; eventId: string; organizationId: string },
) {
  const tables = await prisma.$queryRaw<Array<{ ready: boolean }>>`
    SELECT (to_regclass('"RegistrationRefundAcceptance"') IS NOT NULL
      AND to_regclass('"EventRefundPolicy"') IS NOT NULL) AS "ready"
  `;
  if (!tables[0]?.ready) {
    throw new ConflictException('Pagamento agrupado bloqueado: política de reembolso ainda não integrada.');
  }
  const rows = await prisma.$queryRaw<Array<{ total: number; accepted: number }>>`
    SELECT COUNT(*)::int AS "total",
      COUNT(*) FILTER (WHERE a."reservationId" IS NOT NULL
        AND p."version" = a."version"
        AND r."registrationData"->>'refund_policy_acceptance' = 'true'
        AND r."registrationData"->>'refund_policy_version' = a."version"::text
        AND r."status" = 'PENDING_PAYMENT'
        AND r."finalPriceCents" > 0)::int AS "accepted"
    FROM "EventRegistrationOrderEntry" e
    LEFT JOIN "EventRegistrationReservation" r
      ON r."id" = e."reservationId"
       AND r."eventId" = e."eventId"
       AND r."organizationId" = e."organizationId"
    LEFT JOIN "RegistrationRefundAcceptance" a
      ON a."reservationId" = r."id"
       AND a."eventId" = e."eventId"
       AND a."organizationId" = e."organizationId"
    LEFT JOIN "EventRefundPolicy" p
      ON p."eventId" = e."eventId"
       AND p."organizationId" = e."organizationId"
    WHERE e."orderId" = ${scope.orderId}
      AND e."eventId" = ${scope.eventId}
      AND e."organizationId" = ${scope.organizationId}
  `;
  const row = rows[0];
  if (!row || row.total < 2 || row.total > 10 || row.accepted !== row.total) {
    throw new ConflictException('Pagamento agrupado bloqueado: aceites de reembolso incompletos ou desatualizados.');
  }
}
