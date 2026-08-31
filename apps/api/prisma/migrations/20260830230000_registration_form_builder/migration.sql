CREATE TABLE "EventRegistrationForm" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "fields" JSONB NOT NULL,
  "publishedVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventRegistrationForm_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventRegistrationForm_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "EventRegistrationForm_published_version_check" CHECK ("publishedVersion" >= 0)
);

CREATE TABLE "EventRegistrationFormVersion" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "formId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "schema" JSONB NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventRegistrationFormVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventRegistrationFormVersion_version_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "EventRegistrationForm_eventId_organizationId_key" ON "EventRegistrationForm"("eventId", "organizationId");
CREATE UNIQUE INDEX "EventRegistrationForm_id_eventId_organizationId_key" ON "EventRegistrationForm"("id", "eventId", "organizationId");
CREATE INDEX "EventRegistrationForm_organizationId_eventId_idx" ON "EventRegistrationForm"("organizationId", "eventId");
CREATE UNIQUE INDEX "EventRegistrationFormVersion_formId_version_key" ON "EventRegistrationFormVersion"("formId", "version");
CREATE INDEX "EventRegistrationFormVersion_organizationId_eventId_version_idx" ON "EventRegistrationFormVersion"("organizationId", "eventId", "version");

ALTER TABLE "EventRegistrationForm" ADD CONSTRAINT "EventRegistrationForm_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventRegistrationFormVersion" ADD CONSTRAINT "EventRegistrationFormVersion_formId_eventId_organizationId_fkey"
  FOREIGN KEY ("formId", "eventId", "organizationId") REFERENCES "EventRegistrationForm"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
