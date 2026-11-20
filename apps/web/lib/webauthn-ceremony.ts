/**
 * A cerimônia WebAuthn do lado do navegador (#665).
 *
 * `@simplewebauthn/browser` faria isto, mas adicioná-lo exigiria lockfile novo
 * e o npm desta sessão está bloqueado — forjar lockfile não está em questão.
 * Então as conversões estão aqui, à mão, e por isso mesmo testadas: é o trecho
 * mais propenso a erro de todo o fluxo, porque um byte trocado não dá erro de
 * compilação nem exceção — dá uma assinatura que não verifica, e a pessoa vê
 * "não foi possível concluir" sem ninguém saber por quê.
 *
 * O servidor fala JSON com base64url; o navegador fala `ArrayBuffer`. Este
 * arquivo é a fronteira, e só isso. Nenhuma chamada a `navigator.credentials`
 * acontece aqui, justamente para que tudo o que está aqui possa ser testado
 * fora do navegador.
 */

/** Transportes que a especificação define. Filtrar protege de valor novo no banco. */
const TRANSPORTES_CONHECIDOS = ['usb', 'nfc', 'ble', 'internal', 'hybrid', 'smart-card'] as const;

export type TransporteConhecido = (typeof TRANSPORTES_CONHECIDOS)[number];

export class CerimoniaInvalida extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'CerimoniaInvalida';
  }
}

/**
 * base64url → bytes.
 *
 * `atob` quer base64 padrão com padding, e o servidor manda base64url sem
 * padding. As duas diferenças têm de ser desfeitas, e na ordem certa.
 *
 * A validação do alfabeto vem ANTES do `atob` porque `atob` é tolerante demais:
 * ele ignora caracteres inválidos em vez de reclamar, então um texto corrompido
 * viraria bytes silenciosamente — e bytes silenciosamente errados são uma
 * assinatura que não verifica, sem pista nenhuma de onde veio o problema.
 */
export function deBase64url(texto: string): Uint8Array {
  // A checagem de vazio parece redundante com a regex abaixo (que exige ao
  // menos um caractere), e em efeito é — a mutação mostrou isso. Fica pelo
  // DIAGNÓSTICO: "vazio" e "caractere fora do alfabeto" mandam quem lê o log
  // para lugares diferentes, e um campo que não veio é um problema diferente de
  // um campo corrompido. Há teste exigindo que as duas mensagens difiram.
  if (typeof texto !== 'string' || texto.length === 0) {
    throw new CerimoniaInvalida('Valor base64url vazio.');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(texto)) {
    throw new CerimoniaInvalida('Valor base64url com caractere fora do alfabeto.');
  }
  const resto = texto.length % 4;
  if (resto === 1) {
    // Um caractere sobrando não representa byte nenhum: base64 cresce de 4 em
    // 4 caracteres por 3 bytes, e os restos possíveis são 0, 2 e 3.
    throw new CerimoniaInvalida('Valor base64url com comprimento impossível.');
  }
  const padrao = texto.replace(/-/g, '+').replace(/_/g, '/');
  const completo = resto === 0 ? padrao : padrao + '='.repeat(4 - resto);
  const binario = atob(completo);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** bytes → base64url, sem padding, que é a forma que o servidor espera. */
export function paraBase64url(bytes: ArrayBuffer | Uint8Array): string {
  const vista = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binario = '';
  // Em pedaços para não estourar o limite de argumentos de `apply` com chaves
  // grandes — uma attestation pode passar de 64 KB.
  const PEDACO = 0x8000;
  for (let i = 0; i < vista.length; i += PEDACO) {
    binario += String.fromCharCode(...vista.subarray(i, i + PEDACO));
  }
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

type CredencialPermitidaJson = {
  id: string;
  type?: string;
  transports?: unknown;
};

export type OpcoesDeAutenticacaoJson = {
  challenge: string;
  timeout?: number;
  rpId?: string;
  allowCredentials?: CredencialPermitidaJson[];
  userVerification?: string;
};

export type OpcoesDeRegistroJson = {
  challenge: string;
  rp: { id?: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { type: string; alg: number }[];
  timeout?: number;
  excludeCredentials?: CredencialPermitidaJson[];
  authenticatorSelection?: Record<string, unknown>;
  attestation?: string;
};

/** Só os transportes que a especificação conhece. O resto é descartado. */
function transportes(bruto: unknown): TransporteConhecido[] | undefined {
  if (!Array.isArray(bruto)) return undefined;
  const conhecidos = bruto.filter(
    (valor): valor is TransporteConhecido =>
      typeof valor === 'string' && (TRANSPORTES_CONHECIDOS as readonly string[]).includes(valor),
  );
  // Lista vazia é diferente de ausente: `allowCredentials[].transports: []`
  // faz alguns navegadores não oferecerem transporte nenhum.
  return conhecidos.length > 0 ? conhecidos : undefined;
}

function credenciais(bruto: CredencialPermitidaJson[] | undefined) {
  if (!Array.isArray(bruto)) return undefined;
  return bruto.map((credencial) => ({
    id: deBase64url(credencial.id),
    type: 'public-key' as const,
    transports: transportes(credencial.transports),
  }));
}

/** O JSON do servidor na forma que `navigator.credentials.get` aceita. */
export function opcoesDeAutenticacao(json: OpcoesDeAutenticacaoJson) {
  if (!json || typeof json.challenge !== 'string') {
    throw new CerimoniaInvalida('O servidor não devolveu desafio.');
  }
  return {
    challenge: deBase64url(json.challenge),
    timeout: json.timeout,
    rpId: json.rpId,
    allowCredentials: credenciais(json.allowCredentials),
    userVerification: json.userVerification as UserVerificationRequirement | undefined,
  };
}

/** O JSON do servidor na forma que `navigator.credentials.create` aceita. */
export function opcoesDeRegistro(json: OpcoesDeRegistroJson) {
  if (!json || typeof json.challenge !== 'string') {
    throw new CerimoniaInvalida('O servidor não devolveu desafio.');
  }
  if (!json.user || typeof json.user.id !== 'string') {
    throw new CerimoniaInvalida('O servidor não devolveu a identificação do titular.');
  }
  return {
    challenge: deBase64url(json.challenge),
    rp: json.rp,
    user: {
      id: deBase64url(json.user.id),
      name: json.user.name,
      displayName: json.user.displayName,
    },
    pubKeyCredParams: json.pubKeyCredParams as PublicKeyCredentialParameters[],
    timeout: json.timeout,
    excludeCredentials: credenciais(json.excludeCredentials),
    authenticatorSelection: json.authenticatorSelection as AuthenticatorSelectionCriteria | undefined,
    attestation: json.attestation as AttestationConveyancePreference | undefined,
  };
}

/**
 * A resposta do autenticador na forma que o servidor verifica.
 *
 * `id` tem de ser o MESMO texto base64url que está na coluna `credentialId`,
 * porque é por ele que o serviço acha a credencial antes de conferir a
 * assinatura. Derivar de `rawId` garante isso em vez de confiar no `id` que o
 * navegador preencheu.
 */
export function respostaDeAutenticacao(credencial: PublicKeyCredential) {
  const resposta = credencial.response as AuthenticatorAssertionResponse;
  if (!resposta || !resposta.signature) {
    throw new CerimoniaInvalida('O autenticador não devolveu assinatura.');
  }
  const id = paraBase64url(credencial.rawId);
  return {
    id,
    rawId: id,
    type: 'public-key',
    response: {
      clientDataJSON: paraBase64url(resposta.clientDataJSON),
      authenticatorData: paraBase64url(resposta.authenticatorData),
      signature: paraBase64url(resposta.signature),
      // `userHandle` é opcional de verdade: chave sem handle manda null, e
      // mandar string vazia faria a biblioteca tratar como handle existente.
      userHandle: resposta.userHandle ? paraBase64url(resposta.userHandle) : undefined,
    },
    clientExtensionResults: credencial.getClientExtensionResults?.() ?? {},
  };
}

export function respostaDeRegistro(credencial: PublicKeyCredential) {
  const resposta = credencial.response as AuthenticatorAttestationResponse;
  if (!resposta || !resposta.attestationObject) {
    throw new CerimoniaInvalida('O autenticador não devolveu a atestação.');
  }
  const id = paraBase64url(credencial.rawId);
  const transportesDoAutenticador =
    typeof resposta.getTransports === 'function' ? transportes(resposta.getTransports()) : undefined;
  return {
    id,
    rawId: id,
    type: 'public-key',
    response: {
      clientDataJSON: paraBase64url(resposta.clientDataJSON),
      attestationObject: paraBase64url(resposta.attestationObject),
      transports: transportesDoAutenticador,
    },
    clientExtensionResults: credencial.getClientExtensionResults?.() ?? {},
  };
}

/**
 * O erro do navegador em português, dizendo o que fazer.
 *
 * O `name` do `DOMException` é a única parte estável: a `message` varia por
 * navegador e por versão, e algumas são inúteis para quem está na tela. Cada
 * caso aqui precisa dizer **o que a pessoa faz agora**, porque um aviso que não
 * sugere próximo passo deixa o usuário preso na mesma tela.
 */
export function mensagemDoErro(erro: unknown): string {
  const nome = erro instanceof Error ? erro.name : '';
  switch (nome) {
    case 'NotAllowedError':
      // Cancelamento e tempo esgotado chegam com o MESMO nome, de propósito,
      // para o site não saber distinguir. Então a mensagem cobre os dois.
      return 'A verificação foi cancelada ou expirou. Toque na chave de segurança assim que a solicitação aparecer.';
    case 'InvalidStateError':
      return 'Esta chave já está registrada nesta conta. Use outra chave ou entre com a que já existe.';
    case 'NotSupportedError':
      return 'Este dispositivo não oferece um autenticador compatível. Use uma chave de segurança física ou outro aparelho.';
    case 'SecurityError':
      return 'O endereço desta página não corresponde ao registrado para a chave. Confirme que você está no domínio oficial.';
    case 'AbortError':
      return 'A verificação foi interrompida. Tente novamente.';
    case 'ConstraintError':
      return 'A chave não atende aos requisitos de verificação. Use uma chave com PIN ou biometria.';
    case 'UnknownError':
      return 'O autenticador não respondeu. Desconecte e reconecte a chave, e tente novamente.';
    default:
      // É por aqui que as mensagens de `CerimoniaInvalida` passam: o `name`
      // dela não casa com nenhum caso, e o caminho padrão devolve a mensagem.
      //
      // Eu tinha um atalho explícito para ela no topo da função. A mutação
      // mostrou que ele era redundante E errado: devolvia `erro.message` sem
      // conferir, então mensagem vazia saía vazia na tela — aviso em branco é
      // pior que aviso genérico, porque a pessoa não sabe nem que algo falhou.
      // Com a conferência de vazio, o atalho passou a fazer exatamente o que
      // esta linha faz, e virou código morto. Saiu.
      return erro instanceof Error && erro.message
        ? erro.message
        : 'Não foi possível concluir a verificação.';
  }
}

/** O navegador suporta WebAuthn? Checado antes de oferecer o botão. */
export function suportaWebAuthn(): boolean {
  return (
    typeof window !== 'undefined'
    && typeof window.PublicKeyCredential === 'function'
    && typeof navigator !== 'undefined'
    && typeof navigator.credentials?.get === 'function'
  );
}
