import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  GET,
  SECURITY_TXT_CONTACT,
  SECURITY_TXT_EXPIRES,
  SECURITY_TXT_PATH,
  allowlistedHttpsOrigin,
  securityTxtBody,
} from '../app/.well-known/security.txt/route.ts';

const INTERNAL_HOST_PATTERN =
  /localhost|127\.0\.0\.1|0\.0\.0\.0|::1|\bapi:4000\b|\bpostgres\b|\bredis\b|\.internal\b|\.local\b|docker|nginx/iu;
const SENSITIVE_PATTERN =
  /secret|password|token|jwt|private[_-]?key|api[_-]?key|authorization|bearer|stack|nestjs|prisma|0\.2\.0-alpha|x-powered-by|server:\s*nginx/iu;
const PERSONAL_PATTERN =
  /berg\.expresso|gmail\.com|@[a-z0-9.-]*pessoal|cpf|rg\b/iu;

async function routeSource() {
  return readFile(new URL('../app/.well-known/security.txt/route.ts', import.meta.url), 'utf8');
}

test('responde texto plano UTF-8 com Contact, Expires futuro e Canonical HTTPS allowlisted', async () => {
  const response = GET();
  const body = await response.text();
  const origin = allowlistedHttpsOrigin();
  const expiresAt = Date.parse(SECURITY_TXT_EXPIRES);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(body, securityTxtBody());
  assert.equal(body, [
    `Contact: ${SECURITY_TXT_CONTACT}`,
    `Expires: ${SECURITY_TXT_EXPIRES}`,
    `Canonical: ${origin}${SECURITY_TXT_PATH}`,
    '',
  ].join('\n'));

  assert.match(SECURITY_TXT_CONTACT, /^mailto:contato@evolviatecnologia\.com\.br$/u);
  assert.match(origin, /^https:\/\/homologacao\.evolviatecnologia\.com$/u);
  assert.match(body, /^Contact: mailto:contato@evolviatecnologia\.com\.br$/mu);
  assert.match(body, /^Expires: 2027-09-01T00:00:00\.000Z$/mu);
  assert.match(
    body,
    /^Canonical: https:\/\/homologacao\.evolviatecnologia\.com\/\.well-known\/security\.txt$/mu,
  );

  assert.equal(Number.isNaN(expiresAt), false);
  assert.ok(expiresAt > Date.now(), 'Expires precisa permanecer no futuro');
});

test('publica cabeçalhos defensivos sem revelar stack ou versão', async () => {
  const response = GET();

  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('cache-control'), 'public, max-age=86400');
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('server'), null);
});

test('não inclui host interno, segredo, dado pessoal ou origem não HTTPS', async () => {
  const [response, source] = await Promise.all([GET(), routeSource()]);
  const body = await response.text();
  const headerBlob = [...response.headers.entries()].map(([name, value]) => `${name}: ${value}`).join('\n');
  const surfaces = [body, source, headerBlob, allowlistedHttpsOrigin(), SECURITY_TXT_CONTACT];

  for (const surface of surfaces) {
    assert.doesNotMatch(surface, INTERNAL_HOST_PATTERN);
    assert.doesNotMatch(surface, SENSITIVE_PATTERN);
    assert.doesNotMatch(surface, PERSONAL_PATTERN);
    assert.doesNotMatch(surface, /^Canonical: http:/mu);
    assert.doesNotMatch(surface, /http:\/\/localhost/u);
  }

  assert.equal(source.includes('process.env'), false);
  assert.match(source, /ALLOWED_HTTPS_ORIGINS = \['https:\/\/homologacao\.evolviatecnologia\.com'\]/u);
});
