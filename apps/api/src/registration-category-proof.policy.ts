export type CategoryProofRequirement = 'NONE' | 'REQUIRED_BEFORE_PAYMENT';
export type CategoryProofState = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

export class RegistrationCategoryProofPolicyError extends Error {}

export function categoryProofPaymentBlock(
  requirement: CategoryProofRequirement,
  state: CategoryProofState | null,
): string | null {
  if (requirement !== 'REQUIRED_BEFORE_PAYMENT') return null;
  if (state === 'APPROVED') return null;
  if (state === 'REJECTED') return 'O comprovante foi recusado. Envie outro PDF para a organização analisar antes do pagamento.';
  if (state === 'PENDING_REVIEW') return 'O comprovante está em análise. O pagamento abre depois da aprovação.';
  return 'Envie o PDF que comprova esta categoria antes do pagamento.';
}
