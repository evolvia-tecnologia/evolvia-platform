import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateHttpsHeaders,
  validateReadinessPayload,
  verifyPublicSecurity,
} from '../../../scripts/verify-public-security-contract.mjs';

const secureHeaders = () => new Headers({
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'SAMEORIGIN',
  server: 'nginx',
});

test('aceita o contrato HTTPS defensivo sem expor versões', () => {
  assert.doesNotThrow(() => validateHttpsHeaders(secureHeaders()));
});

test('recusa cabeçalhos ausentes, HSTS fraco e versões tecnológicas', () => {
  const missing = secureHeaders();
  missing.delete('x-frame-options');
  assert.throws(() => validateHttpsHeaders(missing), /x-frame-options/u);

  const weakHsts = secureHeaders();
  weakHsts.set('strict-transport-security', 'max-age=300');
  assert.throws(() => validateHttpsHeaders(weakHsts), /HSTS/u);

  const leaked = secureHeaders();
  leaked.set('server', 'nginx/1.24.0');
  assert.throws(() => validateHttpsHeaders(leaked), /versão tecnológica/u);
});

test('comprova HTTPS 200 e redirecionamento HTTP para o mesmo host', async () => {
  const fetchImpl = async (url) => {
    if (url.pathname === '/api/health/ready') {
      return Response.json({ status: 'ok', dependencies: { database: 'ok' } });
    }
    return url.protocol === 'https:'
      ? new Response('', { status: 200, headers: secureHeaders() })
      : new Response('', { status: 308, headers: { location: 'https://dev.evolviatecnologia.com/' } });
  };

  const result = await verifyPublicSecurity({
    httpsUrl: 'https://dev.evolviatecnologia.com/',
    httpUrl: 'http://dev.evolviatecnologia.com/',
    readinessUrl: 'https://dev.evolviatecnologia.com/api/health/ready',
    fetchImpl,
  });
  assert.deepEqual(result, {
    host: 'dev.evolviatecnologia.com',
    httpsStatus: 200,
    httpStatus: 308,
    readinessStatus: 200,
  });
});

test('recusa host divergente, credenciais e readiness em outra origem', async () => {
  await assert.rejects(
    verifyPublicSecurity({
      httpsUrl: 'https://dev.evolviatecnologia.com/',
      httpUrl: 'http://outro.example/',
      readinessUrl: 'https://dev.evolviatecnologia.com/api/health/ready',
      fetchImpl: async () => new Response(),
    }),
    /mesmo host/u,
  );

  await assert.rejects(
    verifyPublicSecurity({
      httpsUrl: 'https://user:secret@dev.evolviatecnologia.com/',
      httpUrl: 'http://dev.evolviatecnologia.com/',
      readinessUrl: 'https://dev.evolviatecnologia.com/api/health/ready',
      fetchImpl: async () => new Response(),
    }),
    /credenciais/u,
  );
  await assert.rejects(
    verifyPublicSecurity({
      httpsUrl: 'https://dev.evolviatecnologia.com/',
      httpUrl: 'http://dev.evolviatecnologia.com/',
      readinessUrl: 'https://api.example.net/health/ready',
      fetchImpl: async () => new Response(),
    }),
    /mesma origem/u,
  );
});

test('recusa redirecionamento externo e readiness não saudável', async () => {
  const fetchImpl = async (url) => {
    if (url.pathname === '/api/health/ready') {
      return Response.json({ status: 'degraded', dependencies: { database: 'error' } });
    }
    return url.protocol === 'https:'
      ? new Response('', { status: 200, headers: secureHeaders() })
      : new Response('', { status: 308, headers: { location: 'https://example.net/' } });
  };
  await assert.rejects(
    verifyPublicSecurity({
      httpsUrl: 'https://dev.evolviatecnologia.com/',
      httpUrl: 'http://dev.evolviatecnologia.com/',
      readinessUrl: 'https://dev.evolviatecnologia.com/api/health/ready',
      fetchImpl,
    }),
    /preservar o host/u,
  );

  assert.throws(
    () => validateReadinessPayload({ status: 'ok', dependencies: { database: 'error' } }),
    /banco de dados prontos/u,
  );
});
