CREATE TYPE "OperatorPermission" AS ENUM ('CHECK_IN', 'ACCREDITATION', 'REGISTRATION_CREATE', 'BADGE_PRINT', 'KIOSK_OPERATE', 'KIOSK_CONFIGURE');

CREATE TABLE "EventOperatorAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissions" "OperatorPermission"[] NOT NULL DEFAULT ARRAY[]::"OperatorPermission"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventOperatorAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventOperatorAssignment_eventId_userId_key" ON "EventOperatorAssignment"("eventId", "userId");
CREATE INDEX "EventOperatorAssignment_userId_active_idx" ON "EventOperatorAssignment"("userId", "active");
CREATE INDEX "EventOperatorAssignment_organizationId_eventId_idx" ON "EventOperatorAssignment"("organizationId", "eventId");

ALTER TABLE "EventOperatorAssignment"
  ADD CONSTRAINT "EventOperatorAssignment_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventOperatorAssignment"
  ADD CONSTRAINT "EventOperatorAssignment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
