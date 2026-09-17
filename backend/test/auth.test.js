const assert = require('node:assert/strict');
const { test } = require('node:test');
const { hashPassword, verifyPassword, createAuthService } = require('../src/auth');

test('scrypt password hashes verify only for the original password', () => {
  const hash = hashPassword('StrongPass2026');
  assert.match(hash, /^scrypt\$/);
  assert.equal(verifyPassword('StrongPass2026', hash), true);
  assert.equal(verifyPassword('WrongPass2026', hash), false);
});

test('sessions use current database role and reject a disabled account', async () => {
  const user = { id: 'account-1', email: 'operator@example.test', name: 'Operator', role: 'OPERATOR', active: true, passwordHash: hashPassword('StrongPass2026') };
  const service = createAuthService({ authJwtSecret: 'a-unique-test-key-with-more-than-32-characters' }, {
    async findByEmail() { return { ...user }; }
  });
  const session = await service.login({ email: user.email, password: 'StrongPass2026' });
  const request = { get() { return `Bearer ${session.token}`; } };
  user.role = 'APPROVER';
  assert.equal((await service.authenticate(request)).role, 'APPROVER');
  user.active = false;
  await assert.rejects(service.authenticate(request), { code: 'INVALID_SESSION' });
});
