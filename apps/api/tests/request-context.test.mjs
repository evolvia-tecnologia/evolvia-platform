import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestContextMiddleware } from '../dist/request-context.middleware.js';

function execute(incoming) {
  const request = { headers: incoming === undefined ? {} : { 'x-request-id': incoming } };
  const headers = new Map();
  let nextCalled = false;
  const response = {
    setHeader(name, value) {
      headers.set(name, value);
    },
  };

  new RequestContextMiddleware().use(request, response, () => {
    nextCalled = true;
  });

  return { request, headers, nextCalled };
}

test('preserva identificador externo quando ele usa somente caracteres seguros', () => {
  const result = execute('req_ci-2026.08:06');

  assert.equal(result.request.requestId, 'req_ci-2026.08:06');
  assert.equal(result.request.traceId, 'trc_req_ci-2026.08:06');
  assert.equal(result.headers.get('x-request-id'), 'req_ci-2026.08:06');
  assert.equal(result.nextCalled, true);
});

test('substitui identificador externo inseguro por UUID gerado internamente', () => {
  const result = execute('identificador com espaços e conteúdo inválido');

  assert.match(
    result.request.requestId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(result.request.traceId, `trc_${result.request.requestId}`);
  assert.equal(result.headers.get('x-trace-id'), result.request.traceId);
});
