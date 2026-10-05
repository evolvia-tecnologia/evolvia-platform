-- O organizador liga ou desliga outros autores, a ordem de autoria e a instituição.
-- A migração só adiciona colunas. Trabalhos já enviados permanecem.

ALTER TABLE "ScientificSubmissionConfig"
  ADD COLUMN "collectAdditionalAuthors" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "collectAuthorOrder" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "collectAuthorInstitution" BOOLEAN NOT NULL DEFAULT true;
