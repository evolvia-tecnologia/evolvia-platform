import assert from 'node:assert/strict';
import test from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '../dist/auth.guard.js';

function createContext(authorization = 'Bearer token') {
  const request = { headers: { authorization } };
  return {
    request,
    context: {
      switchToHttp() {
        return { getRequest: () => request };
      },
    },
  };
}

function createGuard({ payload, user }) {
  const jwt = {
    async verifyAsync() {
      return payload;
    },
  };
  const prisma = {
    user: {
      async findUnique(input) {
        assert.deepEqual(input, {
          where: { id: payload.sub },
          select: { id: true, email: true, credentialVersion: true },
        });
        return user;
      },
    },
  };
  return new AuthGuard(jwt, prisma);
}

test('aceita token atual e usa identidade canônica do banco', async () => {
  const payload = { sub: 'usr_1', email: 'antigo@exemplo.com', cv: 2 };
  const guard = createGuard({
    payload,
    user: { id: 'usr_1', email: 'atual@exemplo.com', credentialVersion: 2 },
  });
  const { request, context } = createContext();

  assert.equal(await guard.canActivate(context), true);
  assert.deepEqual(request.user, {
    id: 'usr_1',
    email: 'atual@exemplo.com',
  });
});

test('mantém compatibilidade com token legado somente na versão inicial', async () => {
  const payload = { sub: 'usr_1', email: 'pessoa@exemplo.com' };
  const valid = createGuard({
    payload,
    user: { id: 'usr_1', email: 'pessoa@exemplo.com', credentialVersion: 0 },
  });
  assert.equal(await valid.canActivate(createContext().context), true);

  const revoked = createGuard({
    payload,
    user: { id: 'usr_1', email: 'pessoa@exemplo.com', credentialVersion: 1 },
  });
  await assert.rejects(
    revoked.canActivate(createContext().context),
    (reason) => reason instanceof UnauthorizedException
      && reason.message === 'Sessão inválida ou expirada.',
  );
});

test('recusa token antigo depois que a versão de credencial avança', async () => {
  const guard = createGuard({
    payload: { sub: 'usr_1', email: 'pessoa@exemplo.com', cv: 3 },
    user: { id: 'usr_1', email: 'pessoa@exemplo.com', credentialVersion: 4 },
  });

  await assert.rejects(
    guard.canActivate(createContext().context),
    (reason) => reason instanceof UnauthorizedException
      && reason.message === 'Sessão inválida ou expirada.',
  );
});

test('recusa sessão ausente sem consultar identidade', async () => {
  const guard = createGuard({
    payload: { sub: 'usr_1', email: 'pessoa@exemplo.com', cv: 0 },
    user: { id: 'usr_1', email: 'pessoa@exemplo.com', credentialVersion: 0 },
  });

  await assert.rejects(
    guard.canActivate(createContext(undefined).context),
    (reason) => reason instanceof UnauthorizedException
      && reason.message === 'Sessão não informada.',
  );
});
