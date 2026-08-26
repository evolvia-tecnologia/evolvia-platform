import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { GlobalExceptionFilter } from '../dist/global-exception.filter.js';

function execute(exception) {
  const request = {
    traceId: 'trc_test-123',
    method: 'POST',
    originalUrl: '/event-wizard/test',
  };
  const output = { status: null, payload: null };
  const response = {
    status(status) {
      output.status = status;
      return this;
    },
    json(payload) {
      output.payload = payload;
      return this;
    },
  };
  const host = {
    switchToHttp() {
      return {
        getRequest: () => request,
        getResponse: () => response,
      };
    },
  };

  new GlobalExceptionFilter().catch(exception, host);
  return output;
}

test('padroniza erros de validação com campos e traceId', () => {
  const result = execute(new BadRequestException([
    'O nome é obrigatório.',
    'A data é inválida.',
  ]));

  assert.equal(result.status, 400);
  assert.deepEqual(result.payload, {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Revise os campos informados.',
      status: 400,
      traceId: 'trc_test-123',
      fields: ['O nome é obrigatório.', 'A data é inválida.'],
      context: {},
    },
  });
});

test('não expõe mensagem ou stack de falha interna na resposta', () => {
  const result = execute(new Error('senha-interna-que-nao-pode-vazar'));

  assert.equal(result.status, 500);
  assert.equal(result.payload.error.code, 'INTERNAL_ERROR');
  assert.equal(result.payload.error.traceId, 'trc_test-123');
  assert.equal(
    result.payload.error.message,
    'Ocorreu um erro interno. Utilize o código de rastreamento ao solicitar suporte.',
  );
  assert.equal(JSON.stringify(result.payload).includes('senha-interna'), false);
});

test('traduz rejeição de payload grande sem expor mensagem interna do parser', () => {
  const result = execute(new PayloadTooLargeException('request entity too large'));

  assert.equal(result.status, 413);
  assert.equal(result.payload.error.code, 'PAYLOAD_TOO_LARGE');
  assert.equal(
    result.payload.error.message,
    'O envio excede o limite permitido. Imagens da Divulgação devem ter no máximo 5 MB.',
  );
  assert.equal(JSON.stringify(result.payload).includes('request entity too large'), false);
});
