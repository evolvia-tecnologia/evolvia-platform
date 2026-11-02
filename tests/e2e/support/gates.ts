/**
 * Gates obrigatorios da issue #628: um teste desta lista NAO pode terminar em
 * skip. Um gate pulado e tratado como falha pelo relator, para que a ausencia
 * de fixture nunca vire um verde silencioso.
 */
export const GATES_OBRIGATORIOS = [
  'jornada-1: evento presencial Corrida persiste apos reload e novo login',
  'jornada-2: cupom salvo no rodape sobrevive ao reload',
  'jornada-3: evento presencial nao oferece Transmissao na sidebar',
  'jornada-3: acesso direto a Transmissao e recusado em evento presencial',
  'jornada-4: evento online oferece Transmissao',
  'jornada-5: responsavel financeiro permite corrigir dados PF/PJ',
] as const;

export type GateObrigatorio = (typeof GATES_OBRIGATORIOS)[number];

export function ehGateObrigatorio(titulo: string): boolean {
  return (GATES_OBRIGATORIOS as readonly string[]).some((gate) => titulo.includes(gate));
}
