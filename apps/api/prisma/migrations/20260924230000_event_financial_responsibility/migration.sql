CREATE TABLE "EventFinancialResponsibility" (
  "eventId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sellerLegalProfileRevision" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventFinancialResponsibility_pkey" PRIMARY KEY ("eventId")
);
CREATE INDEX "EventFinancialResponsibility_organizationId_eventId_idx"
  ON "EventFinancialResponsibility"("organizationId", "eventId");
ALTER TABLE "EventFinancialResponsibility"
  ADD CONSTRAINT "EventFinancialResponsibility_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
