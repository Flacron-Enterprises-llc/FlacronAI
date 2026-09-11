/**
 * Ported verbatim from `frontend/src/utils/passwordValidation.js` — same minimum length,
 * same character-class requirements. Client-side validation is UX only; the backend's
 * `isStrongPassword` (`backend/utils/passwordPolicy.js`) is the real, authoritative check
 * (see AUTHENTICATION_ARCHITECTURE.md §6 / CLAUDE.md "mobile-side validation never
 * replaces backend validation").
 */

export const PASSWORD_MIN_LENGTH = 12;

export const PASSWORD_REQUIREMENTS_HINT =
  `At least ${PASSWORD_MIN_LENGTH} characters, with an uppercase letter, a lowercase letter, a number, and a special character.`;

export interface PasswordValidationResult {
  valid: boolean;
  message: string;
}

/** Never applied to the login form — only sign-up and change-password, matching web. */
export function validatePassword(password: string): PasswordValidationResult {
  const missing: string[] = [];
  if (!password || password.length < PASSWORD_MIN_LENGTH) missing.push(`${PASSWORD_MIN_LENGTH}+ characters`);
  if (!/[A-Z]/.test(password || '')) missing.push('an uppercase letter');
  if (!/[a-z]/.test(password || '')) missing.push('a lowercase letter');
  if (!/[0-9]/.test(password || '')) missing.push('a number');
  if (!/[^A-Za-z0-9]/.test(password || '')) missing.push('a special character');

  if (missing.length === 0) return { valid: true, message: '' };
  return { valid: false, message: `Password needs ${missing.join(', ')}.` };
}

export function isValidEmail(email: string): boolean {
  // Anchored (unlike the equivalent web check in Auth.jsx, which uses the same pattern
  // without ^/$ and so also accepts a value with a valid-looking email embedded inside
  // extra text) — a pure client-side UX hint either way; the backend's `isEmail()`
  // (express-validator) remains the sole authoritative check.
  return /^\S+@\S+\.\S+$/.test(email);
}

export interface SignUpValidationErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  agreedToTerms?: string;
}

/** Mirrors `Auth.jsx`'s `validate()` for signup mode. */
export function validateSignUp(values: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreedToTerms: boolean;
}): SignUpValidationErrors {
  const errors: SignUpValidationErrors = {};
  if (!values.firstName.trim()) errors.firstName = 'First name is required';
  if (!values.lastName.trim()) errors.lastName = 'Last name is required';
  if (!values.email) errors.email = 'Email is required';
  else if (!isValidEmail(values.email)) errors.email = 'Invalid email';
  if (!values.password) errors.password = 'Password is required';
  else {
    const { valid, message } = validatePassword(values.password);
    if (!valid) errors.password = message;
  }
  if (values.password !== values.confirmPassword) errors.confirmPassword = 'Passwords do not match';
  if (!values.agreedToTerms) {
    errors.agreedToTerms = 'You must agree to the Terms of Service and Privacy Policy to create an account';
  }
  return errors;
}

export interface LoginValidationErrors {
  email?: string;
  password?: string;
}

export function validateLogin(values: { email: string; password: string }): LoginValidationErrors {
  const errors: LoginValidationErrors = {};
  if (!values.email) errors.email = 'Email is required';
  else if (!isValidEmail(values.email)) errors.email = 'Invalid email';
  if (!values.password) errors.password = 'Password is required';
  return errors;
}
