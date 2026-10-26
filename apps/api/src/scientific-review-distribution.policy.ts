export const REVIEW_DISTRIBUTION_MAX = 40;

export type DistributionWork = {
  submissionId: string;
  versionId: string;
  authorPersonIds: string[];
  authorEmails: Array<string | null | undefined>;
  activeReviewerIds: string[];
  assignedCount: number;
};

export type DistributionReviewer = {
  id: string;
  email: string | null;
};

export type DistributionPlan = {
  submissionId: string;
  versionId: string;
  reviewerPersonId: string;
};

export function registrationEmail(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const email = (data as Record<string, unknown>).email;
  return typeof email === 'string' ? email : null;
}

export function distributionLabel(value: string): string {
  // Projeção de texto: o consumidor deve renderizar como texto, nunca como HTML.
  if (/[\u0000-\u001f\u007f]/u.test(value)) return 'Não exibível';
  const label = value.replace(/[ \t]+/g, ' ').trim();
  if (label.length < 2 || label.length > 180) return 'Não exibível';
  return label;
}

export function planAssistedReviewDistribution(input: {
  works: DistributionWork[];
  reviewers: DistributionReviewer[];
  cap: number | null;
  limit?: number;
}): { plans: DistributionPlan[]; pending: boolean } {
  const limit = input.limit ?? REVIEW_DISTRIBUTION_MAX;
  const target = input.cap ?? 1;
  const load = new Map<string, number>();
  const plans: DistributionPlan[] = [];
  let pending = false;
  for (const work of input.works) {
    const room = target - work.assignedCount;
    if (room <= 0 || !work.versionId) continue;
    const blocked = new Set(work.activeReviewerIds);
    const candidates = input.reviewers
      .filter((reviewer) => reviewer.email?.trim() && !blocked.has(reviewer.id) && !authorshipConflict(
        reviewer.id,
        work.authorPersonIds,
        reviewer.email,
        work.authorEmails,
      ))
      .sort((left, right) => (load.get(left.id) ?? 0) - (load.get(right.id) ?? 0) || left.id.localeCompare(right.id));
    let added = 0;
    for (const reviewer of candidates) {
      if (added >= room) break;
      if (plans.length >= limit) {
        pending = true;
        return { plans, pending };
      }
      plans.push({ submissionId: work.submissionId, versionId: work.versionId, reviewerPersonId: reviewer.id });
      blocked.add(reviewer.id);
      load.set(reviewer.id, (load.get(reviewer.id) ?? 0) + 1);
      added += 1;
    }
  }
  return { plans, pending };
}

function authorshipConflict(
  reviewerPersonId: string,
  authorPersonIds: string[],
  reviewerEmail: string | null,
  authorEmails: Array<string | null | undefined>,
): boolean {
  if (authorPersonIds.includes(reviewerPersonId)) return true;
  const email = reviewerEmail?.trim().toLowerCase();
  return Boolean(email && authorEmails.some((authorEmail) => authorEmail?.trim().toLowerCase() === email));
}

