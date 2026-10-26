-- CreateTable
CREATE TABLE "EventExhibitorFormVisit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventExhibitorFormVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventExhibitorFormVisit_companyId_formId_key" ON "EventExhibitorFormVisit"("companyId", "formId");

-- CreateIndex
CREATE INDEX "EventExhibitorFormVisit_organizationId_eventId_idx" ON "EventExhibitorFormVisit"("organizationId", "eventId");

-- AddForeignKey
ALTER TABLE "EventExhibitorFormVisit" ADD CONSTRAINT "EventExhibitorFormVisit_companyId_eventId_organizationId_fkey" FOREIGN KEY ("companyId", "eventId", "organizationId") REFERENCES "EventExhibitorCompany"("id", "eventId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventExhibitorFormVisit" ADD CONSTRAINT "EventExhibitorFormVisit_formId_eventId_organizationId_fkey" FOREIGN KEY ("formId", "eventId", "organizationId") REFERENCES "EventExhibitorForm"("id", "eventId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventExhibitorFormVisit" ADD CONSTRAINT "EventExhibitorFormVisit_eventId_organizationId_fkey" FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
