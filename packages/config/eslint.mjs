import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Shared ESLint flat config for the Node packages (api, shared). The web app uses eslint-config-next instead. */
export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'src/generated/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
