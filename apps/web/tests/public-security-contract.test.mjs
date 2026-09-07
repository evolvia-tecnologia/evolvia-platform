import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateHttpsHeaders,
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
  const fetchImpl = async (url) => url.protocol === 'https:'
    ? new Response('', { status: 200, headers: secureHeaders() })
    : new Response('', { status: 308, headers: { location: 'https://dev.evolviatecnologia.com/' } });

  const result = await verifyPublicSecurity({
    httpsUrl: 'https://dev.evolviatecnologia.com/',
    httpUrl: 'http://dev.evolviatecnologia.com/',
    fetchImpl,
  });
  assert.deepEqual(result, {
    host: 'dev.evolviatecnologia.com',
    httpsStatus: 200,
    httpStatus: 308,
  });
});

test('recusa host divergente, credenciais e redirecionamento externo', async () => {
  await assert.rejects(
    verifyPublicSecurity({
      httpsUrl: 'https://dev.evolviatecnologia.com/',
      httpUrl: 'http://outro.example/',
      fetchImpl: async () => new Response(),
    }),
    /mesmo host/u,
  );

  await assert.rejects(
    verifyPublicSecurity({
      httpsUrl: 'https://user:secret@dev.evolviatecnologia.com/',
      httpUrl: 'http://dev.evolviatecnologia.com/',
      fetchImpl: async () => new Response(),
    }),
    /credenciais/u,
  );

  const fetchImpl = async (url) => url.protocol === 'https:'
    ? new Response('', { status: 200, headers: secureHeaders() })
    : new Response('', { status: 308, headers: { location: 'https://example.net/' } });
  await assert.rejects(
    verifyPublicSecurity({
      httpsUrl: 'https://dev.evolviatecnologia.com/',
      httpUrl: 'http://dev.evolviatecnologia.com/',
      fetchImpl,
    }),
    /preservar o host/u,
  );
});
