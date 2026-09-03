import { describe, it, expect } from 'vitest';
import { validatePassword, PASSWORD_MIN_LENGTH } from '../utils/passwordValidation.js';

describe('validatePassword', () => {
  it('accepts a password meeting every requirement', () => {
    expect(validatePassword('Str0ng!Passw0rd')).toEqual({ valid: true, message: '' });
  });

  it('rejects a password shorter than the minimum length', () => {
    const result = validatePassword('Sh0rt!'.padEnd(PASSWORD_MIN_LENGTH - 1, 'a'));
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(`${PASSWORD_MIN_LENGTH}+ characters`);
  });

  it('rejects a password missing an uppercase letter', () => {
    const result = validatePassword('lowercase1!lowercase');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch('uppercase letter');
  });

  it('rejects a password missing a lowercase letter', () => {
    const result = validatePassword('UPPERCASE1!UPPERCASE');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch('lowercase letter');
  });

  it('rejects a password missing a number', () => {
    const result = validatePassword('NoNumbersHere!!');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch('a number');
  });

  it('rejects a password missing a special character', () => {
    const result = validatePassword('NoSpecialChar123');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch('special character');
  });

  it('handles an empty password without throwing', () => {
    const result = validatePassword('');
    expect(result.valid).toBe(false);
  });
});
