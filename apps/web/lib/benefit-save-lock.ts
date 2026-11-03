/** A synchronous ref lock prevents duplicate saves before React renders disabled controls. */
export type BenefitSaveLock = { current: boolean };

export function acquireBenefitSaveLock(lock: BenefitSaveLock, hasChanges: boolean): boolean {
  if (!hasChanges || lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseBenefitSaveLock(lock: BenefitSaveLock): void {
  lock.current = false;
}
