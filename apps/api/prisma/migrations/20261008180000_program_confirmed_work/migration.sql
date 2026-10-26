-- Liga um trabalho científico aceito a uma atividade da programação.
-- A coluna é opcional. Vários horários seguem sem trabalho. O mesmo trabalho não entra duas vezes.

ALTER TABLE "ScientificProgramActivity" ADD COLUMN "submissionId" TEXT;

CREATE UNIQUE INDEX "ScientificProgramActivity_eventId_submissionId_key"
  ON "ScientificProgramActivity"("eventId", "submissionId");

ALTER TABLE "ScientificProgramActivity"
  ADD CONSTRAINT "ScientificProgramActivity_submissionId_eventId_organizatio_fkey"
  FOREIGN KEY ("submissionId", "eventId", "organizationId")
  REFERENCES "ScientificSubmission"("id", "eventId", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
