const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/', 'uploads/'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      // Existing codebase has many of these; keep as warnings until cleaned up task-by-task.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      'preserve-caught-error': 'warn',
    },
  },
];
