-- Cortesia da atividade: lugar separado da vaga que a pessoa reserva sozinha.
ALTER TABLE "EventActivityEnrollment" ADD COLUMN "courtesy" BOOLEAN NOT NULL DEFAULT false;
