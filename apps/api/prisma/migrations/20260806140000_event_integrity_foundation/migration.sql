-- CreateEnum
CREATE TYPE "EventProfileCode" AS ENUM (
  'SCIENTIFIC_EVENT',
  'CORPORATE_TRAINING',
  'FAIR_EXHIBITION',
  'ENTERTAINMENT',
  'SOCIAL_COMMUNITY',
  'OTHER'
);

-- AlterTable: additive canonical profile and corrected wizard default
ALTER TABLE "Event" ADD COLUMN "profileCode" "EventProfileCode";
ALTER TABLE "EventWizardSession" ALTER COLUMN "currentStep" SET DEFAULT 'profile';

-- Protect event history from destructive owner deletion
ALTER TABLE "Event" DROP CONSTRAINT "Event_ownerId_fkey";
ALTER TABLE "Event" ADD CONSTRAINT "Event_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prepare composite organization/event isolation for scientific entities
CREATE UNIQUE INDEX "Event_id_organizationId_key" ON "Event"("id", "organizationId");
CREATE INDEX "Event_profileCode_status_idx" ON "Event"("profileCode", "status");

-- Conservative backfill without optional PostgreSQL extensions.
-- Explicit profile markers take precedence so, for example, a corporate
-- conference is not classified as scientific only because it is a conference.
UPDATE "Event"
SET "profileCode" = CASE
  WHEN translate(lower("eventType"), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') ~ '(corporativ|treinamento)' THEN 'CORPORATE_TRAINING'::"EventProfileCode"
  WHEN translate(lower("eventType"), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') ~ '(feira|exposicao)' THEN 'FAIR_EXHIBITION'::"EventProfileCode"
  WHEN translate(lower("eventType"), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') ~ '(show|festival|entretenimento)' THEN 'ENTERTAINMENT'::"EventProfileCode"
  WHEN translate(lower("eventType"), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') ~ '(social|comunitario)' THEN 'SOCIAL_COMMUNITY'::"EventProfileCode"
  WHEN translate(lower("eventType"), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') ~ '(cientific|congresso|simposio|academi)' THEN 'SCIENTIFIC_EVENT'::"EventProfileCode"
  WHEN translate(lower("eventType"), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') ~ '(jornada|seminario|conferencia|coloquio|encontro|forum|semana)'
   AND translate(lower("eventType"), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') ~ '(cientific|academi|tecnic|pesquis|saude|medic)' THEN 'SCIENTIFIC_EVENT'::"EventProfileCode"
  ELSE 'OTHER'::"EventProfileCode"
END
WHERE "profileCode" IS NULL;
