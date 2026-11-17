export type RegistrationStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';
export type PaymentStatus = 'CREATING' | 'ACTIVE' | 'PAID' | 'PAID_REVIEW' | 'CANCELED' | 'EXPIRED' | 'FAILED' | 'UNKNOWN';

const registrationLabels: Record<RegistrationStatus, string> = {
  PENDING_PAYMENT: 'Aguardando pagamento',
  CONFIRMED: 'Confirmada',
  EXPIRED: 'Reserva expirada',
  CANCELLED: 'Cancelada',
};

const paymentLabels: Record<PaymentStatus, string> = {
  CREATING: 'Preparando pagamento',
  ACTIVE: 'Aguardando pagamento',
  PAID: 'Pago',
  PAID_REVIEW: 'Pagamento em análise',
  CANCELED: 'Cancelado',
  EXPIRED: 'Pagamento expirado',
  FAILED: 'Falha no pagamento',
  UNKNOWN: 'Situação em verificação',
};

export function registrationLabel(status: RegistrationStatus): string {
  return registrationLabels[status] ?? 'Em análise';
}

export function paymentLabel(status: PaymentStatus | null): string {
  return status === null ? 'Não aplicável' : paymentLabels[status] ?? 'Situação em verificação';
}

export function sessionDelay(expiresAt: string, now: number): number {
  const remaining = Date.parse(expiresAt) - now;
  return Number.isFinite(remaining) && remaining > 0 ? remaining : 0;
}
