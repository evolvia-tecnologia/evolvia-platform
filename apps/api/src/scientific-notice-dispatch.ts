import type { PrismaService } from './prisma.service';

export const SCIENTIFIC_NOTICE_MAX_ATTEMPTS = 3;
const CLAIM_EXPIRY_MS = 2 * 60_000;
const RETRY_DELAY_MS = 60_000;
type Store = Pick<PrismaService, 'scientificNoticeDispatch'>;
type Claim = {
  idempotencyKey: string;
  organizationId: string;
  eventId: string;
  submissionId: string;
  versionNumber: number;
};

function uniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && error.code === 'P2002';
}

/**
 * G5.8: só a instância que CRIA a linha ou vence updateMany de FAILED
 * pode chamar a rede. A chave permanece estável em todos os retries.
 *
 * Um PROCESSING abandonado pode ter enviado a mensagem antes do crash;
 * transiciona para UNKNOWN sem novo POST automático. O operador ou um
 * reconciliador autenticado precisa provar ausência/aceite antes de retomar.
 */
export async function claimScientificNoticeDispatch(
  store: Store,
  input: Claim,
  now = new Date(),
): Promise<boolean> {
  try {
    await store.scientificNoticeDispatch.create({
      data: { ...input, status: 'PROCESSING', attempts: 1, claimedAt: now },
    });
    return true;
  } catch (error) {
    if (!uniqueConflict(error)) throw error;
  }
  const existing = await store.scientificNoticeDispatch.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { organizationId: true, eventId: true, submissionId: true,
      versionNumber: true, status: true, attempts: true, claimedAt: true },
  });
  if (!existing) return false;
  // Uma chave de hash nunca pode saltar para outro escopo por colisão/má configuração.
  if (existing.organizationId !== input.organizationId ||
      existing.eventId !== input.eventId ||
      existing.submissionId !== input.submissionId ||
      existing.versionNumber !== input.versionNumber) {
    throw new Error('scientific_notice_dispatch_scope_mismatch');
  }
  if (existing.status === 'PROCESSING' &&
      existing.claimedAt.getTime() <= now.getTime() - CLAIM_EXPIRY_MS) {
    await store.scientificNoticeDispatch.updateMany({
      where: { idempotencyKey: input.idempotencyKey, status: 'PROCESSING',
        claimedAt: { lte: new Date(now.getTime() - CLAIM_EXPIRY_MS) } },
      data: { status: 'UNKNOWN' },
    });
    return false;
  }
  if (existing.status !== 'FAILED' ||
      existing.attempts >= SCIENTIFIC_NOTICE_MAX_ATTEMPTS ||
      existing.claimedAt.getTime() > now.getTime() - RETRY_DELAY_MS) return false;
  const acquired = await store.scientificNoticeDispatch.updateMany({
    where: { idempotencyKey: input.idempotencyKey, status: 'FAILED',
      attempts: { lt: SCIENTIFIC_NOTICE_MAX_ATTEMPTS },
      claimedAt: { lte: new Date(now.getTime() - RETRY_DELAY_MS) } },
    data: { status: 'PROCESSING', attempts: { increment: 1 }, claimedAt: now,
      completedAt: null },
  });
  return acquired.count === 1;
}

export type NoticeDispatchOutcome = 'ACCEPTED' | 'FAILED' | 'UNKNOWN';

/** Fecha apenas o claim ainda PROCESSING; não reabre UNKNOWN/ACCEPTED. */
export async function completeScientificNoticeDispatch(
  store: Store, idempotencyKey: string, outcome: NoticeDispatchOutcome,
): Promise<void> {
  const result = await store.scientificNoticeDispatch.updateMany({
    where: { idempotencyKey, status: 'PROCESSING' },
    data: { status: outcome, completedAt: new Date() },
  });
  if (result.count !== 1) throw new Error('scientific_notice_dispatch_claim_lost');
}
