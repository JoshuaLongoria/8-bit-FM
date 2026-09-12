import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Never lint build output, dependencies, or Developer 1's Rust crate.
  { ignores: ['dist', 'node_modules', 'src-tauri'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      // react-hooks v7 keeps its legacy eslintrc presets at the top level and
      // the flat-config ones under `configs.flat`. ESLint 10 needs the flat pair.
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      // The project rule "do not use `any`" is enforced by the linter, not by habit.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
)
