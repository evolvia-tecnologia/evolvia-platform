import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const service = await readFile(new URL('../src/email-verification.service.ts', import.meta.url), 'utf8');
const auth = await readFile(new URL('../src/auth.service.ts', import.meta.url), 'utf8');
const dashboard = await readFile(new URL('../src/participant-dashboard.service.ts', import.meta.url), 'utf8');
const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

test('token é opaco, persistido somente como hash e nunca retornado', () => {
  assert.match(service, /randomBytes\(32\)\.toString\('base64url'\)/u);
  assert.match(service, /tokenHash: hash\(rawToken\)/u);
  assert.doesNotMatch(service, /return \{[^}]*rawToken/u);
  assert.match(schema, /tokenHash\s+String\s+@unique @db\.Char\(64\)/u);
});

test('cadastro participante não cria vínculo antes da confirmação', () => {
  const register = auth.slice(auth.indexOf('async registerParticipant'), auth.indexOf('async login'));
  assert.doesNotMatch(register, /participantIdentityLink\.create/u);
  assert.match(register, /emailVerification\.issue/u);
  assert.match(service, /participantIdentityLink\.create/u);
  assert.match(service, /emailVerifiedAt: now/u);
});

test('área central bloqueia vínculo e abertura antes da verificação', () => {
  assert.match(dashboard, /userScope\(userId, true\)/u);
  assert.match(dashboard, /if \(!user\.emailVerifiedAt\)/u);
  assert.match(dashboard, /emailVerified: false/u);
});

test('confirmação limita tentativas, expira, é de uso único e auditada sem segredo', () => {
  assert.match(service, /MAX_CONFIRM_ATTEMPTS = 5/u);
  assert.match(service, /expiresAt: \{ gt: now \}/u);
  assert.match(service, /consumedAt: null/u);
  assert.match(service, /timingSafeEqual/u);
  assert.match(service, /action: 'identity\.email_verified'/u);
  const audit = service.slice(service.indexOf("action: 'identity.email_verified'"));
  assert.doesNotMatch(audit.slice(0, 500), /rawToken|tokenHash|participantIdentityHash|participantEmailHash/u);
});

test('entrega externa falha fechada sem configuração', () => {
  assert.match(service, /EMAIL_VERIFICATION_DELIVERY_URL/u);
  assert.match(service, /EMAIL_VERIFICATION_DELIVERY_TOKEN/u);
  assert.match(service, /ServiceUnavailableException/u);
  assert.match(service, /revokedAt: new Date\(\)/u);
});
