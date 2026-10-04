CREATE TYPE "ExhibitorFormAudience" AS ENUM ('EXHIBITOR', 'PROVIDER', 'BOTH');
CREATE TYPE "ExhibitorFormKind" AS ENUM ('CREDENTIAL', 'REQUEST', 'DOCUMENT');

CREATE TABLE "EventExhibitorForm" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 1,
  "title" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "deadline" TIMESTAMP(3),
  "audience" "ExhibitorFormAudience" NOT NULL,
  "kind" "ExhibitorFormKind" NOT NULL,
  "credentialKind" "ExhibitorCredentialKind",
  "pdfUrl" TEXT NOT NULL DEFAULT '',
  "wordUrl" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventExhibitorForm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventExhibitorForm_id_eventId_organizationId_key" ON "EventExhibitorForm"("id", "eventId", "organizationId");
CREATE INDEX "EventExhibitorForm_organizationId_eventId_audience_active_idx" ON "EventExhibitorForm"("organizationId", "eventId", "audience", "active");

ALTER TABLE "EventExhibitorForm" ADD CONSTRAINT "EventExhibitorForm_eventId_organizationId_fkey" FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "EventExhibitorProduct") THEN
    RAISE EXCEPTION 'A tabela de produtos do expositor já tem linhas. Cada produto precisa nascer dentro de um formulário.';
  END IF;
END $$;

DROP INDEX "EventExhibitorProduct_organizationId_eventId_active_idx";
ALTER TABLE "EventExhibitorProduct" DROP COLUMN "formTitle";
ALTER TABLE "EventExhibitorProduct" ADD COLUMN "formId" TEXT NOT NULL;
CREATE INDEX "EventExhibitorProduct_organizationId_eventId_formId_active_idx" ON "EventExhibitorProduct"("organizationId", "eventId", "formId", "active");
ALTER TABLE "EventExhibitorProduct" ADD CONSTRAINT "EventExhibitorProduct_formId_eventId_organizationId_fkey" FOREIGN KEY ("formId", "eventId", "organizationId") REFERENCES "EventExhibitorForm"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
