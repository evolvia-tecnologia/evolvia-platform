export type ScientificSubmissionSnapshotContentMode = 'SINGLE_BLOCK' | 'STRUCTURED_BLOCKS';

export type ScientificSubmissionSnapshotInstitutionInput = {
  id: string;
  name: string;
  acronym?: string | null;
};

export type ScientificSubmissionSnapshotAuthorInput = {
  personId: string;
  name: string;
  sortOrder: number;
  isPresenter: boolean;
  isCorresponding: boolean;
  orcid?: string | null;
  institutionIds?: string[] | null;
};

export type ScientificSubmissionSnapshotContentBlockInput = {
  code: string;
  label: string;
  sortOrder: number;
  text: string;
};

export type ScientificSubmissionSnapshotFileInput = {
  kind: 'SUBMISSION_PDF' | 'OTHER';
  fileKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  contentHash?: string | null;
};

export type ScientificSubmissionSnapshotAdditionalFieldInput = {
  code: string;
  label: string;
  sortOrder: number;
  value: unknown;
};

export type ScientificSubmissionSnapshotInput = {
  organizationId: string;
  eventId: string;
  submissionId: string;
  versionNumber: number;
  capturedAt: Date;
  configurationRevision?: string | null;
  modality: { id: string; name: string };
  presentationForm?: { code: string; label: string } | null;
  area?: { id: string; name: string } | null;
  subarea?: { id: string; name: string } | null;
  title: string;
  keywords?: string[] | null;
  conflictOfInterest?: {
    declared: boolean;
    description?: string | null;
  } | null;
  institutions?: ScientificSubmissionSnapshotInstitutionInput[] | null;
  authors: ScientificSubmissionSnapshotAuthorInput[];
  content: {
    mode: ScientificSubmissionSnapshotContentMode;
    singleBlock?: {
      label?: string | null;
      text: string;
    } | null;
    blocks?: ScientificSubmissionSnapshotContentBlockInput[] | null;
  };
  files?: ScientificSubmissionSnapshotFileInput[] | null;
  additionalFields?: ScientificSubmissionSnapshotAdditionalFieldInput[] | null;
};

export type ScientificSubmissionSnapshot = {
  schemaVersion: 1;
  organizationId: string;
  eventId: string;
  submissionId: string;
  versionNumber: number;
  capturedAt: string;
  configurationRevision: string | null;
  modality: { id: string; name: string };
  presentationForm: { code: string; label: string } | null;
  area: { id: string; name: string } | null;
  subarea: { id: string; name: string } | null;
  title: string;
  keywords: string[];
  conflictOfInterest: {
    declared: boolean;
    description: string | null;
  } | null;
  institutions: ScientificSubmissionSnapshotInstitutionInput[];
  authors: ScientificSubmissionSnapshotAuthorInput[];
  content: {
    mode: ScientificSubmissionSnapshotContentMode;
    singleBlock: { label: string; text: string } | null;
    blocks: ScientificSubmissionSnapshotContentBlockInput[];
  };
  files: ScientificSubmissionSnapshotFileInput[];
  additionalFields: ScientificSubmissionSnapshotAdditionalFieldInput[];
};

export type ScientificSubmissionReviewView = {
  title: string;
  identification: {
    modality: string;
    presentationForm: string | null;
    area: string | null;
    subarea: string | null;
  };
  keywords: string[];
  conflictOfInterest: {
    declared: boolean;
    description: string | null;
  } | null;
  institutions: ScientificSubmissionSnapshotInstitutionInput[];
  authors: ScientificSubmissionSnapshotAuthorInput[];
  contentSections: Array<{ code: string; label: string; text: string }>;
  files: ScientificSubmissionSnapshotFileInput[];
  additionalFields: ScientificSubmissionSnapshotAdditionalFieldInput[];
};

export class ScientificSubmissionSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScientificSubmissionSnapshotError';
  }
}

function cloneUnknown(value: unknown): unknown {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) return value.map(cloneUnknown);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, cloneUnknown(item)]),
    );
  }
  throw new ScientificSubmissionSnapshotError('Campo adicional contém valor não serializável.');
}

function assertBaseInput(input: ScientificSubmissionSnapshotInput): void {
  if (!input.organizationId || !input.eventId || !input.submissionId) {
    throw new ScientificSubmissionSnapshotError('Escopo da submissão incompleto para gerar snapshot.');
  }
  if (!Number.isInteger(input.versionNumber) || input.versionNumber < 1) {
    throw new ScientificSubmissionSnapshotError('Número da versão deve ser inteiro maior ou igual a 1.');
  }
  if (!(input.capturedAt instanceof Date) || Number.isNaN(input.capturedAt.getTime())) {
    throw new ScientificSubmissionSnapshotError('Data de captura do snapshot inválida.');
  }
  if (!input.modality?.id || !input.modality.name) {
    throw new ScientificSubmissionSnapshotError('Modalidade é obrigatória no snapshot.');
  }
  if (!input.title) {
    throw new ScientificSubmissionSnapshotError('Título é obrigatório no snapshot.');
  }
  if (input.content.mode === 'SINGLE_BLOCK' && !input.content.singleBlock) {
    throw new ScientificSubmissionSnapshotError('Conteúdo em bloco único precisa do texto capturado.');
  }
  if (input.content.mode === 'STRUCTURED_BLOCKS' && (input.content.blocks?.length ?? 0) === 0) {
    throw new ScientificSubmissionSnapshotError('Conteúdo estruturado precisa de ao menos um bloco capturado.');
  }
}

export function buildScientificSubmissionSnapshot(
  input: ScientificSubmissionSnapshotInput,
): ScientificSubmissionSnapshot {
  assertBaseInput(input);

  const institutions = (input.institutions ?? []).map((institution) => ({
    id: institution.id,
    name: institution.name,
    acronym: institution.acronym ?? null,
  }));

  const authors = [...input.authors]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.personId.localeCompare(b.personId))
    .map((author) => ({
      personId: author.personId,
      name: author.name,
      sortOrder: author.sortOrder,
      isPresenter: author.isPresenter,
      isCorresponding: author.isCorresponding,
      orcid: author.orcid ?? null,
      institutionIds: [...(author.institutionIds ?? [])],
    }));

  const blocks = [...(input.content.blocks ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
    .map((block) => ({
      code: block.code,
      label: block.label,
      sortOrder: block.sortOrder,
      text: block.text,
    }));

  const files = (input.files ?? []).map((file) => ({
    kind: file.kind,
    fileKey: file.fileKey,
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    contentHash: file.contentHash ?? null,
  }));

  const additionalFields = [...(input.additionalFields ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
    .map((field) => ({
      code: field.code,
      label: field.label,
      sortOrder: field.sortOrder,
      value: cloneUnknown(field.value),
    }));

  return {
    schemaVersion: 1,
    organizationId: input.organizationId,
    eventId: input.eventId,
    submissionId: input.submissionId,
    versionNumber: input.versionNumber,
    capturedAt: input.capturedAt.toISOString(),
    configurationRevision: input.configurationRevision ?? null,
    modality: { ...input.modality },
    presentationForm: input.presentationForm ? { ...input.presentationForm } : null,
    area: input.area ? { ...input.area } : null,
    subarea: input.subarea ? { ...input.subarea } : null,
    title: input.title,
    keywords: [...(input.keywords ?? [])],
    conflictOfInterest: input.conflictOfInterest
      ? {
          declared: input.conflictOfInterest.declared,
          description: input.conflictOfInterest.description ?? null,
        }
      : null,
    institutions,
    authors,
    content: {
      mode: input.content.mode,
      singleBlock: input.content.singleBlock
        ? {
            label: input.content.singleBlock.label ?? 'Resumo',
            text: input.content.singleBlock.text,
          }
        : null,
      blocks,
    },
    files,
    additionalFields,
  };
}

export function buildScientificSubmissionReviewView(
  snapshot: ScientificSubmissionSnapshot,
): ScientificSubmissionReviewView {
  const contentSections = snapshot.content.mode === 'SINGLE_BLOCK'
    ? snapshot.content.singleBlock
      ? [{ code: 'abstract', label: snapshot.content.singleBlock.label, text: snapshot.content.singleBlock.text }]
      : []
    : snapshot.content.blocks.map((block) => ({
        code: block.code,
        label: block.label,
        text: block.text,
      }));

  return {
    title: snapshot.title,
    identification: {
      modality: snapshot.modality.name,
      presentationForm: snapshot.presentationForm?.label ?? null,
      area: snapshot.area?.name ?? null,
      subarea: snapshot.subarea?.name ?? null,
    },
    keywords: [...snapshot.keywords],
    conflictOfInterest: snapshot.conflictOfInterest
      ? { ...snapshot.conflictOfInterest }
      : null,
    institutions: snapshot.institutions.map((institution) => ({ ...institution })),
    authors: snapshot.authors.map((author) => ({
      ...author,
      institutionIds: [...(author.institutionIds ?? [])],
    })),
    contentSections,
    files: snapshot.files.map((file) => ({ ...file })),
    additionalFields: snapshot.additionalFields.map((field) => ({
      ...field,
      value: cloneUnknown(field.value),
    })),
  };
}
