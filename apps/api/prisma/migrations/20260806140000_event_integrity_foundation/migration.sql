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

-- Conservative, idempotent backfill. Free-text remains available for display and legacy compatibility.
UPDATE "Event"
SET "profileCode" = CASE
  WHEN lower(unaccent("eventType")) ~ '(cientific|congresso|simposio|jornada|seminario|conferencia|coloquio|academica)' THEN 'SCIENTIFIC_EVENT'::"EventProfileCode"
  WHEN lower(unaccent("eventType")) ~ '(corporativ|treinamento)' THEN 'CORPORATE_TRAINING'::"EventProfileCode"
  WHEN lower(unaccent("eventType")) ~ '(feira|exposicao)' THEN 'FAIR_EXHIBITION'::"EventProfileCode"
  WHEN lower(unaccent("eventType")) ~ '(show|festival|entretenimento)' THEN 'ENTERTAINMENT'::"EventProfileCode"
  WHEN lower(unaccent("eventType")) ~ '(social|comunitario)' THEN 'SOCIAL_COMMUNITY'::"EventProfileCode"
  ELSE 'OTHER'::"EventProfileCode"
END
WHERE "profileCode" IS NULL;
