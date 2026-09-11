import { isValidEmail, validateLogin, validatePassword, validateSignUp } from './validation';

describe('validatePassword', () => {
  it('rejects a password shorter than 12 characters', () => {
    const result = validatePassword('Ab1!');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('12+ characters');
  });

  it('rejects a password missing an uppercase letter', () => {
    const result = validatePassword('lowercase123!!');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('an uppercase letter');
  });

  it('rejects a password missing a lowercase letter', () => {
    const result = validatePassword('UPPERCASE123!!');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('a lowercase letter');
  });

  it('rejects a password missing a number', () => {
    const result = validatePassword('NoNumbersHere!!');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('a number');
  });

  it('rejects a password missing a special character', () => {
    const result = validatePassword('NoSpecialChars123');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('a special character');
  });

  it('lists every missing requirement at once, not just the first', () => {
    const result = validatePassword('short');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('12+ characters');
    expect(result.message).toContain('an uppercase letter');
    expect(result.message).toContain('a number');
    expect(result.message).toContain('a special character');
  });

  it('accepts a password meeting every requirement', () => {
    const result = validatePassword('Correct-Horse9!');
    expect(result).toEqual({ valid: true, message: '' });
  });

  it('treats an empty password as invalid, not a crash', () => {
    expect(validatePassword('').valid).toBe(false);
  });
});

describe('isValidEmail', () => {
  it.each(['user@example.com', 'a.b+c@sub.example.co', 'x@y.z'])('accepts %s', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(['', 'not-an-email', 'missing-domain@', '@missing-local.com', 'spaces in@email.com'])(
    'rejects %s',
    (email) => {
      expect(isValidEmail(email)).toBe(false);
    }
  );
});

describe('validateLogin', () => {
  it('requires an email', () => {
    const errors = validateLogin({ email: '', password: 'anything' });
    expect(errors.email).toBe('Email is required');
  });

  it('requires a valid email format', () => {
    const errors = validateLogin({ email: 'not-an-email', password: 'anything' });
    expect(errors.email).toBe('Invalid email');
  });

  it('requires a password', () => {
    const errors = validateLogin({ email: 'user@example.com', password: '' });
    expect(errors.password).toBe('Password is required');
  });

  it('never applies password-strength rules on login (a legacy weak password must still be able to sign in)', () => {
    const errors = validateLogin({ email: 'user@example.com', password: 'short' });
    expect(errors.password).toBeUndefined();
  });

  it('returns no errors for a valid login', () => {
    expect(validateLogin({ email: 'user@example.com', password: 'whatever-they-set' })).toEqual({});
  });
});

describe('validateSignUp', () => {
  const validBase = {
    firstName: 'Jordan',
    lastName: 'Rivera',
    email: 'jordan@example.com',
    password: 'Correct-Horse9!',
    confirmPassword: 'Correct-Horse9!',
    agreedToTerms: true,
  };

  it('requires first and last name', () => {
    const errors = validateSignUp({ ...validBase, firstName: '', lastName: '' });
    expect(errors.firstName).toBe('First name is required');
    expect(errors.lastName).toBe('Last name is required');
  });

  it('rejects a whitespace-only name as not provided', () => {
    const errors = validateSignUp({ ...validBase, firstName: '   ' });
    expect(errors.firstName).toBe('First name is required');
  });

  it('applies the full password-strength rule (unlike login)', () => {
    const errors = validateSignUp({ ...validBase, password: 'weak', confirmPassword: 'weak' });
    expect(errors.password).toBeDefined();
  });

  it('requires the confirm-password field to match', () => {
    const errors = validateSignUp({ ...validBase, confirmPassword: 'Different-Horse9!' });
    expect(errors.confirmPassword).toBe('Passwords do not match');
  });

  it('requires Terms + Privacy acceptance — never assumed true', () => {
    const errors = validateSignUp({ ...validBase, agreedToTerms: false });
    expect(errors.agreedToTerms).toBeDefined();
  });

  it('returns no errors for a fully valid sign-up', () => {
    expect(validateSignUp(validBase)).toEqual({});
  });
});
