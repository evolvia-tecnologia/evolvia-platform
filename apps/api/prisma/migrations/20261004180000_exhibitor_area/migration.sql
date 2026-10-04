CREATE TYPE "ExhibitorCompanyKind" AS ENUM ('EXHIBITOR', 'PROVIDER');
CREATE TYPE "ExhibitorNationality" AS ENUM ('BRAZILIAN', 'FOREIGN');
CREATE TYPE "ExhibitorCredentialKind" AS ENUM ('EXHIBITOR', 'ASSEMBLER', 'SERVICE');
CREATE TYPE "ExhibitorOrderStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'CANCELLED');

CREATE TABLE "EventExhibitorCompany" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "kind" "ExhibitorCompanyKind" NOT NULL,
  "nationality" "ExhibitorNationality" NOT NULL,
  "document" TEXT NOT NULL,
  "loginEmail" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "tradeName" TEXT NOT NULL,
  "segment" TEXT NOT NULL DEFAULT '',
  "booth" TEXT NOT NULL DEFAULT '',
  "areaLabel" TEXT NOT NULL DEFAULT '',
  "quotaExhibitor" INTEGER NOT NULL DEFAULT 0,
  "quotaAssembler" INTEGER NOT NULL DEFAULT 0,
  "quotaService" INTEGER NOT NULL DEFAULT 0,
  "contactName" TEXT NOT NULL,
  "contactRole" TEXT NOT NULL,
  "contactEmail" TEXT NOT NULL,
  "postalCode" TEXT NOT NULL DEFAULT '',
  "street" TEXT NOT NULL DEFAULT '',
  "addressNumber" TEXT NOT NULL DEFAULT '',
  "complement" TEXT NOT NULL DEFAULT '',
  "district" TEXT NOT NULL DEFAULT '',
  "city" TEXT NOT NULL DEFAULT '',
  "state" TEXT NOT NULL DEFAULT '',
  "country" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventExhibitorCompany_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventExhibitorCredential" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "kind" "ExhibitorCredentialKind" NOT NULL,
  "nationality" "ExhibitorNationality" NOT NULL,
  "document" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "badgeName" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "phone" TEXT NOT NULL DEFAULT '',
  "mobile" TEXT NOT NULL DEFAULT '',
  "credentialedAt" TIMESTAMP(3),
  "printedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventExhibitorCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventExhibitorRepresentative" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventExhibitorRepresentative_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventExhibitorProduct" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "formTitle" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "priceCents" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventExhibitorProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventExhibitorOrder" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "status" "ExhibitorOrderStatus" NOT NULL DEFAULT 'REQUESTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventExhibitorOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventExhibitorDownload" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventExhibitorDownload_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventExhibitorMessage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventExhibitorMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventExhibitorSession" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventExhibitorSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventExhibitorCompany_eventId_document_key" ON "EventExhibitorCompany"("eventId", "document");
CREATE UNIQUE INDEX "EventExhibitorCompany_eventId_loginEmail_key" ON "EventExhibitorCompany"("eventId", "loginEmail");
CREATE UNIQUE INDEX "EventExhibitorCompany_id_eventId_organizationId_key" ON "EventExhibitorCompany"("id", "eventId", "organizationId");
CREATE INDEX "EventExhibitorCompany_organizationId_eventId_kind_idx" ON "EventExhibitorCompany"("organizationId", "eventId", "kind");

CREATE UNIQUE INDEX "EventExhibitorCredential_companyId_document_key" ON "EventExhibitorCredential"("companyId", "document");
CREATE INDEX "EventExhibitorCredential_organizationId_eventId_kind_idx" ON "EventExhibitorCredential"("organizationId", "eventId", "kind");

CREATE UNIQUE INDEX "EventExhibitorRepresentative_companyId_email_key" ON "EventExhibitorRepresentative"("companyId", "email");
CREATE INDEX "EventExhibitorRepresentative_organizationId_eventId_email_idx" ON "EventExhibitorRepresentative"("organizationId", "eventId", "email");

CREATE UNIQUE INDEX "EventExhibitorProduct_id_eventId_organizationId_key" ON "EventExhibitorProduct"("id", "eventId", "organizationId");
CREATE INDEX "EventExhibitorProduct_organizationId_eventId_active_idx" ON "EventExhibitorProduct"("organizationId", "eventId", "active");

CREATE UNIQUE INDEX "EventExhibitorOrder_companyId_productId_key" ON "EventExhibitorOrder"("companyId", "productId");
CREATE INDEX "EventExhibitorOrder_organizationId_eventId_status_idx" ON "EventExhibitorOrder"("organizationId", "eventId", "status");

CREATE INDEX "EventExhibitorDownload_organizationId_eventId_idx" ON "EventExhibitorDownload"("organizationId", "eventId");
CREATE INDEX "EventExhibitorMessage_organizationId_eventId_createdAt_idx" ON "EventExhibitorMessage"("organizationId", "eventId", "createdAt");
CREATE UNIQUE INDEX "EventExhibitorSession_tokenHash_key" ON "EventExhibitorSession"("tokenHash");
CREATE INDEX "EventExhibitorSession_organizationId_eventId_companyId_idx" ON "EventExhibitorSession"("organizationId", "eventId", "companyId");

ALTER TABLE "EventExhibitorCompany" ADD CONSTRAINT "EventExhibitorCompany_eventId_organizationId_fkey" FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventExhibitorCredential" ADD CONSTRAINT "EventExhibitorCredential_companyId_eventId_organizationId_fkey" FOREIGN KEY ("companyId", "eventId", "organizationId") REFERENCES "EventExhibitorCompany"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventExhibitorCredential" ADD CONSTRAINT "EventExhibitorCredential_eventId_organizationId_fkey" FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventExhibitorRepresentative" ADD CONSTRAINT "EventExhibitorRepresentative_companyId_eventId_organizationId_fkey" FOREIGN KEY ("companyId", "eventId", "organizationId") REFERENCES "EventExhibitorCompany"("id", "eventId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventExhibitorRepresentative" ADD CONSTRAINT "EventExhibitorRepresentative_eventId_organizationId_fkey" FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventExhibitorProduct" ADD CONSTRAINT "EventExhibitorProduct_eventId_organizationId_fkey" FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventExhibitorOrder" ADD CONSTRAINT "EventExhibitorOrder_companyId_eventId_organizationId_fkey" FOREIGN KEY ("companyId", "eventId", "organizationId") REFERENCES "EventExhibitorCompany"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventExhibitorOrder" ADD CONSTRAINT "EventExhibitorOrder_productId_eventId_organizationId_fkey" FOREIGN KEY ("productId", "eventId", "organizationId") REFERENCES "EventExhibitorProduct"("id", "eventId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventExhibitorOrder" ADD CONSTRAINT "EventExhibitorOrder_eventId_organizationId_fkey" FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventExhibitorDownload" ADD CONSTRAINT "EventExhibitorDownload_eventId_organizationId_fkey" FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventExhibitorMessage" ADD CONSTRAINT "EventExhibitorMessage_companyId_eventId_organizationId_fkey" FOREIGN KEY ("companyId", "eventId", "organizationId") REFERENCES "EventExhibitorCompany"("id", "eventId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventExhibitorMessage" ADD CONSTRAINT "EventExhibitorMessage_eventId_organizationId_fkey" FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventExhibitorSession" ADD CONSTRAINT "EventExhibitorSession_companyId_eventId_organizationId_fkey" FOREIGN KEY ("companyId", "eventId", "organizationId") REFERENCES "EventExhibitorCompany"("id", "eventId", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventExhibitorSession" ADD CONSTRAINT "EventExhibitorSession_eventId_organizationId_fkey" FOREIGN KEY ("eventId", "organizationId") REFERENCES "Event"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
