import { Prisma } from '@prisma/client';

type Scope = { reservationId: string; eventId: string; organizationId: string };
type DayScope = Scope & { day: Date };
type CheckInRow = {
  eventId: string;
  organizationId: string;
  checkedInAt: Date;
  reversedAt: Date | null;
  reversalReason: string | null;
};

export class CheckInRecordError extends Error {
  constructor(readonly code: 'SCOPE' | 'ABSENT') {
    super(code);
    this.name = 'CheckInRecordError';
  }
}

export function activeCheckedInAt(row: { checkedInAt: Date; reversedAt: Date | null } | null | undefined): string | null {
  if (!row || row.reversedAt) return null;
  return row.checkedInAt.toISOString();
}

export function activeDeliveredAt(row: { deliveredAt: Date; reversedAt: Date | null } | null | undefined): string | null {
  if (!row || row.reversedAt) return null;
  return row.deliveredAt.toISOString();
}

function sameScope(row: { eventId: string; organizationId: string }, scope: Scope) {
  return row.eventId === scope.eventId && row.organizationId === scope.organizationId;
}

async function audit(
  tx: Prisma.TransactionClient,
  scope: Scope,
  actorUserId: string | null,
  action: string,
  metadata: Prisma.InputJsonObject,
) {
  await tx.auditLog.create({
    data: {
      organizationId: scope.organizationId,
      eventId: scope.eventId,
      actorUserId,
      action,
      entityType: 'EventRegistrationReservation',
      entityId: scope.reservationId,
      metadata,
    },
  });
}

export async function recordCheckIn(
  tx: Prisma.TransactionClient,
  scope: Scope,
  actorUserId: string | null,
  metadata: Prisma.InputJsonObject,
  repeatedAction?: string,
): Promise<{ checkedInAt: Date; alreadyCheckedIn: boolean; restored: boolean }> {
  const existing = await tx.eventRegistrationCheckIn.findUnique({
    where: { reservationId: scope.reservationId },
    select: { eventId: true, organizationId: true, checkedInAt: true, reversedAt: true, reversalReason: true },
  });
  if (existing && !sameScope(existing, scope)) throw new CheckInRecordError('SCOPE');
  if (existing && !existing.reversedAt) {
    if (repeatedAction) {
      await audit(tx, scope, actorUserId, repeatedAction, { ...metadata, checkedInAt: existing.checkedInAt.toISOString() });
    }
    return { checkedInAt: existing.checkedInAt, alreadyCheckedIn: true, restored: false };
  }
  const checkedInAt = new Date();
  if (existing?.reversedAt) return restoreCheckIn(tx, scope, actorUserId, metadata, existing, checkedInAt);
  try {
    await tx.eventRegistrationCheckIn.create({ data: { ...scope, actorUserId, checkedInAt } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const raced = await tx.eventRegistrationCheckIn.findUnique({
      where: { reservationId: scope.reservationId },
      select: { eventId: true, organizationId: true, checkedInAt: true, reversedAt: true },
    });
    if (!raced || !sameScope(raced, scope) || raced.reversedAt) throw error;
    return { checkedInAt: raced.checkedInAt, alreadyCheckedIn: true, restored: false };
  }
  await audit(tx, scope, actorUserId, 'registration.checked_in', { ...metadata, checkedInAt: checkedInAt.toISOString() });
  return { checkedInAt, alreadyCheckedIn: false, restored: false };
}

async function restoreCheckIn(
  tx: Prisma.TransactionClient,
  scope: Scope,
  actorUserId: string | null,
  metadata: Prisma.InputJsonObject,
  existing: CheckInRow,
  checkedInAt: Date,
) {
  await tx.eventRegistrationCheckIn.update({
    where: { reservationId: scope.reservationId },
    data: { checkedInAt, actorUserId, reversedAt: null, reversedByUserId: null, reversalReason: null },
  });
  await audit(tx, scope, actorUserId, 'registration.checked_in_restored', {
    ...metadata,
    checkedInAt: checkedInAt.toISOString(),
    previousReversedAt: existing.reversedAt!.toISOString(),
    previousReason: existing.reversalReason,
  });
  return { checkedInAt, alreadyCheckedIn: false, restored: true };
}

export async function reverseCheckIn(
  tx: Prisma.TransactionClient,
  scope: Scope,
  actorUserId: string,
  reason: string,
): Promise<{ reversedAt: Date; checkedInAt: Date }> {
  const existing = await tx.eventRegistrationCheckIn.findUnique({
    where: { reservationId: scope.reservationId },
    select: { eventId: true, organizationId: true, checkedInAt: true, reversedAt: true },
  });
  if (!existing || existing.reversedAt) throw new CheckInRecordError('ABSENT');
  if (!sameScope(existing, scope)) throw new CheckInRecordError('SCOPE');
  const reversedAt = new Date();
  await tx.eventRegistrationCheckIn.update({
    where: { reservationId: scope.reservationId },
    data: { reversedAt, reversedByUserId: actorUserId, reversalReason: reason },
  });
  await audit(tx, scope, actorUserId, 'registration.check_in_reversed', {
    reason,
    reversedAt: reversedAt.toISOString(),
    checkedInAt: existing.checkedInAt.toISOString(),
  });
  return { reversedAt, checkedInAt: existing.checkedInAt };
}

export async function recordMaterial(
  tx: Prisma.TransactionClient,
  scope: Scope,
  actorUserId: string,
): Promise<{ deliveredAt: Date; alreadyDelivered: boolean; restored: boolean }> {
  const existing = await tx.eventMaterialDelivery.findUnique({
    where: { reservationId: scope.reservationId },
    select: { eventId: true, organizationId: true, deliveredAt: true, reversedAt: true, reversalReason: true },
  });
  if (existing && !sameScope(existing, scope)) throw new CheckInRecordError('SCOPE');
  if (existing && !existing.reversedAt) return { deliveredAt: existing.deliveredAt, alreadyDelivered: true, restored: false };
  const deliveredAt = new Date();
  if (existing?.reversedAt) {
    await tx.eventMaterialDelivery.update({
      where: { reservationId: scope.reservationId },
      data: { deliveredAt, actorUserId, reversedAt: null, reversedByUserId: null, reversalReason: null },
    });
    await audit(tx, scope, actorUserId, 'registration.material_restored', {
      deliveredAt: deliveredAt.toISOString(),
      previousReversedAt: existing.reversedAt.toISOString(),
      previousReason: existing.reversalReason,
    });
    return { deliveredAt, alreadyDelivered: false, restored: true };
  }
  try {
    await tx.eventMaterialDelivery.create({ data: { ...scope, actorUserId, deliveredAt } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const raced = await tx.eventMaterialDelivery.findUnique({
      where: { reservationId: scope.reservationId },
      select: { eventId: true, organizationId: true, deliveredAt: true, reversedAt: true },
    });
    if (!raced || !sameScope(raced, scope) || raced.reversedAt) throw error;
    return { deliveredAt: raced.deliveredAt, alreadyDelivered: true, restored: false };
  }
  await audit(tx, scope, actorUserId, 'registration.material_delivered', { deliveredAt: deliveredAt.toISOString() });
  return { deliveredAt, alreadyDelivered: false, restored: false };
}

export async function reverseMaterial(
  tx: Prisma.TransactionClient,
  scope: Scope,
  actorUserId: string,
  reason: string,
): Promise<{ reversedAt: Date }> {
  const existing = await tx.eventMaterialDelivery.findUnique({
    where: { reservationId: scope.reservationId },
    select: { eventId: true, organizationId: true, deliveredAt: true, reversedAt: true },
  });
  if (!existing || existing.reversedAt) throw new CheckInRecordError('ABSENT');
  if (!sameScope(existing, scope)) throw new CheckInRecordError('SCOPE');
  const reversedAt = new Date();
  await tx.eventMaterialDelivery.update({
    where: { reservationId: scope.reservationId },
    data: { reversedAt, reversedByUserId: actorUserId, reversalReason: reason },
  });
  await audit(tx, scope, actorUserId, 'registration.material_reversed', {
    reason,
    reversedAt: reversedAt.toISOString(),
    deliveredAt: existing.deliveredAt.toISOString(),
  });
  return { reversedAt };
}

export async function recordDayPresence(
  tx: Prisma.TransactionClient,
  scope: DayScope,
  actorUserId: string,
): Promise<{ recordedAt: Date; alreadyRecorded: boolean; restored: boolean }> {
  const existing = await tx.eventDayPresence.findUnique({
    where: { reservationId_day: { reservationId: scope.reservationId, day: scope.day } },
    select: { eventId: true, organizationId: true, recordedAt: true, reversedAt: true, reversalReason: true },
  });
  if (existing && !sameScope(existing, scope)) throw new CheckInRecordError('SCOPE');
  if (existing && !existing.reversedAt) return { recordedAt: existing.recordedAt, alreadyRecorded: true, restored: false };
  const recordedAt = new Date();
  const day = scope.day.toISOString().slice(0, 10);
  if (existing?.reversedAt) {
    await tx.eventDayPresence.update({
      where: { reservationId_day: { reservationId: scope.reservationId, day: scope.day } },
      data: { recordedAt, actorUserId, reversedAt: null, reversedByUserId: null, reversalReason: null },
    });
    await audit(tx, scope, actorUserId, 'registration.day_presence_restored', {
      day,
      recordedAt: recordedAt.toISOString(),
      previousReversedAt: existing.reversedAt.toISOString(),
      previousReason: existing.reversalReason,
    });
    return { recordedAt, alreadyRecorded: false, restored: true };
  }
  try {
    await tx.eventDayPresence.create({
      data: { ...scope, actorUserId, recordedAt },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const raced = await tx.eventDayPresence.findUnique({
      where: { reservationId_day: { reservationId: scope.reservationId, day: scope.day } },
      select: { eventId: true, organizationId: true, recordedAt: true, reversedAt: true },
    });
    if (!raced || !sameScope(raced, scope) || raced.reversedAt) throw error;
    return { recordedAt: raced.recordedAt, alreadyRecorded: true, restored: false };
  }
  await audit(tx, scope, actorUserId, 'registration.day_presence_recorded', { day, recordedAt: recordedAt.toISOString() });
  return { recordedAt, alreadyRecorded: false, restored: false };
}

export async function reverseDayPresence(
  tx: Prisma.TransactionClient,
  scope: DayScope,
  actorUserId: string,
  reason: string,
): Promise<{ reversedAt: Date }> {
  const existing = await tx.eventDayPresence.findUnique({
    where: { reservationId_day: { reservationId: scope.reservationId, day: scope.day } },
    select: { eventId: true, organizationId: true, recordedAt: true, reversedAt: true },
  });
  if (!existing || existing.reversedAt) throw new CheckInRecordError('ABSENT');
  if (!sameScope(existing, scope)) throw new CheckInRecordError('SCOPE');
  const reversedAt = new Date();
  await tx.eventDayPresence.update({
    where: { reservationId_day: { reservationId: scope.reservationId, day: scope.day } },
    data: { reversedAt, reversedByUserId: actorUserId, reversalReason: reason },
  });
  await audit(tx, scope, actorUserId, 'registration.day_presence_reversed', {
    day: scope.day.toISOString().slice(0, 10),
    reason,
    reversedAt: reversedAt.toISOString(),
    recordedAt: existing.recordedAt.toISOString(),
  });
  return { reversedAt };
}
