-- Reabertura de preparação precisa ordenar pela última atualização, não pela criação.
ALTER TABLE "EventIntegrationPreparation"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
