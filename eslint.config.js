import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // apps-script/** gira come progetto Google Apps Script: tutti i file
    // vengono concatenati in un unico scope globale a runtime (nessun
    // import/export, nessun bundler). ESLint invece analizza ogni file in
    // isolamento, quindi non può sapere che una funzione definita in
    // Codice.js è visibile da BestLaps.js — segna come "undefined" ogni
    // globale GAS (SpreadsheetApp, Logger, PropertiesService, ecc.) e ogni
    // funzione cross-file, e come "unused" ogni funzione di primo livello
    // mai referenziata NELLO STESSO file. Non sono errori reali: sono un
    // limite strutturale di come ESLint modella (o non modella) l'esecuzione
    // GAS. La verifica reale di questi file resta node --check (sintassi)
    // prima di ogni commit, come da convenzione già in uso in questo repo.
    files: ['apps-script/**/*.js'],
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },
  {
    // api/** sono Vercel Functions (Edge o Node runtime) — non girano nel
    // browser, quindi servono i globali del loro ambiente di esecuzione
    // oltre a quelli browser già configurati sopra.
    files: ['api/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
])
