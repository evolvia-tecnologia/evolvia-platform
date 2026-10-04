ALTER TABLE "EventRegistrationCheckIn" ALTER COLUMN "actorUserId" DROP NOT NULL;

CREATE TABLE "EventMaterialDelivery" (
    "reservationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventMaterialDelivery_pkey" PRIMARY KEY ("reservationId")
);

CREATE UNIQUE INDEX "EventMaterialDelivery_reservationId_eventId_organizationId_key"
    ON "EventMaterialDelivery"("reservationId", "eventId", "organizationId");

CREATE INDEX "EventMaterialDelivery_organizationId_eventId_deliveredAt_idx"
    ON "EventMaterialDelivery"("organizationId", "eventId", "deliveredAt");

ALTER TABLE "EventMaterialDelivery"
    ADD CONSTRAINT "EventMaterialDelivery_reservationId_eventId_organizationId_fkey"
    FOREIGN KEY ("reservationId", "eventId", "organizationId")
    REFERENCES "EventRegistrationReservation"("id", "eventId", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventMaterialDelivery"
    ADD CONSTRAINT "EventMaterialDelivery_eventId_organizationId_fkey"
    FOREIGN KEY ("eventId", "organizationId")
    REFERENCES "Event"("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "EventActivityAccess" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventActivityAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventActivityAccess_reservationId_activityId_key"
    ON "EventActivityAccess"("reservationId", "activityId");

CREATE UNIQUE INDEX "EventActivityAccess_id_eventId_organizationId_key"
    ON "EventActivityAccess"("id", "eventId", "organizationId");

CREATE INDEX "EventActivityAccess_organizationId_eventId_accessedAt_idx"
    ON "EventActivityAccess"("organizationId", "eventId", "accessedAt");

ALTER TABLE "EventActivityAccess"
    ADD CONSTRAINT "EventActivityAccess_reservationId_eventId_organizationId_fkey"
    FOREIGN KEY ("reservationId", "eventId", "organizationId")
    REFERENCES "EventRegistrationReservation"("id", "eventId", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventActivityAccess"
    ADD CONSTRAINT "EventActivityAccess_activityId_eventId_organizationId_fkey"
    FOREIGN KEY ("activityId", "eventId", "organizationId")
    REFERENCES "ScientificProgramActivity"("id", "eventId", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventActivityAccess"
    ADD CONSTRAINT "EventActivityAccess_eventId_organizationId_fkey"
    FOREIGN KEY ("eventId", "organizationId")
    REFERENCES "Event"("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
