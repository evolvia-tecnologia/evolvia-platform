-- Organizer can ask for a category proof without blocking payment.
ALTER TYPE "RegistrationProofRequirement" ADD VALUE IF NOT EXISTS 'OPTIONAL';
