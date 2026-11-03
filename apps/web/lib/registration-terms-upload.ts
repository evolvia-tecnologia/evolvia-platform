/**
 * O contrato da API limita fileName a 120 caracteres e a política de termos
 * aceita até 71 caracteres seguros antes de ".pdf". Não envie File.name cru:
 * alguns navegadores entregam caminho/nome longo ou caracteres incompatíveis.
 *
 * O nome curto preserva a extensão e inclui fingerprint determinístico do nome original quando
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

  // This suffix is a filename collision hint, not a security or integrity checksum.
  // crypto.subtle is unavailable in some non-secure browser contexts.
  let fingerprint: string;
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(original));
    fingerprint = Array.from(new Uint8Array(digest).slice(0, 6), byte => byte.toString(16).padStart(2, '0')).join('');
  } else {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < original.length; i++) {
      const ch = original.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    fingerprint = ((h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')).slice(0, 12);
  }
  // 46 caracteres Unicode no máximo (até 92 unidades UTF-16), + hífen + hash + .pdf.
  const prefix = Array.from(safeStem || 'Termos').slice(0, 46).join('')
    .replace(/[ ._()-]+$/u, '') || 'Termos';
  return `${prefix}-${fingerprint}.pdf`;
}
