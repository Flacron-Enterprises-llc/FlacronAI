import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['node_modules/', 'dist/'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...js.configs.recommended.rules,
      // Classic hooks rules only — the react-hooks v7 preset adds compiler rules
      // (e.g. set-state-in-effect) that error throughout the existing codebase.
      'react-hooks/rules-of-hooks': 'error',
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      // Existing codebase has many of these; keep as warnings until cleaned up task-by-task.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
