import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { apiFailureMessage } from '../lib/api-failure-message.ts';

const helperSource = await readFile(new URL('../lib/api-failure-message.ts', import.meta.url), 'utf8');
const helperUrl = 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(helperSource)).toString('base64');
const apiSource = await readFile(new URL('../lib/api.ts', import.meta.url), 'utf8');
const apiUrl = 'data:text/javascript;base64,' + Buffer.from(
  stripTypeScriptTypes(apiSource.replace("'./api-failure-message'", JSON.stringify(helperUrl)), { mode: 'transform' })
).toString('base64');
const { api, apiBlob, ApiError } = await import(apiUrl);

test('503 identifies unavailability and preserves the safe support reference', () => {
  const message = apiFailureMessage(503, 'internal configuration secret', 'trc_123e4567-e89b-12d3-a456-426614174000');
  assert.match(message, /temporariamente indisponível/u);
  assert.match(message, /conclusão da operação não foi confirmada/u);
  assert.match(message, /Referência para suporte: trc_123e4567/u);
  assert.doesNotMatch(message, /internal configuration secret/u);
});

test('500 does not claim failure of the side effect or recommend another POST', () => {
  const message = apiFailureMessage(500, 'SMTP password SECRET', 'trc_request.1:qa');
  assert.match(message, /Não foi possível confirmar a conclusão/u);
  assert.match(message, /trc_request.1:qa/u);
  assert.doesNotMatch(message, /SECRET|SMTP|reenvie|Tente novamente/u);
});

test('missing, malformed and unavailable references are never displayed', () => {
  for (const trace of [undefined, null, {}, 'trc_unavailable', 'trc_<script>', 'trc_a\nSECRET', 'trc_' + 'a'.repeat(65), 'https://example.com/secret']) {
    const message = apiFailureMessage(500, 'private error', trace);
    assert.doesNotMatch(message, /Referência para suporte|private error|SECRET|example|script/u);
    assert.match(message, /Procure o suporte/u);
  }
});

test('4xx preserves actionable validation, authentication and rate limit messages', () => {
  for (const status of [400, 401, 403, 409, 429]) {
    assert.equal(apiFailureMessage(status, 'Aguarde um minuto.', 'trc_test'), 'Aguarde um minuto.');
  }
});

test('API JSON and media failures carry a safe reference without changing successful payloads', async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { message: 'secret endpoint', traceId: 'trc_reenvio-qa', code: 'INTERNAL_ERROR' } }), { status: 503 });
    };
    await assert.rejects(api('/auth/email-verification/request', { method: 'POST', body: '{}' }), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 503);
      assert.equal(error.traceId, 'trc_reenvio-qa');
      assert.match(error.message, /Referência para suporte: trc_reenvio-qa/u);
      assert.doesNotMatch(error.message, /secret endpoint/u);
      return true;
    });
    assert.equal(calls, 1, 'no automatic resend');
    for (const body of ['<html>private upstream error</html>', 'null', '[]', '"private upstream error"']) {
      globalThis.fetch = async () => new Response(body, { status: 502, headers: { 'x-trace-id': 'trc_gateway-qa' } });
      await assert.rejects(api('/gateway/test'), (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 502);
        assert.equal(error.traceId, 'trc_gateway-qa');
        assert.match(error.message, /Referência para suporte: trc_gateway-qa/u);
        assert.doesNotMatch(error.message, /private upstream|html/u);
        return true;
      });
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { traceId: 'trc_<invalid>' } }), { status: 503, headers: { 'x-trace-id': 'trc_header-qa' } });
    await assert.rejects(api('/gateway/test'), /Referência para suporte: trc_header-qa/u);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { traceId: 'trc_body-qa' } }), { status: 500, headers: { 'x-trace-id': 'trc_header-qa' } });
    await assert.rejects(api('/gateway/test'), /Referência para suporte: trc_body-qa/u);
    globalThis.fetch = async () => new Response('private media error', { status: 500, headers: { 'x-trace-id': 'trc_media-qa' } });
    await assert.rejects(apiBlob('/media/test'), /Referência para suporte: trc_media-qa/u);
    globalThis.fetch = async () => new Response(JSON.stringify({ accepted: true }), { status: 200 });
    assert.deepEqual(await api('/test'), { accepted: true });
    for (const value of [null, false, [1, 2]]) {
      globalThis.fetch = async () => new Response(JSON.stringify(value), { status: 200 });
      assert.deepEqual(await api('/test'), value);
    }
  } finally { globalThis.fetch = previousFetch; }
});

