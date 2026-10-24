export const OPERATIONAL_READING_KEYS = [
  'dayPresence',
  'presenceDays',
  'dayPresenceReversed',
  'activityPresence',
  'activitiesWithPresence',
  'materialReversed',
  'checkInReversed',
  'waitlistWaiting',
  'waitlistOffered',
  'activityEnrollments',
  'publishedActivities',
  'reviewsSubmitted',
  'reviewsOpen',
  'worksWithoutReview',
  'certificatesIssued',
] as const;

export type OperationalReadingKey = (typeof OPERATIONAL_READING_KEYS)[number];
export type OperationalReadings = Record<OperationalReadingKey, number>;

export class OperationalReadingsPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperationalReadingsPolicyError';
  }
}

export function worksWithoutReview(submissions: number, withSubmittedReview: number): number {
  assertCount(submissions);
  assertCount(withSubmittedReview);
  return Math.max(0, submissions - withSubmittedReview);
}

export function countGroupedStatus<T extends string>(
  groups: Array<{ status: T; _count: { _all: number } }>,
  ...statuses: T[]
): number {
  const wanted = new Set(statuses);
  let total = 0;
  for (const row of groups) {
    if (!wanted.has(row.status)) continue;
    assertCount(row._count._all);
    total += row._count._all;
  }
  return total;
}

export function assembleOperationalReadings(input: OperationalReadings): OperationalReadings {
  const keys = Object.keys(input).sort();
  const expected = [...OPERATIONAL_READING_KEYS].sort();
  if (keys.join(',') !== expected.join(',')) {
    throw new OperationalReadingsPolicyError('A leitura operacional precisa das quinze contas.');
  }
  const readings = {} as OperationalReadings;
  for (const key of OPERATIONAL_READING_KEYS) {
    assertCount(input[key]);
    readings[key] = input[key];
  }
  return readings;
}

function assertCount(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new OperationalReadingsPolicyError('Cada conta precisa ser um inteiro a partir de zero.');
  }
}
