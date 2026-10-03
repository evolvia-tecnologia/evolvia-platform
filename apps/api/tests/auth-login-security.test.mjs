import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { AuthService } from '../dist/auth.service.js';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');
const error = { status: 401, message: 'E-mail ou senha inválidos.' };
const user = { id: 'qa-user', name: 'Pessoa QA', email: 'qa@example.invalid', passwordHash: 'stored-hash' };

function fixture(record) {
  const signed = [], queries = [];
  const service = new AuthService(
    { user: { findUnique: async (query) => { queries.push(query); return record; } } },
    { signAsync: async (payload) => { signed.push(payload); return 'qa-token'; } },
    {},
  );
  return { service, signed, queries };
}

test('identidade ausente também executa bcrypt com hash de custo 12 e não emite token', async (t) => {
  const compare = t.mock.method(bcrypt, 'compare', async () => false);
  const { service, signed } = fixture(null);
  await assert.rejects(service.login({ email: 'missing@example.invalid', password: 'SenhaQA-123!' }), error);
  assert.equal(compare.mock.callCount(), 1);
  const [password, hash] = compare.mock.calls[0].arguments;
  assert.equal(password, 'SenhaQA-123!');
  assert.match(hash, /^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/);
  assert.equal(signed.length, 0);
});

test('senha incorreta usa hash real e a mesma rejeição, sem emitir token', async (t) => {
  const compare = t.mock.method(bcrypt, 'compare', async () => false);
  const { service, signed } = fixture(user);
  await assert.rejects(service.login({ email: user.email, password: 'errada' }), error);
  assert.equal(compare.mock.callCount(), 1);
  assert.deepEqual(compare.mock.calls[0].arguments, ['errada', user.passwordHash]);
  assert.equal(signed.length, 0);
});

test('identidade inexistente é negada mesmo quando a comparação retorna true', async (t) => {
  t.mock.method(bcrypt, 'compare', async () => true);
  const { service, signed } = fixture(null);
  await assert.rejects(service.login({ email: 'missing@example.invalid', password: 'qualquer' }), error);
  assert.equal(signed.length, 0);
});

test('login válido preserva normalização, token e DTO mínimo', async (t) => {
  t.mock.method(bcrypt, 'compare', async () => true);
  const { service, signed, queries } = fixture(user);
  const result = await service.login({ email: ' QA@EXAMPLE.INVALID ', password: 'correta' });
  assert.deepEqual(queries, [{ where: { email: user.email } }]);
  assert.deepEqual(signed, [{ sub: user.id, email: user.email }]);
  assert.deepEqual(result, { user: { id: user.id, name: user.name, email: user.email }, token: 'qa-token' });
  assert.equal('passwordHash' in result.user, false);
});

test('erro no verificador de senha falha fechado sem assinar JWT', async (t) => {
  t.mock.method(bcrypt, 'compare', async () => { throw new Error('verificador indisponível'); });
  const { service, signed } = fixture(user);
  await assert.rejects(service.login({ email: user.email, password: 'qualquer' }), /verificador indisponível/);
  assert.equal(signed.length, 0);
});
