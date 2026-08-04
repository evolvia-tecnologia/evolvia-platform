import assert from 'node:assert/strict';
import test from 'node:test';
import { MembershipRole } from '@prisma/client';
import {
  canAssignRole,
  canManageMembers,
  requiresAnotherOwner,
} from '../dist/membership-policy.js';

test('somente OWNER e ADMIN gerenciam membros', () => {
  assert.equal(canManageMembers(MembershipRole.OWNER), true);
  assert.equal(canManageMembers(MembershipRole.ADMIN), true);
  assert.equal(canManageMembers(MembershipRole.MANAGER), false);
  assert.equal(canManageMembers(MembershipRole.OPERATOR), false);
  assert.equal(canManageMembers(MembershipRole.VIEWER), false);
});

test('ADMIN não cria, promove, altera ou remove OWNER', () => {
  assert.equal(canAssignRole(MembershipRole.ADMIN, null, MembershipRole.OWNER), false);
  assert.equal(canAssignRole(MembershipRole.ADMIN, MembershipRole.OWNER, MembershipRole.ADMIN), false);
  assert.equal(canAssignRole(MembershipRole.ADMIN, MembershipRole.MANAGER, MembershipRole.ADMIN), true);
});

test('OWNER pode administrar todos os papéis', () => {
  assert.equal(canAssignRole(MembershipRole.OWNER, MembershipRole.OWNER, MembershipRole.ADMIN), true);
  assert.equal(canAssignRole(MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.OWNER), true);
});

test('remoção ou rebaixamento de OWNER exige outro proprietário', () => {
  assert.equal(requiresAnotherOwner(MembershipRole.OWNER, MembershipRole.ADMIN), true);
  assert.equal(requiresAnotherOwner(MembershipRole.OWNER, null), true);
  assert.equal(requiresAnotherOwner(MembershipRole.OWNER, MembershipRole.OWNER), false);
  assert.equal(requiresAnotherOwner(MembershipRole.ADMIN, null), false);
});
