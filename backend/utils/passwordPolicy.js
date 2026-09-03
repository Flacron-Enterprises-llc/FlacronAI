const PASSWORD_MIN_LENGTH = 12;

const PASSWORD_REQUIREMENTS_MESSAGE =
  `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include an uppercase letter, ` +
  'a lowercase letter, a number, and a special character.';

// Shared by /auth/register and both change-password endpoints so signup and
// password changes enforce the same strength rules (login is intentionally
// exempt — see Golden Rule notes in CLAUDE.md on not breaking existing users).
const isStrongPassword = (value) => {
  if (typeof value !== 'string' || value.length < PASSWORD_MIN_LENGTH) return false;
  if (!/[A-Z]/.test(value)) return false;
  if (!/[a-z]/.test(value)) return false;
  if (!/[0-9]/.test(value)) return false;
  if (!/[^A-Za-z0-9]/.test(value)) return false;
  return true;
};

module.exports = { PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS_MESSAGE, isStrongPassword };
