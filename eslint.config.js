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
    rules: {
      // Idioma comune nel repo: destructuring per ESCLUDERE una chiave
      // prima di inviare il resto altrove (es. `({ _localId, ...rest })
      // => rest` in useStintPlanner.js). La binding "_localId" è
      // intenzionalmente non referenziata — è lì solo per toglierla da
      // "rest" — non un residuo dimenticato. Opzione dedicata di ESLint
      // per questo esatto pattern, non una disattivazione generica.
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
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
      // Pattern intenzionale e ripetuto nel repo: cache invalidation
      // "best effort" dopo un salvataggio riuscito — se fallisce non
      // deve mai bloccare l'operazione principale (stesso spirito di
      // postToDiscord_, sempre fault-tolerant). Es. Endurance.js:
      // `try { invalidateSheetCache_(...) } catch (e) {}`.
      'no-empty': ['error', { allowEmptyCatch: true }],
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
  {
    // Il service worker gira nel suo scope globale dedicato (self,
    // clients, caches, registration...), non nello scope window del
    // resto del frontend — servono i globali "serviceworker".
    files: ['public/sw.js'],
    languageOptions: {
      globals: globals.serviceworker,
    },
  },
])
