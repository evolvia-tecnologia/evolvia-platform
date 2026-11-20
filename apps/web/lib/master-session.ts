import { api } from './api';

/**
 * O token da sessão Master, em memória e só em memória (#665).
 *
 * **Decisão deliberada, e diferente do token comum.** O JWT de login fica em
 * `localStorage`, porque é o que mantém a sessão do organizador entre abas e
 * recargas. Este token não: ele autoriza suspender eventos, conceder poderes e
 * ler a trilha da plataforma inteira, e um XSS que o alcançasse em repouso
 * levaria tudo isso.
 *
 * O preço é que recarregar a página pede a chave de segurança de novo. Para a
 * área de maior privilégio da plataforma, um toque na chave é barato — e a
 * janela de doze horas do servidor continua valendo para quem não recarrega.
 * Escolhi exigir mais, não menos: afrouxar depois é uma decisão de uma linha,
 * ter deixado o token em repouso não se desfaz.
 *
 * Não é `sessionStorage` nem cookie: os dois sobrevivem à recarga, que é
 * exatamente o que não se quer aqui.
 */
let token: string | null = null;
let expiraEm: string | null = null;

export const CABECALHO_DA_SESSAO = 'x-evolvia-master-session';

export function guardarSessaoMaster(novo: string, quandoExpira: string): void {
  token = novo;
  expiraEm = quandoExpira;
}

export function temSessaoMaster(): boolean {
  return token !== null;
}

export function validadeDaSessaoMaster(): string | null {
  return expiraEm;
}

export function esquecerSessaoMaster(): void {
  token = null;
  expiraEm = null;
}

/** Erro de sessão Master, separado para a tela poder voltar ao passo de entrada. */
export class SessaoMasterAusente extends Error {
  constructor() {
    super('A sessão da Área Master não está mais válida. Entre novamente com a chave de segurança.');
    this.name = 'SessaoMasterAusente';
  }
}

/**
 * Chama uma rota da Área Master com o cabeçalho da sessão.
 *
 * Trata **401 como perda de sessão** e esquece o token: é o que o servidor
 * responde para sessão inexistente, revogada, vencida, de outra pessoa ou
 * identidade suspensa. Em todos esses casos a tela tem de voltar ao passo de
 * entrada, não mostrar "sem permissão" — pedir permissão que a pessoa já tem é
 * o pior conselho possível.
 *
 * **403 passa adiante** como erro normal: a sessão vale e o que falta é
 * concessão ou verificação recente. São situações diferentes para quem está na
 * tela, e o servidor as separa de propósito.
 */
export async function apiMaster<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  if (!token) throw new SessaoMasterAusente();
  try {
    return await api<T>(caminho, {
      ...opcoes,
      headers: { ...(opcoes.headers as Record<string, string> | undefined), [CABECALHO_DA_SESSAO]: token },
    });
  } catch (erro) {
    if (erro instanceof Error && 'status' in erro && (erro as { status: number }).status === 401) {
      esquecerSessaoMaster();
      throw new SessaoMasterAusente();
    }
    throw erro;
  }
}
