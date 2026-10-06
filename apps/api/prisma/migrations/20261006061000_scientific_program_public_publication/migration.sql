-- Activities reach the public event page only after an explicit publication step.
ALTER TYPE "ScientificProgramActivityStatus" ADD VALUE IF NOT EXISTS 'PUBLISHED';
