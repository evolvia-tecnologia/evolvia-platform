export const dynamic = 'force-static';

const ALLOWED_HTTPS_ORIGINS = ['https://homologacao.evolviatecnologia.com'] as const;

export const SECURITY_TXT_CONTACT = 'mailto:contato@evolviatecnologia.com.br';
export const SECURITY_TXT_EXPIRES = '2027-09-01T00:00:00.000Z';
export const SECURITY_TXT_PATH = '/.well-known/security.txt';

export function allowlistedHttpsOrigin(): (typeof ALLOWED_HTTPS_ORIGINS)[number] {
  return ALLOWED_HTTPS_ORIGINS[0];
}

export function securityTxtBody(): string {
  return [
    `Contact: ${SECURITY_TXT_CONTACT}`,
    `Expires: ${SECURITY_TXT_EXPIRES}`,
    `Canonical: ${allowlistedHttpsOrigin()}${SECURITY_TXT_PATH}`,
    '',
  ].join('\n');
}

export function securityTxtHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'public, max-age=86400',
  };
}

export function GET(): Response {
  return new Response(securityTxtBody(), {
    status: 200,
    headers: securityTxtHeaders(),
  });
}
