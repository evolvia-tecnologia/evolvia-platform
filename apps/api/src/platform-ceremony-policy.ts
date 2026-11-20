/**
 * Cerimônia WebAuthn da Área Master: o que é decidido FORA da biblioteca (#665).
 *
 * `@simplewebauthn/server` verifica a assinatura, a origem e o RP ID. Nada
 * disso vive aqui. O que vive aqui é o que a biblioteca não decide e que, se
 * ficar faltando, deixa a cerimônia aberta mesmo com a assinatura perfeita:
 *
 *   1. o desafio apresentado é o que o servidor abriu?
 *   2. ele já foi usado?
 *   3. ele está sendo apresentado pela mesma sessão que o abriu?
 *   4. ele ainda está no prazo?
 *
 * O ponto 3 é o que obriga o desenho deste arquivo. O desafio vai para o
 * cliente, então quem o interceptar passa a tê-lo. Guardar o desafio cru na
 * coluna significa que qualquer um que o tenha pode concluir a cerimônia. Por
 * isso a coluna guarda o DIGEST do desafio ligado à sessão que o abriu: a outra
 * sessão tem o desafio, mas não tem como produzir o digest gravado, porque o
 * vínculo dela é outro. Nenhuma coluna nova — o vínculo cabe no valor.
 *
 * Isso não substitui a WebAuthn: sem a chave privada, nada é assinado. É a
 * camada que impede concluir cerimônia de registro por conta de outra pessoa.
 *
 * Único import é builtin, para o digest. Nenhum import relativo, nenhum Prisma,
 * nenhuma dependência da biblioteca — o arquivo roda e é testável sozinho.
 */

import { createHash } from 'node:crypto';

export type TipoDeCerimonia = 'REGISTRATION' | 'AUTHENTICATION';

/** Quanto tempo um desafio fica aberto. Igual ao da política de sessão. */
export const JANELA_DO_DESAFIO_MS = 5 * 60 * 1000;

/** Tamanho mínimo do desafio cru, em caracteres da sua forma base64url. */
export const MINIMO_DO_DESAFIO = 43;

export type IdentidadeParaCerimonia = {
  status: 'ACTIVE' | 'SUSPENDED';
  pendingChallenge?: string | null;
  pendingChallengeKind?: TipoDeCerimonia | null;
  pendingChallengeExpires?: Date | string | null;
};

/**
 * O vínculo do desafio.
 *
 * `REGISTRATION` só acontece dentro de uma sessão Master já autenticada, então
 * o vínculo é o hash do token dessa sessão. `AUTHENTICATION` acontece antes de
 * existir sessão: aí não há o que vincular, e a defesa é a própria WebAuthn —
 * quem não tem a chave privada não assina. Dizer isso explicitamente evita o
 * engano de achar que autenticação está vinculada quando não está.
 */
export type Vinculo =
  | { tipo: 'SESSAO'; tokenHash: string }
  | { tipo: 'SEM_SESSAO' };

export class CerimoniaInvalida extends Error {}

function digest(desafio: string, vinculo: Vinculo): string {
  const ligacao = vinculo.tipo === 'SESSAO' ? vinculo.tokenHash : '';
  return createHash('sha256').update(`${desafio}:${ligacao}`).digest('hex');
}

/**
 * Comparação completa e de tempo constante entre dois hexadecimais.
 *
 * A guarda de tamanho não é formalidade: uma rodada de mutação mostrou que,
 * trocando isto por comparação de prefixo, um valor gravado truncado passa a
 * ACEITAR a cerimônia — uma coluna com um caractere aceitaria qualquer desafio
 * cujo digest comece por ele. O tempo constante é higiene: o digest é de uso
 * único e dura cinco minutos, então tempo de resposta não é a ameaça principal,
 * mas não custa nada.
 */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i += 1) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

function instante(valor: Date | string | null | undefined): number | null {
  if (!valor) return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  const tempo = data.getTime();
  return Number.isNaN(tempo) ? null : tempo;
}

export type AberturaDeCerimonia = {
  /** O que gravar na identidade. Substitui qualquer cerimônia anterior. */
  gravar: {
    pendingChallenge: string;
    pendingChallengeKind: TipoDeCerimonia;
    pendingChallengeExpires: string;
  };
  /** O desafio cru, que vai para o cliente e NÃO é gravado. */
  desafioParaOCliente: string;
};

/**
 * Abre a cerimônia.
 *
 * O desafio cru é gerado por quem chama, com `randomBytes`, porque gerar
 * aleatoriedade não é decisão de política. O que esta função garante é que ele
 * tem tamanho suficiente, que a identidade pode abrir cerimônia, e que o que
 * vai para o banco é o digest vinculado — nunca o desafio cru.
 *
 * Abrir uma cerimônia nova invalida a anterior, porque a coluna é uma só. Isso
 * é deliberado: uma cerimônia em curso por vez, e um desafio antigo que vaze
 * depois não serve mais para nada.
 */
export function abrirCerimonia(
  identidade: IdentidadeParaCerimonia,
  tipo: TipoDeCerimonia,
  desafioCru: string,
  vinculo: Vinculo,
  agora: number = Date.now(),
): AberturaDeCerimonia {
  if (identidade.status !== 'ACTIVE') {
    throw new CerimoniaInvalida('Este acesso à Área Master está suspenso.');
  }
  if (desafioCru.length < MINIMO_DO_DESAFIO) {
    throw new CerimoniaInvalida(`O desafio precisa de ao menos ${MINIMO_DO_DESAFIO} caracteres.`);
  }
  if (tipo === 'REGISTRATION' && vinculo.tipo !== 'SESSAO') {
    throw new CerimoniaInvalida('Registrar autenticador exige sessão Master aberta.');
  }
  if (vinculo.tipo === 'SESSAO' && vinculo.tokenHash.length === 0) {
    throw new CerimoniaInvalida('Vínculo de sessão vazio não vincula nada.');
  }
  return {
    gravar: {
      pendingChallenge: digest(desafioCru, vinculo),
      pendingChallengeKind: tipo,
      pendingChallengeExpires: new Date(agora + JANELA_DO_DESAFIO_MS).toISOString(),
    },
    desafioParaOCliente: desafioCru,
  };
}

export type MotivoDeCerimoniaRecusada =
  | 'SEM_CERIMONIA'
  | 'TIPO_DIVERGENTE'
  | 'DESAFIO_VENCIDO'
  | 'DESAFIO_NAO_CONFERE';

export type ConsumoDoDesafio =
  | {
      ok: true;
      /**
       * O que gravar para consumir o desafio. Tem de ser aplicado na MESMA
       * transação da cerimônia: é isto que torna o reuso impossível, e não uma
       * verificação em memória.
       */
      limpar: {
        pendingChallenge: null;
        pendingChallengeKind: null;
        pendingChallengeExpires: null;
      };
    }
  | { ok: false; recusa: MotivoDeCerimoniaRecusada; porque: string };

/**
 * Verifica e consome o desafio.
 *
 * A recusa por valor que não confere cobre três situações de uma vez, e é de
 * propósito que elas não sejam distinguidas na resposta: desafio trocado,
 * desafio já consumido numa cerimônia anterior, e desafio apresentado por uma
 * sessão diferente da que o abriu. Separar as mensagens diria a quem está
 * tentando qual das três ele acertou.
 *
 * Reuso dentro da mesma cerimônia é impedido por `limpar`: depois de aplicado,
 * a identidade não tem mais desafio, e a segunda tentativa cai em
 * `SEM_CERIMONIA`.
 */
export function consumirDesafio(
  identidade: IdentidadeParaCerimonia,
  tipoEsperado: TipoDeCerimonia,
  desafioApresentado: string,
  vinculo: Vinculo,
  agora: number = Date.now(),
): ConsumoDoDesafio {
  const gravado = identidade.pendingChallenge;
  if (!gravado) {
    return { ok: false, recusa: 'SEM_CERIMONIA', porque: 'Nenhuma cerimônia em andamento. Comece novamente.' };
  }
  if (identidade.pendingChallengeKind !== tipoEsperado) {
    return { ok: false, recusa: 'TIPO_DIVERGENTE', porque: 'A cerimônia em andamento é de outro tipo. Comece novamente.' };
  }
  const expira = instante(identidade.pendingChallengeExpires);
  if (expira === null || expira <= agora) {
    return { ok: false, recusa: 'DESAFIO_VENCIDO', porque: 'O desafio venceu. Comece novamente.' };
  }
  if (!desafioApresentado || !iguais(digest(desafioApresentado, vinculo), gravado)) {
    return { ok: false, recusa: 'DESAFIO_NAO_CONFERE', porque: 'Não foi possível concluir. Comece novamente.' };
  }
  return {
    ok: true,
    limpar: { pendingChallenge: null, pendingChallengeKind: null, pendingChallengeExpires: null },
  };
}
