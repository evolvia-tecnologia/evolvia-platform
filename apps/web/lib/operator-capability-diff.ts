/**
 * Diferença entre as permissões que um operador TEM e as que o organizador
 * deixou marcadas na tela (G10.10).
 *
 * A tela edita um conjunto; a API tem duas operações, conceder e revogar. É
 * aqui que o conjunto editado se traduz nas duas chamadas — e é aqui que um
 * erro concederia ou revogaria o que ninguém pediu. Por isso fica em arquivo
 * próprio, sem React, e com teste: um componente `.tsx` não pode ser importado
 * por teste neste ambiente.
 */

export interface Diferenca {
  /** Marcadas agora e ausentes antes. */
  readonly conceder: string[];
  /** Presentes antes e desmarcadas agora. */
  readonly revogar: string[];
}

/**
 * Compara dois conjuntos de ações. Ordem e repetição na entrada não importam;
 * a saída sai ordenada, para que a chamada à API seja determinística e o
 * histórico fique legível.
 *
 * Ação que está nos dois lados não produz operação alguma: a API trataria como
 * `semEfeito`, mas pedir à toa gastaria uma ida ao servidor e sujaria a leitura
 * de quem for conferir o histórico depois.
 */
export function diferencaDeConcessoes(atuais: readonly string[], desejadas: readonly string[]): Diferenca {
  const antes = new Set(atuais);
  const agora = new Set(desejadas);
  const conceder: string[] = [];
  const revogar: string[] = [];
  for (const acao of agora) if (!antes.has(acao)) conceder.push(acao);
  for (const acao of antes) if (!agora.has(acao)) revogar.push(acao);
  return { conceder: conceder.sort(), revogar: revogar.sort() };
}

/** Se há algo a enviar. Sem isso, a tela chamaria a API para não fazer nada. */
export function temMudanca(d: Diferenca): boolean {
  return d.conceder.length > 0 || d.revogar.length > 0;
}

/**
 * Rótulo em português de cada ação. Fica na borda de propósito: o servidor
 * manda códigos estáveis, e o texto que a pessoa lê é assunto da interface.
 * Uma ação sem rótulo aqui aparece pelo próprio código, em vez de desaparecer
 * da tela — some do olho é pior que aparecer feio.
 */
export const ROTULOS: Record<string, string> = {
  buscar: 'Buscar inscrição',
  checkin: 'Fazer check-in',
  checkin_reverter: 'Reverter check-in',
  credencial_imprimir: 'Imprimir etiqueta',
  credencial_reimprimir: 'Reimprimir etiqueta',
  material_entregar: 'Entregar material',
  material_reverter: 'Reverter entrega de material',
  presenca_dia: 'Marcar presença do dia',
  presenca_dia_reverter: 'Reverter presença do dia',
  atividade_acesso: 'Registrar acesso a atividade',
  inscricao_criar: 'Inscrever no balcão',
  inscricao_ler: 'Ver ficha de inscrição',
  inscricao_corrigir: 'Corrigir inscrição',
  kit_ler: 'Ver kits',
  kit_relatorio: 'Ver relatório de kits',
  relatorio: 'Ver relatório do evento',
  sorteio: 'Fazer sorteio',
};

export function rotulo(acao: string): string {
  return ROTULOS[acao] ?? acao;
}

/** Rótulo dos perfis predefinidos. Mesma regra: sem rótulo, mostra o código. */
export const ROTULOS_DE_PERFIL: Record<string, string> = {
  credenciamento: 'Credenciamento',
  credenciamento_supervisao: 'Credenciamento — supervisão',
  entrega_de_material: 'Entrega de material',
  entrega_de_material_supervisao: 'Entrega de material — supervisão',
  controle_de_acesso: 'Controle de acesso',
  controle_de_acesso_supervisao: 'Controle de acesso — supervisão',
  inscricao_no_balcao: 'Inscrição no balcão',
  somente_leitura: 'Somente leitura',
};

export function rotuloDePerfil(perfil: string): string {
  return ROTULOS_DE_PERFIL[perfil] ?? perfil;
}
