/**
 * O contrato da API limita fileName a 120 caracteres e a política de termos
 * aceita até 71 caracteres seguros antes de ".pdf". Não envie File.name cru:
 * alguns navegadores entregam caminho/nome longo ou caracteres incompatíveis.
 *
 * O nome curto preserva a extensão e inclui SHA-256 do nome original quando
 * é preciso normalizar, evitando colisões introduzidas por truncamento.
 * O armazenamento usa UUID e o servidor valida conteúdo/hash do PDF.
 */
export async function registrationTermsUploadFileName(original: string): Promise<string> {
  const leaf = original.split(/[\\/]/u).pop()?.normalize('NFKC').trim() ?? '';
  if (!/\.pdf$/iu.test(leaf)) throw new Error('Selecione um arquivo com extensão .pdf.');
  const originalStem = leaf.slice(0, -4);
  const safeStem = originalStem
    .replace(/[^\p{L}\p{N} ._()-]/gu, '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim();
  const direct = `${safeStem}.pdf`;
  if (safeStem === originalStem && /^[\p{L}\p{N}][\p{L}\p{N} ._()-]{0,70}\.pdf$/iu.test(direct)
    && direct.length <= 120) return direct;

  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(original));
  const fingerprint = Array.from(new Uint8Array(digest).slice(0, 6), byte => byte.toString(16).padStart(2, '0')).join('');
  // 46 caracteres Unicode no máximo (até 92 unidades UTF-16), + hífen + hash + .pdf.
  const prefix = Array.from(safeStem || 'Termos').slice(0, 46).join('')
    .replace(/[ ._()-]+$/u, '') || 'Termos';
  return `${prefix}-${fingerprint}.pdf`;
}
