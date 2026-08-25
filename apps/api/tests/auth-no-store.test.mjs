import assert from 'node:assert/strict';
import test from 'node:test';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import { AuthController } from '../dist/auth.controller.js';
import { EmailVerificationController } from '../dist/email-verification.controller.js';
import { PasswordRecoveryController } from '../dist/password-recovery.controller.js';
import {
  AUTH_CACHE_CONTROL,
  AUTH_EXPIRES,
  AUTH_PRAGMA,
} from '../dist/auth/no-store.decorator.js';

const sensitiveMethods = [
  [AuthController, 'register'],
  [AuthController, 'login'],
  [AuthController, 'me'],
  [PasswordRecoveryController, 'forgot'],
  [PasswordRecoveryController, 'reset'],
  [EmailVerificationController, 'verify'],
  [EmailVerificationController, 'resend'],
];

test('todas as respostas sensíveis de autenticação proíbem cache', () => {
  for (const [ControllerType, methodName] of sensitiveMethods) {
    const headers = Reflect.getMetadata(
      HEADERS_METADATA,
      ControllerType.prototype[methodName],
    );
    const values = Object.fromEntries(
      headers.map(({ name, value }) => [name.toLowerCase(), value]),
    );

    assert.equal(
      values['cache-control'],
      AUTH_CACHE_CONTROL,
      `${ControllerType.name}.${methodName} sem Cache-Control seguro`,
    );
    assert.equal(values.pragma, AUTH_PRAGMA);
    assert.equal(values.expires, AUTH_EXPIRES);
  }
});
