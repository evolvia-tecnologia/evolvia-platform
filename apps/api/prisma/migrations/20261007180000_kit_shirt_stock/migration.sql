-- Kit e camisas por tamanho. Tabelas novas e colunas nulas ou com padrão.
-- A retirada genérica continua com sizeId nulo.

CREATE TABLE "EventKitConfig" (
  "eventId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "shirtsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventKitConfig_pkey" PRIMARY KEY ("eventId", "organizationId")
);

CREATE INDEX "EventKitConfig_organizationId_idx" ON "EventKitConfig"("organizationId");

ALTER TABLE "EventKitConfig"
  ADD CONSTRAINT "EventKitConfig_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId")
  REFERENCES "Event"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EventKitSize" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "label" VARCHAR(40) NOT NULL,
  "stockQuantity" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EventKitSize_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventKitSize_stockQuantity_check" CHECK ("stockQuantity" >= 0)
);

CREATE UNIQUE INDEX "EventKitSize_eventId_organizationId_label_key"
  ON "EventKitSize"("eventId", "organizationId", "label");

CREATE INDEX "EventKitSize_organizationId_eventId_active_idx"
  ON "EventKitSize"("organizationId", "eventId", "active");

ALTER TABLE "EventKitSize"
  ADD CONSTRAINT "EventKitSize_eventId_organizationId_fkey"
  FOREIGN KEY ("eventId", "organizationId")
  REFERENCES "EventKitConfig"("eventId", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventMaterialDelivery"
  ADD COLUMN "sizeId" TEXT,
  ADD COLUMN "requestedSizeLabel" VARCHAR(40),
  ADD COLUMN "sizeChangeConfirmed" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "EventMaterialDelivery_sizeId_idx" ON "EventMaterialDelivery"("sizeId");

ALTER TABLE "EventMaterialDelivery"
  ADD CONSTRAINT "EventMaterialDelivery_sizeId_fkey"
  FOREIGN KEY ("sizeId") REFERENCES "EventKitSize"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
