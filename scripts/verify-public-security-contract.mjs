const EXPECTED_HEADERS = Object.freeze({
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
});

function fail(message) {
  throw new Error(message);
}

function requirePublicUrl(value, protocol) {
  const url = new URL(value);
  if (url.protocol !== protocol) fail(`A URL precisa usar ${protocol}`);
  if (url.username || url.password) fail('A URL não pode conter credenciais.');
  if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    fail('A verificação exige um endereço público.');
  }
  return url;
}

export function validateHttpsHeaders(headers) {
  for (const [name, expected] of Object.entries(EXPECTED_HEADERS)) {
    const actual = headers.get(name);
    if (actual !== expected) fail(`Cabeçalho ${name} ausente ou divergente.`);
  }

  const hsts = headers.get('strict-transport-security') ?? '';
  const maxAge = Number(/(?:^|;)\s*max-age=(\d+)/iu.exec(hsts)?.[1] ?? 0);
  if (maxAge < 31_536_000 || !/(?:^|;)\s*includeSubDomains(?:;|$)/iu.test(hsts)) {
    fail('HSTS precisa ter max-age de ao menos um ano e includeSubDomains.');
  }
  if (headers.has('x-powered-by')) fail('x-powered-by não pode ser exposto.');
  if (/\b(?:nginx|apache|caddy)\/\d/iu.test(headers.get('server') ?? '')) {
    fail('O cabeçalho server não pode expor versão tecnológica.');
  }
}

export function validateReadinessPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('Readiness precisa retornar um objeto JSON.');
  }
  if (payload.status !== 'ok' || payload.dependencies?.database !== 'ok') {
    fail('Readiness precisa comprovar API e banco de dados prontos.');
  }
}

async function readReadiness(response) {
  if (response.status !== 200) fail(`Status do readiness inesperado: ${response.status}.`);
  const contentType = response.headers.get('content-type') ?? '';
  if (!/^application\/json(?:;|$)/iu.test(contentType)) {
    fail('Readiness precisa retornar application/json.');
  }
  const body = await response.text();
  if (Buffer.byteLength(body, 'utf8') > 16_384) {
    fail('Resposta do readiness excede o limite de 16 KiB.');
  }
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    fail('Readiness retornou JSON inválido.');
  }
  validateReadinessPayload(payload);
}

export async function verifyPublicSecurity({ httpsUrl, httpUrl, readinessUrl, fetchImpl = fetch }) {
  const secure = requirePublicUrl(httpsUrl, 'https:');
  const insecure = requirePublicUrl(httpUrl, 'http:');
  const readiness = requirePublicUrl(readinessUrl, 'https:');
  if (secure.hostname !== insecure.hostname) fail('HTTP e HTTPS precisam usar o mesmo host.');
  if (secure.origin !== readiness.origin) fail('O readiness precisa usar a mesma origem HTTPS.');

  const [httpsResponse, httpResponse, readinessResponse] = await Promise.all([
    fetchImpl(secure, { redirect: 'manual', signal: AbortSignal.timeout(15_000) }),
    fetchImpl(insecure, { redirect: 'manual', signal: AbortSignal.timeout(15_000) }),
    fetchImpl(readiness, { redirect: 'error', signal: AbortSignal.timeout(15_000) }),
  ]);

  if (httpsResponse.status !== 200) fail(`Status HTTPS inesperado: ${httpsResponse.status}.`);
  validateHttpsHeaders(httpsResponse.headers);

  if (![301, 302, 307, 308].includes(httpResponse.status)) {
    fail(`Redirecionamento HTTP inesperado: ${httpResponse.status}.`);
  }
  const location = new URL(httpResponse.headers.get('location') ?? '', insecure);
  if (location.protocol !== 'https:' || location.hostname !== secure.hostname) {
    fail('O redirecionamento HTTP precisa preservar o host e apontar para HTTPS.');
  }
  await readReadiness(readinessResponse);

  return {
    host: secure.hostname,
    httpsStatus: httpsResponse.status,
    httpStatus: httpResponse.status,
    readinessStatus: readinessResponse.status,
  };
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const [httpsUrl, httpUrl, readinessUrl] = process.argv.slice(2);
  if (!httpsUrl || !httpUrl || !readinessUrl) {
    console.error('Uso: node scripts/verify-public-security-contract.mjs <https-url> <http-url> <readiness-url>');
    process.exitCode = 2;
  } else {
    verifyPublicSecurity({ httpsUrl, httpUrl, readinessUrl })
      .then((result) => console.log(JSON.stringify(result)))
      .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
      });
  }
}
import { pathToFileURL } from 'node:url';
