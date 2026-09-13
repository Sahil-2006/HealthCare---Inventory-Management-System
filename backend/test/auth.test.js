const assert = require('node:assert/strict');
const { test } = require('node:test');
const { hashPassword, verifyPassword } = require('../src/auth');

test('scrypt password hashes verify only for the original password', () => {
  const hash = hashPassword('StrongPass2026');
  assert.match(hash, /^scrypt\$/);
  assert.equal(verifyPassword('StrongPass2026', hash), true);
  assert.equal(verifyPassword('WrongPass2026', hash), false);
});
