const test = require('node:test');
const assert = require('node:assert/strict');
const { isStrongPassword, PASSWORD_MIN_LENGTH } = require('../utils/passwordPolicy');

test('isStrongPassword accepts a password meeting all requirements', () => {
  assert.equal(isStrongPassword('Str0ng!Passw0rd'), true);
});

test('isStrongPassword rejects passwords shorter than the minimum length', () => {
  assert.equal(isStrongPassword('Sh0rt!'.padEnd(PASSWORD_MIN_LENGTH - 1, 'a')), false);
});

test('isStrongPassword rejects passwords missing an uppercase letter', () => {
  assert.equal(isStrongPassword('lowercase1!lowercase'), false);
});

test('isStrongPassword rejects passwords missing a lowercase letter', () => {
  assert.equal(isStrongPassword('UPPERCASE1!UPPERCASE'), false);
});

test('isStrongPassword rejects passwords missing a number', () => {
  assert.equal(isStrongPassword('NoNumbersHere!!'), false);
});

test('isStrongPassword rejects passwords missing a special character', () => {
  assert.equal(isStrongPassword('NoSpecialChar123'), false);
});

test('isStrongPassword rejects non-string input', () => {
  assert.equal(isStrongPassword(undefined), false);
  assert.equal(isStrongPassword(12345678901234), false);
});
