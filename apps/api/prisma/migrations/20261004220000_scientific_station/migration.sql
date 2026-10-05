-- A estação científica publica resumo e e-poster só quando o organizador liga cada um.
-- A migração só adiciona colunas e um índice. Trabalhos já enviados permanecem ocultos.

ALTER TABLE "ScientificSubmission"
  ADD COLUMN "stationPublicCode" INTEGER,
  ADD COLUMN "stationShowAbstract" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "stationShowEposter" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "ScientificSubmission_eventId_stationPublicCode_key"
  ON "ScientificSubmission"("eventId", "stationPublicCode");
