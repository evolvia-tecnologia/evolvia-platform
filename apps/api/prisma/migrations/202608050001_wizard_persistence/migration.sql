-- Fase 2: controle otimista de concorrência no Wizard e versão padrão do fluxo.
ALTER TABLE "EventWizardSession"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "EventWizardSession"
  ALTER COLUMN "flowVersion" SET DEFAULT 'v2';
