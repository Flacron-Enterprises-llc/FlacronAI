export const PASSWORD_MIN_LENGTH = 12;

export const PASSWORD_REQUIREMENTS_HINT =
  `At least ${PASSWORD_MIN_LENGTH} characters, with an uppercase letter, a lowercase letter, a number, and a special character.`;

// Shared by Sign Up (Auth.jsx), Enterprise Onboarding, and Change Password
// (Settings.jsx) — never applied to the login form.
export const validatePassword = (password) => {
  const missing = [];
  if (!password || password.length < PASSWORD_MIN_LENGTH) missing.push(`${PASSWORD_MIN_LENGTH}+ characters`);
  if (!/[A-Z]/.test(password || '')) missing.push('an uppercase letter');
  if (!/[a-z]/.test(password || '')) missing.push('a lowercase letter');
  if (!/[0-9]/.test(password || '')) missing.push('a number');
  if (!/[^A-Za-z0-9]/.test(password || '')) missing.push('a special character');

  if (missing.length === 0) return { valid: true, message: '' };
  return { valid: false, message: `Password needs ${missing.join(', ')}.` };
};
