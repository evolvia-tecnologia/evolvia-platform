export type ScientificExternalActor = 'AUTHOR' | 'REVIEWER';

export type ScientificExternalCredentialState = {
  actor: ScientificExternalActor;
  organizationId: string;
  eventId: string;
  personId: string;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
  consumedAt?: Date | null;
  singleUse?: boolean;
};

export type ScientificExternalResourceScope = {
  organizationId: string;
  eventId: string;
  personId?: string | null;
  authorPersonIds?: readonly string[];
  reviewerPersonId?: string | null;
};

export class ScientificExternalAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScientificExternalAccessError';
  }
}

export function assertScientificExternalCredentialActive(
  credential: ScientificExternalCredentialState,
  now = new Date(),
): void {
  if (credential.revokedAt) {
    throw new ScientificExternalAccessError('Credencial externa revogada.');
  }
  if (credential.expiresAt.getTime() <= now.getTime()) {
    throw new ScientificExternalAccessError('Credencial externa expirada.');
  }
  if (credential.singleUse && credential.consumedAt) {
    throw new ScientificExternalAccessError('Credencial externa de uso único já consumida.');
  }
}

export function assertScientificExternalEventScope(
  credential: ScientificExternalCredentialState,
  resource: Pick<ScientificExternalResourceScope, 'organizationId' | 'eventId'>,
): void {
  if (
    credential.organizationId !== resource.organizationId ||
    credential.eventId !== resource.eventId
  ) {
    throw new ScientificExternalAccessError('Acesso cruzado entre organização ou evento negado.');
  }
}

export function assertAuthorOwnsSubmission(
  credential: ScientificExternalCredentialState,
  resource: ScientificExternalResourceScope,
): void {
  assertScientificExternalCredentialActive(credential);
  assertScientificExternalEventScope(credential, resource);

  if (credential.actor !== 'AUTHOR') {
    throw new ScientificExternalAccessError('Ação permitida somente ao autor do trabalho.');
  }

  const authors = resource.authorPersonIds ?? [];
  if (!authors.includes(credential.personId)) {
    throw new ScientificExternalAccessError('Autor não possui vínculo com este trabalho.');
  }
}

export function assertReviewerOwnsAssignment(
  credential: ScientificExternalCredentialState,
  resource: ScientificExternalResourceScope,
): void {
  assertScientificExternalCredentialActive(credential);
  assertScientificExternalEventScope(credential, resource);

  if (credential.actor !== 'REVIEWER') {
    throw new ScientificExternalAccessError('Ação permitida somente ao avaliador atribuído.');
  }

  if (!resource.reviewerPersonId || resource.reviewerPersonId !== credential.personId) {
    throw new ScientificExternalAccessError('Avaliador não possui atribuição para este parecer.');
  }
}

export function scientificExternalActorBoundary() {
  return {
    denyByDefault: true,
    administrativeIdentityAccepted: false,
    emailLookupGrantsAccess: false,
    author: {
      scope: 'OWN_SUBMISSIONS',
      allowed: ['CREATE_DRAFT', 'EDIT_OWN_DRAFT', 'SUBMIT_OWN_WORK', 'CREATE_ALLOWED_CORRECTION'] as const,
    },
    reviewer: {
      scope: 'OWN_ASSIGNMENTS',
      allowed: ['DECLARE_CONFLICT', 'SAVE_OWN_SCORES', 'SUBMIT_OWN_REVIEW'] as const,
    },
  } as const;
}
