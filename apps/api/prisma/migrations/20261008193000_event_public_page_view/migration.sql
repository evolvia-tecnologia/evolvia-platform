-- Visitas agregadas da página pública, por evento e dia. Sem pessoa, IP ou origem.

CREATE TABLE "EventPublicPageView" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventPublicPageView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventPublicPageView_eventId_day_key" ON "EventPublicPageView"("eventId", "day");
CREATE INDEX "EventPublicPageView_organizationId_eventId_idx" ON "EventPublicPageView"("organizationId", "eventId");

ALTER TABLE "EventPublicPageView" ADD CONSTRAINT "EventPublicPageView_eventId_organizationId_fkey" FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
