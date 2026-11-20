/**
 * Validade da sessão Master e estado da cerimônia WebAuthn (#665, M2).
 *
 * Fica entre o banco e `platform-grant-policy.ts`. Aquele arquivo recebe
 * `segundoFatorVerificadoEm` e `verificacaoReforcadaEm` e decide se a ação é
 * permitida; este decide se a sessão que produziu esses carimbos ainda vale, e
 * os monta a partir da linha gravada.
 *
 * A separação importa por um motivo concreto: sessão inválida e ação não
 * autorizada são recusas diferentes, com causas diferentes, e misturá-las
 * produz o bug clássico de autenticação — alguém com sessão vencida recebendo
 * "sem permissão", vai pedir permissão, e ninguém descobre que o problema era
 * a sessão.
 *
 * Sem dependência nenhuma, nem da biblioteca WebAuthn. A verificação
 * criptográfica da assertion é da biblioteca; o que vive aqui é o que ela NÃO
 * decide: se o desafio era o esperado, se já foi usado, se a sessão venceu, se
 * a identidade foi suspensa e se o contador avançou.
 */

export type PapelMaster = 'OWNER' | 'DELEGADO';
export type SituacaoDaIdentidade = 'ACTIVE' | 'SUSPENDED';
export type TipoDeCerimonia = 'REGISTRATION' | 'AUTHENTICATION';

/** Quanto tempo uma sessão Master vale depois do segundo fator. */
export const JANELA_DA_SESSAO_MS = 12 * 60 * 60 * 1000;

/** Quanto tempo um desafio de cerimônia fica aberto. */
export const JANELA_DO_DESAFIO_MS = 5 * 60 * 1000;

export type IdentidadeMaster = {
  role: PapelMaster;
  status: SituacaoDaIdentidade;
  pendingChallenge?: string | null;
  pendingChallengeKind?: TipoDeCerimonia | null;
  pendingChallengeExpires?: Date | string | null;
};

export type SessaoGravada = {
  secondFactorAt: Date | string;
  stepUpAt?: Date | string | null;
  expiresAt: Date | string;
  revokedAt?: Date | string | null;
};

/** O que `platform-grant-policy.decidir` consome. */
export type SessaoParaDecisao = {
  proprietario: boolean;
  segundoFatorVerificadoEm: string | null;
  verificacaoReforcadaEm: string | null;
};

export type MotivoDeSessaoInvalida =
  | 'SESSAO_INEXISTENTE'
  | 'SESSAO_REVOGADA'
  | 'SESSAO_EXPIRADA'
  | 'IDENTIDADE_SUSPENSA';

export type LeituraDaSessao =
  | { valida: true; sessao: SessaoParaDecisao }
  | { valida: false; recusa: MotivoDeSessaoInvalida; porque: string };

function instante(valor: Date | string | null | undefined): number | null {
  if (!valor) return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  const tempo = data.getTime();
  return Number.isNaN(tempo) ? null : tempo;
}

const iso = (valor: Date | string | null | undefined): string | null => {
  const tempo = instante(valor);
  return tempo === null ? null : new Date(tempo).toISOString();
};

/**
 * A sessão gravada ainda vale, e quem é o dono dela?
 *
 * Ordem deliberada das recusas:
 *
 *   1. não existe — o token não casou com linha nenhuma;
 *   2. revogada — alguém encerrou o acesso de propósito, e isso é mais
 *      específico que vencer;
 *   3. vencida;
 *   4. identidade suspensa.
 *
 * A suspensão vem por último de propósito: suspender a identidade não apaga as
 * sessões, e dizer "suspensa" para quem já tinha sessão vencida seria contar
 * mais do que o necessário sobre o estado da conta.
 *
 * `proprietario` sai de `role === 'OWNER'`, e de nada mais. Não há inferência
 * por nome, e-mail ou papel de organização — a ordem proíbe, e aqui não existe
 * nem campo para isso.
 */
export function lerSessao(
  identidade: IdentidadeMaster | null | undefined,
  sessao: SessaoGravada | null | undefined,
  agora: number = Date.now(),
): LeituraDaSessao {
  if (!identidade || !sessao) {
    return { valida: false, recusa: 'SESSAO_INEXISTENTE', porque: 'Sessão Master não encontrada.' };
  }

  if (instante(sessao.revokedAt) !== null) {
    return { valida: false, recusa: 'SESSAO_REVOGADA', porque: 'Esta sessão Master foi encerrada.' };
  }

  const expira = instante(sessao.expiresAt);
  // Sessão sem validade gravada não é sessão eterna: é linha incompleta, e
  // tratá-la como válida criaria acesso que nunca vence.
  if (expira === null || expira <= agora) {
    return { valida: false, recusa: 'SESSAO_EXPIRADA', porque: 'Esta sessão Master venceu. Entre novamente.' };
  }

  if (identidade.status !== 'ACTIVE') {
    return { valida: false, recusa: 'IDENTIDADE_SUSPENSA', porque: 'Este acesso à Área Master está suspenso.' };
  }

  return {
    valida: true,
    sessao: {
      proprietario: identidade.role === 'OWNER',
      segundoFatorVerificadoEm: iso(sessao.secondFactorAt),
      verificacaoReforcadaEm: iso(sessao.stepUpAt),
    },
  };
}

/** Quando a sessão a ser criada agora deve vencer. */
export function validadeDaSessao(agora: number = Date.now()): string {
  return new Date(agora + JANELA_DA_SESSAO_MS).toISOString();
}

/** Quando o desafio aberto agora deve vencer. */
export function validadeDoDesafio(agora: number = Date.now()): string {
  return new Date(agora + JANELA_DO_DESAFIO_MS).toISOString();
}

export type LeituraDoDesafio =
  | { ok: true; desafio: string }
  | { ok: false; porque: string };

/**
 * O desafio guardado serve para ESTA cerimônia, agora?
 *
 * Quatro recusas, e cada uma existe por um motivo:
 *
 *   - sem desafio: ninguém abriu cerimônia; aceitar seria aceitar assertion
 *     que o servidor nunca pediu;
 *   - tipo trocado: desafio de registro não autentica e vice-versa, senão
 *     registrar um autenticador novo viraria caminho de login;
 *   - vencido: janela curta limita o tempo de uso de um desafio capturado;
 *   - não é o esperado: comparação explícita contra o que o cliente devolveu.
 *
 * Uso único não é decidido aqui: é o chamador que LIMPA o campo na mesma
 * transação em que consome. Esta função só diz se dá para consumir — e a
 * unicidade de `pendingChallenge` no banco é o que impede duas cerimônias
 * usarem o mesmo valor.
 */
export function lerDesafio(
  identidade: IdentidadeMaster | null | undefined,
  tipoEsperado: TipoDeCerimonia,
  agora: number = Date.now(),
): LeituraDoDesafio {
  if (!identidade || !identidade.pendingChallenge) {
    return { ok: false, porque: 'Nenhuma cerimônia em andamento. Comece novamente.' };
  }
  if (identidade.pendingChallengeKind !== tipoEsperado) {
    return { ok: false, porque: 'A cerimônia em andamento é de outro tipo. Comece novamente.' };
  }
  const expira = instante(identidade.pendingChallengeExpires);
  if (expira === null || expira <= agora) {
    return { ok: false, porque: 'O desafio venceu. Comece novamente.' };
  }
  return { ok: true, desafio: identidade.pendingChallenge };
}

/**
 * O contador da assertion avançou?
 *
 * Contador que não avança é sinal de autenticador clonado, e é a única defesa
 * contra isso. A exceção está na especificação do WebAuthn e não é
 * complacência: autenticador que não implementa contador manda zero sempre, e
 * recusar por isso tornaria a Área Master inacessível com chave de segurança
 * perfeitamente legítima. Zero gravado E zero recebido significa "este
 * autenticador não conta", e não "o contador não avançou".
 *
 * Qualquer outro caso de não-avanço é recusa.
 */
export function contadorAceito(gravado: number, recebido: number): boolean {
  if (!Number.isInteger(gravado) || !Number.isInteger(recebido)) return false;
  if (gravado < 0 || recebido < 0) return false;
  if (gravado === 0 && recebido === 0) return true;
  return recebido > gravado;
}
