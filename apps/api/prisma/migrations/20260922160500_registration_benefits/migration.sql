CREATE TYPE "RegistrationBenefitKind" AS ENUM ('COUPON', 'INVITATION', 'COURTESY');

CREATE TABLE "EventRegistrationBenefitCatalog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventRegistrationBenefitCatalog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventRegistrationBenefit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "RegistrationBenefitKind" NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "maxUses" INTEGER NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventRegistrationBenefit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EventRegistrationBenefit_discountPercent_check" CHECK ("discountPercent" BETWEEN 0 AND 100),
    CONSTRAINT "EventRegistrationBenefit_maxUses_check" CHECK ("maxUses" BETWEEN 1 AND 1000000),
    CONSTRAINT "EventRegistrationBenefit_usedCount_check" CHECK ("usedCount" >= 0 AND "usedCount" <= "maxUses"),
    CONSTRAINT "EventRegistrationBenefit_period_check" CHECK ("validFrom" < "validUntil")
);

CREATE UNIQUE INDEX "EventRegistrationBenefitCatalog_eventId_organizationId_key"
ON "EventRegistrationBenefitCatalog"("eventId", "organizationId");
CREATE UNIQUE INDEX "EventRegistrationBenefitCatalog_id_eventId_organizationId_key"
ON "EventRegistrationBenefitCatalog"("id", "eventId", "organizationId");
CREATE INDEX "EventRegistrationBenefitCatalog_organizationId_eventId_idx"
ON "EventRegistrationBenefitCatalog"("organizationId", "eventId");
CREATE UNIQUE INDEX "EventRegistrationBenefit_eventId_code_key"
ON "EventRegistrationBenefit"("eventId", "code");
CREATE INDEX "EventRegistrationBenefit_organizationId_eventId_kind_active_idx"
ON "EventRegistrationBenefit"("organizationId", "eventId", "kind", "active");
CREATE INDEX "EventRegistrationBenefit_catalogId_sortOrder_idx"
ON "EventRegistrationBenefit"("catalogId", "sortOrder");

ALTER TABLE "EventRegistrationBenefitCatalog"
ADD CONSTRAINT "EventRegistrationBenefitCatalog_eventId_organizationId_fkey"
FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventRegistrationBenefit"
ADD CONSTRAINT "EventRegistrationBenefit_catalogId_eventId_organizationId_fkey"
FOREIGN KEY ("catalogId", "eventId", "organizationId")
REFERENCES "EventRegistrationBenefitCatalog"("id", "eventId", "organizationId")
ON DELETE CASCADE ON UPDATE CASCADE;
