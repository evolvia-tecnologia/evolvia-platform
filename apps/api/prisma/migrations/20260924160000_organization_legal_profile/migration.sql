-- Perfil legal brasileiro por organização. Nenhum dado existente é inferido da conta pessoal.
CREATE TYPE "OrganizationLegalKind" AS ENUM ('PERSON', 'COMPANY');

CREATE TABLE "OrganizationLegalProfile" (
  "organizationId" TEXT NOT NULL,
  "kind" "OrganizationLegalKind" NOT NULL,
  "legalName" VARCHAR(160) NOT NULL,
  "tradeName" VARCHAR(160),
  "taxId" VARCHAR(14) NOT NULL,
  "contactEmail" VARCHAR(160) NOT NULL,
  "postalCode" VARCHAR(8) NOT NULL,
  "street" VARCHAR(160) NOT NULL,
  "number" VARCHAR(20) NOT NULL,
  "complement" VARCHAR(100),
  "district" VARCHAR(100) NOT NULL,
  "city" VARCHAR(100) NOT NULL,
  "state" VARCHAR(2) NOT NULL,
  "country" VARCHAR(2) NOT NULL DEFAULT 'BR',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationLegalProfile_pkey" PRIMARY KEY ("organizationId")
);

ALTER TABLE "OrganizationLegalProfile"
  ADD CONSTRAINT "OrganizationLegalProfile_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
