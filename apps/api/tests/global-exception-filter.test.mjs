import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import { GlobalExceptionFilter } from '../dist/global-exception.filter.js';

const MARKERS = [
  'MARK_CODE',
  'MARK_MESSAGE',
  'MARK_FIELD',
  'MARK_CONTEXT',
  'MARK_STACK',
  'MARK_TOKEN',
  'MARK_PERSON',
  'MARK_FRAGMENT',
  'SELECT secret FROM',
];

function execute(exception, requestPatch = {}) {
  const request = {
    traceId: 'trc_test-123',
    method: 'POST',
    originalUrl: '/event-wizard/test',
    url: '/event-wizard/test',
    ...requestPatch,
  };
  const output = { status: null, payload: null, logs: [] };
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
  const original = Logger.prototype.error;
  Logger.prototype.error = function logError(...args) {
    output.logs.push(args);
  };
  try {
    new GlobalExceptionFilter().catch(exception, host);
  } finally {
    Logger.prototype.error = original;
  }
  return output;
}

function leaked(result) {
  const serialized = `${JSON.stringify(result.payload)}\n${JSON.stringify(result.logs)}`;
  return MARKERS.filter((marker) => serialized.includes(marker));
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
  assert.equal(JSON.stringify(result.logs).includes('senha-interna'), false);
});

test('resposta e log 500 omitem code, campos, contexto, mensagem, query e caminho concreto', () => {
  const error = new HttpException({
    code: 'MARK_CODE',
    message: 'MARK_MESSAGE SELECT secret FROM documents',
    fields: ['MARK_FIELD'],
    context: { document: 'MARK_CONTEXT' },
  }, 500);
  error.stack = `Error: MARK_MESSAGE\n    at MARK_STACK (/tmp/filter.js:1:1)\n    at run (/app/dist/handler.js:9:2)`;
  const result = execute(error, {
    method: 'GET',
    originalUrl: '/pessoas/MARK_PERSON?token=MARK_TOKEN#MARK_FRAGMENT',
    url: '/pessoas/MARK_PERSON?token=MARK_TOKEN',
    route: { path: '/pessoas/:id' },
  });

  assert.equal(result.status, 500);
  assert.deepEqual(result.payload, {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Ocorreu um erro interno. Utilize o código de rastreamento ao solicitar suporte.',
      status: 500,
      traceId: 'trc_test-123',
      fields: [],
      context: {},
    },
  });
  assert.deepEqual(leaked(result), []);
  assert.equal(result.logs.length, 1);
  const entry = JSON.parse(result.logs[0][0]);
  assert.deepEqual(entry, {
    traceId: 'trc_test-123',
    status: 500,
    name: 'HttpException',
    method: 'GET',
    route: '/pessoas/:id',
    frames: ['/tmp/filter.js:1:1', '/app/dist/handler.js:9:2'],
  });
  assert.equal(result.logs[0][1], undefined);
});

test('erro inesperado registra nome e frames sem mensagem, stack bruta nem URL concreta', () => {
  const error = new Error('MARK_MESSAGE');
  error.stack = [
    'Error: MARK_MESSAGE',
    '    at MARK_STACK (/app/dist/service.js:12:3)',
    '    at processTicksAndRejections (node:internal/process/task_queues:95:5)',
    '    at impure (https://evil.example/x.js:1:1)',
  ].join('\n');
  const result = execute(error, {
    method: 'MARK_METHOD',
    originalUrl: '/cpf/MARK_PERSON?access=MARK_TOKEN',
    url: '/cpf/MARK_PERSON?access=MARK_TOKEN',
  });

  assert.equal(result.status, 500);
  assert.deepEqual(result.payload.error.fields, []);
  assert.deepEqual(result.payload.error.context, {});
  assert.deepEqual(leaked(result), []);
  assert.deepEqual(JSON.parse(result.logs[0][0]), {
    traceId: 'trc_test-123',
    status: 500,
    name: 'Error',
    frames: [
      '/app/dist/service.js:12:3',
      'node:internal/process/task_queues:95:5',
    ],
  });
});

test('mensagem com várias linhas não entra nos frames', () => {
  const continuations = [
    'Linha invalida: pessoa@exemplo.test (clientes.csv:12:5)',
    'at segredoDoBanco:12:34',
    'detalhe (IDENTIFICADORDETESTE:1:1)',
    'contexto (senha=valor-de-teste do usuario pessoa@exemplo.test)',
    'chamada (https://api.exemplo.test/v1?token=abc:1:1)',
    '    email: "pessoa@exemplo.test"',
  ];
  for (const continuation of continuations) {
    const error = new Error(`cabeca\n${continuation}`);
    error.stack = ['Error: cabeca', continuation, '    at real (/app/dist/x.js:3:1)'].join('\n');
    const result = execute(error);
    const entry = JSON.parse(result.logs[0][0]);
    assert.deepEqual(entry.frames, ['/app/dist/x.js:3:1'], continuation);
    assert.equal(result.logs[0][0].includes(continuation), false, continuation);
    assert.equal(JSON.stringify(result.payload).includes('pessoa@exemplo.test'), false);
    assert.equal(JSON.stringify(result.payload).includes('segredoDoBanco'), false);
  }
});

test('corpo string de HttpException 500 não vaza na resposta nem no log', () => {
  const error = new HttpException('MARK_MESSAGE SELECT secret FROM documents', 500);
  error.stack = 'HttpException: MARK_MESSAGE\n    at boom (/app/dist/boom.js:4:1)';
  const result = execute(error);

  assert.equal(result.status, 500);
  assert.equal(result.payload.error.code, 'INTERNAL_ERROR');
  assert.equal(
    result.payload.error.message,
    'Ocorreu um erro interno. Utilize o código de rastreamento ao solicitar suporte.',
  );
  assert.deepEqual(leaked(result), []);
  assert.deepEqual(JSON.parse(result.logs[0][0]), {
    traceId: 'trc_test-123',
    status: 500,
    name: 'HttpException',
    method: 'POST',
    frames: ['/app/dist/boom.js:4:1'],
  });
});

test('preserva validação 400 e as mensagens seguras de 401, 403 e 404', () => {
  const unauthorized = execute(new UnauthorizedException('Autenticação necessária.'));
  const forbidden = execute(new ForbiddenException('Acesso negado a este evento.'));
  const missing = execute(new NotFoundException('Recurso não encontrado.'));

  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.payload.error.code, 'AUTHENTICATION_REQUIRED');
  assert.equal(unauthorized.payload.error.message, 'Autenticação necessária.');
  assert.equal(unauthorized.logs.length, 0);
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.payload.error.code, 'ACCESS_DENIED');
  assert.equal(forbidden.payload.error.message, 'Acesso negado a este evento.');
  assert.equal(missing.status, 404);
  assert.equal(missing.payload.error.code, 'RESOURCE_NOT_FOUND');
  assert.equal(missing.payload.error.message, 'Recurso não encontrado.');
  assert.deepEqual(missing.payload.error.fields, []);
  assert.deepEqual(missing.payload.error.context, {});
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
