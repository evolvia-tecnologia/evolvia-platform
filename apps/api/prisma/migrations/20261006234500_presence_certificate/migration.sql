-- Certificado gratuito de participação, só com presença registrada.
-- Migration aditiva. O rollback operacional desliga a liberação e preserva os certificados já emitidos.

CREATE TABLE "EventCertificateSetting" (
  "eventId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "hours" INTEGER,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventCertificateSetting_pkey" PRIMARY KEY ("eventId")
);

CREATE TABLE "EventCertificate" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "code" VARCHAR(32) NOT NULL,
  "displayName" VARCHAR(180) NOT NULL,
  "hours" INTEGER,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventCertificate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventCertificateSetting_eventId_organizationId_key" ON "EventCertificateSetting"("eventId", "organizationId");
CREATE INDEX "EventCertificateSetting_organizationId_eventId_idx" ON "EventCertificateSetting"("organizationId", "eventId");
CREATE UNIQUE INDEX "EventCertificate_reservationId_key" ON "EventCertificate"("reservationId");
CREATE UNIQUE INDEX "EventCertificate_reservationId_eventId_organizationId_key" ON "EventCertificate"("reservationId", "eventId", "organizationId");
CREATE UNIQUE INDEX "EventCertificate_code_key" ON "EventCertificate"("code");
CREATE INDEX "EventCertificate_organizationId_eventId_issuedAt_idx" ON "EventCertificate"("organizationId", "eventId", "issuedAt");

ALTER TABLE "EventCertificateSetting" ADD CONSTRAINT "EventCertificateSetting_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventCertificate" ADD CONSTRAINT "EventCertificate_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventCertificate" ADD CONSTRAINT "EventCertificate_reservationId_eventId_organizationId_fkey"
  FOREIGN KEY ("reservationId", "eventId", "organizationId") REFERENCES "EventRegistrationReservation"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
