import { EventStatus } from '@prisma/client';

export type PublicationEvaChecklistItem = {
  code: string;
  label: string;
  ready: boolean;
  required: boolean;
};

export type PublicationEvaPermissions = {
  canEdit: boolean;
  canPreparePreview: boolean;
  canSubmitForHomologation: boolean;
  canReturnToSetup: boolean;
  canApproveHomologation: boolean;
  canPublish: boolean;
};

export type PublicationEvaNextStep = {
  code:
    | 'EDIT_REQUIRED'
    | 'RETURN_TO_SETUP'
    | 'COMPLETE_EVENT_SETUP'
    | 'SEND_TO_HOMOLOGATION'
    | 'WAIT_FOR_APPROVAL'
    | 'APPROVE_HOMOLOGATION'
    | 'WAIT_FOR_PUBLICATION'
    | 'CONFIRM_PUBLICATION'
    | 'VIEW_PUBLISHED_PAGE'
    | 'NO_AVAILABLE_ACTION';
  label: string;
  description: string;
  targetId: 'publication-form' | 'publication-release-title';
};

export type PublicationEvaGuidance = {
  scope: 'EVENT_PUBLICATION';
  summary: string;
  pendingItems: Array<{
    code: string;
    label: string;
    priority: 'BLOCKING' | 'RECOMMENDED';
  }>;
  editExplanation: string;
  publicationExplanation: string;
  nextStep: PublicationEvaNextStep;
};

type GuidanceInput = {
  status: EventStatus;
  checklist: PublicationEvaChecklistItem[];
  permissions: PublicationEvaPermissions;
};

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

function editExplanation(status: EventStatus, canEdit: boolean): string {
  if (canEdit) {
    return 'Seu acesso atual permite editar a Divulgação. Salve as mudanças antes de usar o Gate.';
  }
  if (status === EventStatus.HOMOLOGATION) {
    return 'O conteúdo está congelado durante a homologação. Para corrigir dados, uma pessoa autorizada precisa devolver a Divulgação para ajustes.';
  }
  if (status === EventStatus.READY_TO_PUBLISH) {
    return 'O conteúdo está congelado porque a homologação já foi aprovada. Correções exigem retorno explícito para ajustes.';
  }
  if (status === EventStatus.PUBLISHED) {
    return 'A página já está publicada e este Gate não permite alterações silenciosas no conteúdo aprovado.';
  }
  if (status === EventStatus.CANCELLED) {
    return 'O evento está cancelado e a Divulgação não pode ser alterada neste estado.';
  }
  return 'Seu acesso atual ou o estado do evento não permite editar a Divulgação.';
}

function publicationExplanation(
  status: EventStatus,
  blockingCount: number,
  permissions: PublicationEvaPermissions,
): string {
  if (blockingCount > 0) {
    return `A Divulgação ainda tem ${blockingCount} ${plural(blockingCount, 'bloqueio obrigatório', 'bloqueios obrigatórios')}. O Gate não avança enquanto esses itens estiverem pendentes.`;
  }
  if (status === EventStatus.DRAFT) {
    return 'O checklist editorial está pronto, mas o evento ainda precisa concluir sua configuração canônica antes da homologação.';
  }
  if (status === EventStatus.SETUP) {
    return permissions.canSubmitForHomologation
      ? 'O checklist obrigatório está pronto. A próxima etapa é enviar a Divulgação para homologação; não é possível publicar diretamente.'
      : 'O checklist obrigatório está pronto, mas seu acesso atual não permite enviar a Divulgação para homologação.';
  }
  if (status === EventStatus.HOMOLOGATION) {
    return permissions.canApproveHomologation
      ? 'A Divulgação está congelada para revisão e seu acesso atual permite aprovar a homologação.'
      : 'A Divulgação está em homologação. A aprovação depende de uma pessoa com a permissão necessária.';
  }
  if (status === EventStatus.READY_TO_PUBLISH) {
    return permissions.canPublish
      ? 'A homologação foi aprovada. Publicar ainda exige sua confirmação explícita no Gate.'
      : 'A homologação foi aprovada, mas a confirmação final depende de uma pessoa com a permissão necessária.';
  }
  if (status === EventStatus.PUBLISHED) {
    return 'A página está publicada. A EVA não altera o conteúdo, o estado nem a indexação automaticamente.';
  }
  return 'Este estado não possui uma transição de publicação disponível neste Gate.';
}

function nextStep(
  status: EventStatus,
  blockingCount: number,
  permissions: PublicationEvaPermissions,
): PublicationEvaNextStep {
  if (blockingCount > 0 && permissions.canEdit) {
    return {
      code: 'EDIT_REQUIRED',
      label: 'Corrigir itens obrigatórios',
      description: 'Comece pelos bloqueios do checklist e salve o rascunho antes de tentar avançar o Gate.',
      targetId: 'publication-form',
    };
  }
  if (blockingCount > 0 && permissions.canReturnToSetup) {
    return {
      code: 'RETURN_TO_SETUP',
      label: 'Voltar para ajustes',
      description: 'O checklist encontrou bloqueios na versão congelada. Use o Gate para voltar a ajustes antes de corrigir o conteúdo.',
      targetId: 'publication-release-title',
    };
  }
  if (blockingCount > 0) {
    return {
      code: 'NO_AVAILABLE_ACTION',
      label: 'Solicitar correção autorizada',
      description: 'Há bloqueios na versão atual, mas seu acesso não permite editar nem devolver a Divulgação para ajustes.',
      targetId: 'publication-release-title',
    };
  }
  if (status === EventStatus.DRAFT) {
    return {
      code: 'COMPLETE_EVENT_SETUP',
      label: 'Revisar a configuração do evento',
      description: 'Conclua os dados canônicos do evento para entrar na sequência de homologação da Divulgação.',
      targetId: 'publication-release-title',
    };
  }
  if (status === EventStatus.SETUP && permissions.canSubmitForHomologation) {
    return {
      code: 'SEND_TO_HOMOLOGATION',
      label: 'Enviar para homologação',
      description: 'Revise a prévia e use o Gate para congelar esta versão para homologação.',
      targetId: 'publication-release-title',
    };
  }
  if (status === EventStatus.HOMOLOGATION && permissions.canApproveHomologation) {
    return {
      code: 'APPROVE_HOMOLOGATION',
      label: 'Aprovar homologação',
      description: 'Confira a versão congelada e aprove somente se ela estiver pronta para a confirmação final.',
      targetId: 'publication-release-title',
    };
  }
  if (status === EventStatus.HOMOLOGATION) {
    return {
      code: 'WAIT_FOR_APPROVAL',
      label: 'Acompanhar a homologação',
      description: 'A versão está congelada e aguarda uma pessoa com permissão para aprovar ou devolver para ajustes.',
      targetId: 'publication-release-title',
    };
  }
  if (status === EventStatus.READY_TO_PUBLISH && permissions.canPublish) {
    return {
      code: 'CONFIRM_PUBLICATION',
      label: 'Confirmar publicação',
      description: 'Use o Gate para confirmar conscientemente a publicação. A EVA não executa essa ação.',
      targetId: 'publication-release-title',
    };
  }
  if (status === EventStatus.READY_TO_PUBLISH) {
    return {
      code: 'WAIT_FOR_PUBLICATION',
      label: 'Aguardar confirmação autorizada',
      description: 'A versão aprovada aguarda uma pessoa com permissão para confirmar a publicação.',
      targetId: 'publication-release-title',
    };
  }
  if (status === EventStatus.PUBLISHED) {
    return {
      code: 'VIEW_PUBLISHED_PAGE',
      label: 'Abrir a página publicada',
      description: 'Use o Gate para acessar a página pública e conferir exatamente o que está visível.',
      targetId: 'publication-release-title',
    };
  }
  return {
    code: 'NO_AVAILABLE_ACTION',
    label: 'Consultar o Gate',
    description: blockingCount > 0
      ? 'Há bloqueios no checklist, mas seu acesso atual não permite corrigi-los. Solicite apoio a uma pessoa autorizada da organização.'
      : 'Não há uma ação disponível para seu acesso atual ou para o estado deste evento.',
    targetId: 'publication-release-title',
  };
}

export function buildPublicationEvaGuidance(input: GuidanceInput): PublicationEvaGuidance {
  const pendingItems = input.checklist
    .filter((item) => !item.ready)
    .map((item) => ({
      code: item.code,
      label: item.label,
      priority: item.required ? 'BLOCKING' as const : 'RECOMMENDED' as const,
    }));
  const blockingCount = pendingItems.filter((item) => item.priority === 'BLOCKING').length;
  const recommendedCount = pendingItems.length - blockingCount;

  const summary = blockingCount === 0 && recommendedCount === 0
    ? 'O checklist da Divulgação está completo.'
    : `${blockingCount} ${plural(blockingCount, 'bloqueio obrigatório', 'bloqueios obrigatórios')} e ${recommendedCount} ${plural(recommendedCount, 'recomendação pendente', 'recomendações pendentes')}.`;

  return {
    scope: 'EVENT_PUBLICATION',
    summary,
    pendingItems,
    editExplanation: editExplanation(input.status, input.permissions.canEdit),
    publicationExplanation: publicationExplanation(input.status, blockingCount, input.permissions),
    nextStep: nextStep(input.status, blockingCount, input.permissions),
  };
}
