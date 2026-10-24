-- Índice aditivo para consultas autenticadas do histórico por documento.
CREATE INDEX "EventRegistrationReservation_identityHash_status_idx"
ON "EventRegistrationReservation"("identityHash", "status");
