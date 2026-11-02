/**
 * Gates cujo SKIP e inaceitavel.
 *
 * Um teste marcado com uma destas etiquetas nao pode terminar em SKIP: se a
 * fixture faltar, o resultado correto e FAIL, porque "nao executei" num gate
 * obrigatorio nao e evidencia de conformidade. O relator em relatorio.ts
 * converte esse SKIP em falha.
 *
 * Etiquetas fora desta lista podem pular normalmente, com motivo declarado.
 */
export const GATES_OBRIGATORIOS = [
  '@gate-etiqueta',     // #614: etiqueta legivel e impressao bloqueada quando ilegivel
  '@gate-compra',       // #471: compra multipla sem cobranca duplicada
  '@gate-consentimento', // #627: termos, versao e hash do aceite
  '@gate-permissao',    // #627: perfil nao ve recurso que nao lhe pertence
] as const;

export type GateObrigatorio = (typeof GATES_OBRIGATORIOS)[number];

export function ehGateObrigatorio(titulo: string): GateObrigatorio | null {
  return GATES_OBRIGATORIOS.find((gate) => titulo.includes(gate)) ?? null;
}
