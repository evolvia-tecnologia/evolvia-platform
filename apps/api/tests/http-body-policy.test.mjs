import assert from 'node:assert/strict';
import test from 'node:test';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  configureHttpBodyParsers,
  JSON_BODY_LIMIT_BYTES,
  URLENCODED_BODY_LIMIT_BYTES,
} from '../dist/http-body-policy.js';

test('o transporte JSON comporta uma mídia binária de 5 MiB codificada em Base64', () => {
  const contentBase64 = Buffer.alloc(5 * 1024 * 1024).toString('base64');
  const payload = Buffer.byteLength(JSON.stringify({
    usage: 'COVER',
    contentBase64,
    altText: 'Auditório principal do evento',
    decorative: false,
    publicationRevision: 12,
  }));

  assert.ok(payload <= JSON_BODY_LIMIT_BYTES, `${payload} deve caber em ${JSON_BODY_LIMIT_BYTES}`);
  assert.ok(JSON_BODY_LIMIT_BYTES < 7 * 1024 * 1024);
});

test('registra parsers explícitos sem ampliar formulários urlencoded', () => {
  const calls = [];
  const app = {
    useBodyParser(parser, options) {
      calls.push({ parser, options });
      return this;
    },
  };

  configureHttpBodyParsers(app);

  assert.deepEqual(calls, [
    { parser: 'json', options: { limit: JSON_BODY_LIMIT_BYTES } },
    {
      parser: 'urlencoded',
      options: { extended: true, limit: URLENCODED_BODY_LIMIT_BYTES },
    },
  ]);
  assert.equal(URLENCODED_BODY_LIMIT_BYTES, 100 * 1024);
});

test('o parser real aceita 5 MiB binários em Base64 e recusa o envelope acima do limite', async () => {
  class BodyParserTestModule {}
  Module({})(BodyParserTestModule);
  const app = await NestFactory.create(BodyParserTestModule, {
    bodyParser: false,
    logger: false,
  });
  configureHttpBodyParsers(app);
  app.getHttpAdapter().getInstance().post('/body-parser-probe', (request, response) => {
    response.status(200).json({ contentLength: request.body.contentBase64.length });
  });

  const server = await app.listen(0, '127.0.0.1');
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const endpoint = `http://127.0.0.1:${address.port}/body-parser-probe`;
    const send = (binaryBytes) => fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contentBase64: Buffer.alloc(binaryBytes).toString('base64') }),
    });

    const accepted = await send(5 * 1024 * 1024);
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), {
      contentLength: Math.ceil((5 * 1024 * 1024) / 3) * 4,
    });

    const rejected = await send(6 * 1024 * 1024);
    assert.equal(rejected.status, 413);
  } finally {
    await app.close();
  }
});
