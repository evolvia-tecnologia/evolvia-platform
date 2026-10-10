-- Papéis de certificado além da participação: atividade, trabalho, apresentação, convidado e avaliador.
-- Migration aditiva. Cada papel nasce desligado. O rollback operacional desliga a liberação e preserva os certificados já emitidos.

CREATE TABLE "EventCertificateRoleSetting" (
  "eventId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "role" VARCHAR(32) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "releaseMode" VARCHAR(16) NOT NULL DEFAULT 'manual',
  "releaseDays" INTEGER NOT NULL DEFAULT 0,
  "hours" INTEGER,
  "title" VARCHAR(240) NOT NULL,
  "body" VARCHAR(4000) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventCertificateRoleSetting_pkey" PRIMARY KEY ("eventId", "role"),
  CONSTRAINT "EventCertificateRoleSetting_role_check" CHECK ("role" IN ('activity', 'approved_submission', 'presentation', 'guest', 'reviewer')),
  CONSTRAINT "EventCertificateRoleSetting_release_check" CHECK ("releaseMode" IN ('manual', 'after_end')),
  CONSTRAINT "EventCertificateRoleSetting_days_check" CHECK ("releaseDays" BETWEEN 0 AND 30),
  CONSTRAINT "EventCertificateRoleSetting_hours_check" CHECK ("hours" IS NULL OR ("hours" BETWEEN 1 AND 999))
);

CREATE TABLE "EventRoleCertificate" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "role" VARCHAR(32) NOT NULL,
  "reservationId" TEXT,
  "personId" TEXT,
  "activityId" TEXT,
  "submissionId" TEXT,
  "code" VARCHAR(32) NOT NULL,
  "displayName" VARCHAR(180) NOT NULL,
  "subjectLabel" VARCHAR(240) NOT NULL,
  "paperRole" VARCHAR(40),
  "hours" INTEGER,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "issuedByUserId" TEXT,
  CONSTRAINT "EventRoleCertificate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventRoleCertificate_role_check" CHECK ("role" IN ('activity', 'approved_submission', 'presentation', 'guest', 'reviewer')),
  CONSTRAINT "EventRoleCertificate_hours_check" CHECK ("hours" IS NULL OR ("hours" BETWEEN 1 AND 999)),
  CONSTRAINT "EventRoleCertificate_subject_check" CHECK (
    ("role" = 'activity' AND "reservationId" IS NOT NULL AND "activityId" IS NOT NULL) OR
    ("role" = 'approved_submission' AND "personId" IS NOT NULL AND "submissionId" IS NOT NULL) OR
    ("role" = 'presentation' AND "personId" IS NOT NULL AND "submissionId" IS NOT NULL) OR
    ("role" = 'guest' AND "personId" IS NOT NULL) OR
    ("role" = 'reviewer' AND "personId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "EventCertificateRoleSetting_eventId_organizationId_role_key" ON "EventCertificateRoleSetting"("eventId", "organizationId", "role");
CREATE INDEX "EventCertificateRoleSetting_organizationId_eventId_idx" ON "EventCertificateRoleSetting"("organizationId", "eventId");
CREATE UNIQUE INDEX "EventRoleCertificate_code_key" ON "EventRoleCertificate"("code");
CREATE INDEX "EventRoleCertificate_organizationId_eventId_role_issuedAt_idx" ON "EventRoleCertificate"("organizationId", "eventId", "role", "issuedAt");
CREATE INDEX "EventRoleCertificate_eventId_reservationId_role_idx" ON "EventRoleCertificate"("eventId", "reservationId", "role");
CREATE INDEX "EventRoleCertificate_eventId_personId_role_idx" ON "EventRoleCertificate"("eventId", "personId", "role");

CREATE UNIQUE INDEX "EventRoleCertificate_activity_key" ON "EventRoleCertificate"("eventId", "organizationId", "reservationId", "activityId") WHERE "role" = 'activity';
CREATE UNIQUE INDEX "EventRoleCertificate_submission_key" ON "EventRoleCertificate"("eventId", "organizationId", "personId", "submissionId") WHERE "role" = 'approved_submission';
CREATE UNIQUE INDEX "EventRoleCertificate_presentation_key" ON "EventRoleCertificate"("eventId", "organizationId", "personId", "submissionId") WHERE "role" = 'presentation';
CREATE UNIQUE INDEX "EventRoleCertificate_guest_key" ON "EventRoleCertificate"("eventId", "organizationId", "personId") WHERE "role" = 'guest';
CREATE UNIQUE INDEX "EventRoleCertificate_reviewer_key" ON "EventRoleCertificate"("eventId", "organizationId", "personId") WHERE "role" = 'reviewer';

ALTER TABLE "EventCertificateRoleSetting" ADD CONSTRAINT "EventCertificateRoleSetting_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventRoleCertificate" ADD CONSTRAINT "EventRoleCertificate_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventRoleCertificate" ADD CONSTRAINT "EventRoleCertificate_reservationId_eventId_organizationId_fkey"
  FOREIGN KEY ("reservationId", "eventId", "organizationId") REFERENCES "EventRegistrationReservation"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventRoleCertificate" ADD CONSTRAINT "EventRoleCertificate_personId_eventId_organizationId_fkey"
  FOREIGN KEY ("personId", "eventId", "organizationId") REFERENCES "ScientificPerson"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventRoleCertificate" ADD CONSTRAINT "EventRoleCertificate_activityId_eventId_organizationId_fkey"
  FOREIGN KEY ("activityId", "eventId", "organizationId") REFERENCES "ScientificProgramActivity"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventRoleCertificate" ADD CONSTRAINT "EventRoleCertificate_submissionId_eventId_organizationId_fkey"
  FOREIGN KEY ("submissionId", "eventId", "organizationId") REFERENCES "ScientificSubmission"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
