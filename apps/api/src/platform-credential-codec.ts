/**
 * Como a credencial WebAuthn entra e sai do banco (#665).
 *
 * `@simplewebauthn/server` 14.1 entrega `credential.publicKey` como
 * `Uint8Array`. A coluna aplicada é `PlatformWebAuthnCredential.publicKey`,
 * `String @db.VarChar(1024)`. Essa diferença é onde mora um defeito silencioso:
 * jogar o `Uint8Array` direto numa coluna de texto grava `"1,2,3"` ou
 * `"[object Uint8Array]"`, o registro parece ter funcionado, e ninguém descobre
 * até a primeira pessoa não conseguir entrar — quando a chave já está perdida.
 *
 * Por isso a conversão é explícita, nos dois sentidos, com ida e volta testada
 * e com os limites das colunas conferidos na gravação, não na hora do INSERT.
 *
 * Só builtins. Nenhum import da biblioteca, nenhum Prisma.
 */

/** `PlatformWebAuthnCredential.publicKey` é VarChar(1024). */
export const LIMITE_CHAVE_PUBLICA = 1024;
/** `PlatformWebAuthnCredential.transports` é VarChar(120). */
export const LIMITE_TRANSPORTES = 120;
/** `PlatformWebAuthnCredential.credentialId` é VarChar(255). */
export const LIMITE_ID_DA_CREDENCIAL = 255;
/** `PlatformWebAuthnCredential.label` é VarChar(80). */
export const LIMITE_ROTULO = 80;

/** Transportes que a especificação define. Valor fora da lista não é gravado. */
export const TRANSPORTES_CONHECIDOS = ['usb', 'nfc', 'ble', 'internal', 'hybrid', 'smart-card', 'cable'] as const;

export class CredencialInvalida extends Error {}

const BASE64URL = /^[A-Za-z0-9_-]+$/u;

/**
 * Converte a chave pública para o texto que vai na coluna.
 *
 * base64url e não base64: a coluna é texto e `+` e `/` sobrevivem a qualquer
 * banco, mas base64url atravessa URL, JSON e log sem escapar, e o id da
 * credencial já é base64url — manter um só alfabeto evita o erro de decodificar
 * um com o alfabeto do outro.
 */
export function guardarChavePublica(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array)) {
    throw new CredencialInvalida('A chave pública tem de vir como bytes.');
  }
  if (bytes.length === 0) {
    throw new CredencialInvalida('Chave pública vazia não é chave.');
  }
  const texto = Buffer.from(bytes).toString('base64url');
  if (texto.length > LIMITE_CHAVE_PUBLICA) {
    throw new CredencialInvalida(
      `A chave pública ocupa ${texto.length} caracteres e a coluna aceita ${LIMITE_CHAVE_PUBLICA}.`,
    );
  }
  return texto;
}

/**
 * Lê a chave pública de volta para os bytes que a biblioteca espera.
 *
 * Recusa texto que não seja base64url em vez de devolver bytes truncados:
 * `Buffer.from` ignora caractere inválido em silêncio, e uma chave meio
 * decodificada falharia na verificação da assinatura com um erro que não diz
 * nada sobre a causa.
 */
export function lerChavePublica(texto: string): Uint8Array {
  if (typeof texto !== 'string' || texto.length === 0) {
    throw new CredencialInvalida('Credencial sem chave pública gravada.');
  }
  if (!BASE64URL.test(texto)) {
    throw new CredencialInvalida('A chave pública gravada não está em base64url.');
  }
  const bytes = new Uint8Array(Buffer.from(texto, 'base64url'));
  if (bytes.length === 0) {
    throw new CredencialInvalida('A chave pública gravada decodifica para nada.');
  }
  return bytes;
}

/**
 * Normaliza os transportes para a coluna de texto.
 *
 * Lista vazia grava `''`, que é o default da coluna — e não `null`, porque a
 * coluna não é opcional. Valor desconhecido é descartado em vez de gravado: a
 * especificação pode ganhar transportes novos, e um valor que a biblioteca não
 * reconhece atrapalharia a autenticação seguinte sem acrescentar nada.
 */
export function guardarTransportes(lista: readonly string[] | null | undefined): string {
  if (!lista || lista.length === 0) return '';
  const conhecidos = TRANSPORTES_CONHECIDOS as readonly string[];
  const vistos = new Set<string>();
  for (const bruto of lista) {
    if (typeof bruto !== 'string') continue;
    const valor = bruto.trim().toLowerCase();
    if (valor.length > 0 && conhecidos.includes(valor)) vistos.add(valor);
  }
  // Sem conferir o limite da coluna de propósito: a lista branca acima garante
  // que o pior caso possível — todos os transportes conhecidos — ocupa 44
  // caracteres, contra os 120 da coluna. Uma guarda que não pode disparar é
  // ruído, e a invariante está presa num teste em vez de num `if` morto. Se a
  // especificação ganhar transportes novos, o teste é que falha primeiro.
  return [...vistos].sort().join(',');
}

/** Lê os transportes gravados. Coluna vazia é lista vazia, não `['']`. */
export function lerTransportes(texto: string | null | undefined): string[] {
  if (!texto) return [];
  const conhecidos = TRANSPORTES_CONHECIDOS as readonly string[];
  return texto.split(',').map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0 && conhecidos.includes(t));
}

/** O id da credencial, como a biblioteca o devolve, conferido contra a coluna. */
export function guardarIdDaCredencial(id: string): string {
  if (typeof id !== 'string' || id.length === 0) {
    throw new CredencialInvalida('Credencial sem identificador.');
  }
  if (!BASE64URL.test(id)) {
    throw new CredencialInvalida('O identificador da credencial não está em base64url.');
  }
  if (id.length > LIMITE_ID_DA_CREDENCIAL) {
    throw new CredencialInvalida(`O identificador ocupa ${id.length} caracteres e a coluna aceita ${LIMITE_ID_DA_CREDENCIAL}.`);
  }
  return id;
}

/**
 * O rótulo que a pessoa dá ao autenticador.
 *
 * Escrito por gente, então corta com marca visível em vez de recusar — como o
 * motivo da auditoria. Rótulo vazio recebe um padrão, porque uma lista de
 * credenciais sem nome nenhum não ajuda ninguém a decidir qual revogar.
 */
export function guardarRotulo(rotulo: string | null | undefined): string {
  const limpo = (rotulo ?? '').trim();
  if (limpo.length === 0) return 'Chave de segurança';
  return limpo.length > LIMITE_ROTULO ? `${limpo.slice(0, LIMITE_ROTULO - 1)}…` : limpo;
}
