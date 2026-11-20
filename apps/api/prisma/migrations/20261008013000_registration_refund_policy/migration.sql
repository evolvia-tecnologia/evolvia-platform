-- Política de reembolso visível e pedido rastreável. Só adiciona tipos e tabelas.
CREATE TYPE "RegistrationRefundWindow" AS ENUM ('NONE', 'DAYS_30', 'DAYS_7', 'DAYS_1', 'ANYTIME');
CREATE TYPE "RegistrationRefundRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');

CREATE TABLE "EventRefundPolicy" (
  "eventId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "window" "RegistrationRefundWindow" NOT NULL,
  "version" INTEGER NOT NULL,
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventRefundPolicy_pkey" PRIMARY KEY ("eventId", "organizationId")
);

CREATE TABLE "EventRefundPolicyVersion" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "window" "RegistrationRefundWindow" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventRefundPolicyVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RegistrationRefundAcceptance" (
  "reservationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "policyVersionId" TEXT NOT NULL,
  "window" "RegistrationRefundWindow" NOT NULL,
  "version" INTEGER NOT NULL,
  "deadlineAt" TIMESTAMP(3),
  "pendingCode" VARCHAR(20),
  "acceptedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegistrationRefundAcceptance_pkey" PRIMARY KEY ("reservationId")
);

CREATE TABLE "RegistrationRefundRequest" (
  "id" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "status" "RegistrationRefundRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "decisionNote" VARCHAR(500),
  "requestedByUserId" TEXT,
  "decidedByUserId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RegistrationRefundRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventRefundPolicyVersion_eventId_organizationId_version_key" ON "EventRefundPolicyVersion"("eventId", "organizationId", "version");
CREATE UNIQUE INDEX "EventRefundPolicyVersion_id_eventId_organizationId_key" ON "EventRefundPolicyVersion"("id", "eventId", "organizationId");
CREATE INDEX "EventRefundPolicyVersion_organizationId_eventId_idx" ON "EventRefundPolicyVersion"("organizationId", "eventId");
CREATE INDEX "EventRefundPolicy_organizationId_eventId_idx" ON "EventRefundPolicy"("organizationId", "eventId");
CREATE UNIQUE INDEX "RegistrationRefundAcceptance_reservationId_eventId_organizationId_key" ON "RegistrationRefundAcceptance"("reservationId", "eventId", "organizationId");
CREATE INDEX "RegistrationRefundAcceptance_organizationId_eventId_idx" ON "RegistrationRefundAcceptance"("organizationId", "eventId");
CREATE INDEX "RegistrationRefundAcceptance_policyVersionId_idx" ON "RegistrationRefundAcceptance"("policyVersionId");
CREATE UNIQUE INDEX "RegistrationRefundRequest_reservationId_key" ON "RegistrationRefundRequest"("reservationId");
CREATE UNIQUE INDEX "RegistrationRefundRequest_reservationId_eventId_organizationId_key" ON "RegistrationRefundRequest"("reservationId", "eventId", "organizationId");
CREATE INDEX "RegistrationRefundRequest_organizationId_eventId_status_createdAt_idx" ON "RegistrationRefundRequest"("organizationId", "eventId", "status", "createdAt");

ALTER TABLE "EventRefundPolicy" ADD CONSTRAINT "EventRefundPolicy_eventId_organizationId_fkey" FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventRefundPolicyVersion" ADD CONSTRAINT "EventRefundPolicyVersion_eventId_organizationId_fkey" FOREIGN KEY ("eventId", "organizationId") REFERENCES "EventRefundPolicy"("eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegistrationRefundAcceptance" ADD CONSTRAINT "RegistrationRefundAcceptance_reservationId_eventId_organizationId_fkey" FOREIGN KEY ("reservationId", "eventId", "organizationId") REFERENCES "EventRegistrationReservation"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegistrationRefundAcceptance" ADD CONSTRAINT "RegistrationRefundAcceptance_policyVersionId_eventId_organizationId_fkey" FOREIGN KEY ("policyVersionId", "eventId", "organizationId") REFERENCES "EventRefundPolicyVersion"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegistrationRefundRequest" ADD CONSTRAINT "RegistrationRefundRequest_reservationId_eventId_organizationId_fkey" FOREIGN KEY ("reservationId", "eventId", "organizationId") REFERENCES "EventRegistrationReservation"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
