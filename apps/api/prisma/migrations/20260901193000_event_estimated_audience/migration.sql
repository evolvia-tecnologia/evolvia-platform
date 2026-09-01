-- Campo canônico opcional originado no Wizard e seguro para projeção pública.
ALTER TABLE "Event"
ADD COLUMN "estimatedAudience" INTEGER;

ALTER TABLE "Event"
ADD CONSTRAINT "Event_estimatedAudience_range_check"
CHECK ("estimatedAudience" IS NULL OR ("estimatedAudience" >= 1 AND "estimatedAudience" <= 1000000));
