-- Preferência de atividade: a vaga só fica reservada quando a organização confirma.
ALTER TYPE "EventActivityEnrollmentStatus" ADD VALUE IF NOT EXISTS 'REQUESTED';
