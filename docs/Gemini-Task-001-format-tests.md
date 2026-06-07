# Task #001 per Gemini — Test Vitest per `src/utils/format.js`

> **Owner architetturale**: Claude — chiedi a Demetrio di girarmi qualsiasi dubbio architetturale
> **Branch**: `sprint-0-vitest-setup` (continua su questo, NON crearne uno nuovo)
> **Stima**: 45-60 min
> **Tipo task**: scrittura test, scope chiuso, zero decisioni architetturali

---

## 1. Contesto preliminare

Hai già ricevuto il documento `VSD-Paddock-Architecture-Master.md` che descrive il progetto. Se non l'hai, chiedilo a Demetrio prima di procedere.

Vitest 4.1.8 è stato appena configurato (commit di Claude). Setup:
- Config integrato in `vite.config.js` con `test: { globals: true, environment: 'jsdom', setupFiles: ['./src/test/setup.js'] }`
- `@testing-library/jest-dom` matchers caricati globalmente via `src/test/setup.js`
- Smoke test esistente in `src/__tests__/smoke.test.js` (4 test, tutti verdi)
- Script: `npm run test:run` (singolo run), `npm test` (watch mode)

---

## 2. Obiettivo

Creare **un singolo file** `src/utils/format.test.js` con suite di test per le **12 funzioni esportate** da `src/utils/format.js`.

Target: **30-40 test totali**, minimo 2 per funzione (1 happy path + 1+ edge case).

---

## 3. Funzioni da testare

Dal modulo `src/utils/format.js`:

| Funzione | Input | Output |
|---|---|---|
| `formatTrack(track_id, tracks)` | track_id string, tracks array | display name string |
| `formatTrackInfo(track_id, tracks)` | track_id, tracks array | `{ name, sim }` |
| `formatCar(car_id, cars)` | car_id, cars array | display name |
| `formatCarInfo(car_id, cars)` | car_id, cars array | `{ name, category, race_class, sim }` |
| `formatDate(iso)` | ISO date string | "DD MMM YY" italiano |
| `formatDateTime(iso)` | ISO date string | "DD MMM YY, HH:MM" italiano |
| `formatLapDelta(ms, refMs)` | numbers | "+0.456" o "-0.456" |
| `formatGapPercent(myMs, recordMs)` | numbers | "+2.394s / +1.18%" |
| `countdown(iso)` | ISO date string future/past | `{ days, hours, minutes, isPast }` |
| `formatCountdown(iso)` | ISO date string | "Xg Yh" o "Yh Zm" o "Conclusa" |
| `formatRaceDateTime(iso)` | ISO date string | "data · ora" italiano |
| `formatDuration(minutes)` | number | "1h 30min" |

---

## 4. Pattern e convenzioni richieste

### 4.1 Import

Vitest globals sono enabled, ma per chiarezza importa esplicitamente:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatTrack,
  formatTrackInfo,
  formatCar,
  formatCarInfo,
  formatDate,
  formatDateTime,
  formatLapDelta,
  formatGapPercent,
  countdown,
  formatCountdown,
  formatRaceDateTime,
  formatDuration,
} from './format';
```

### 4.2 Struttura

Un `describe` per funzione:

```js
describe('formatTrack', () => {
  it('returns track_name from array when track_id matches', () => {
    const tracks = [{ track_id: 'lmu-spa-gp', track_name: 'Spa', sim: 'LMU' }];
    expect(formatTrack('lmu-spa-gp', tracks)).toBe('Spa');
  });

  it('matches case-insensitively on track_id', () => {
    const tracks = [{ track_id: 'LMU-SPA-GP', track_name: 'Spa' }];
    expect(formatTrack('lmu-spa-gp', tracks)).toBe('Spa');
  });

  it('falls back to TRACK_NAMES constant when not in array', () => {
    expect(formatTrack('spa-gp', [])).toBe('Spa-Francorchamps');
  });

  it('returns track_id unchanged when not found anywhere', () => {
    expect(formatTrack('unknown-track-id', [])).toBe('unknown-track-id');
  });

  it('returns em-dash for null/undefined/empty input', () => {
    expect(formatTrack(null, [])).toBe('—');
    expect(formatTrack('', [])).toBe('—');
    expect(formatTrack(undefined, [])).toBe('—');
  });
});
```

### 4.3 Edge cases obbligatori per ogni funzione

| Tipo input | Edge case |
|---|---|
| String input | null, undefined, '', whitespace-only |
| Number input | 0, negative, NaN, Infinity |
| Array lookup | empty array `[]`, missing array (undefined), array with no match |
| Date ISO | invalid date string, far future, far past |

### 4.4 Funzioni che richiedono mock del tempo

`countdown` e `formatCountdown` usano `Date.now()`. Per test deterministici **OBBLIGATORIO** usare fake timers:

```js
describe('countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-07T08:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns isPast=false for future date', () => {
    const result = countdown('2026-06-10T08:00:00.000Z');
    expect(result.isPast).toBe(false);
    expect(result.days).toBe(3);
  });

  it('returns isPast=true for past date', () => {
    const result = countdown('2026-06-05T08:00:00.000Z');
    expect(result.isPast).toBe(true);
    expect(result.days).toBe(2);
  });
});
```

### 4.5 Funzioni con formatting locale (CAUTION)

`formatDate`, `formatDateTime`, `formatRaceDateTime` usano `toLocaleDateString('it-IT')`. L'output esatto dipende da implementazione JS/jsdom.

**NON** fare `expect(formatDate(iso)).toBe('07 giu 26')` perché fragile.

**Pattern raccomandato**: assertion su shape via regex o assertion semantica:

```js
it('returns non-empty string for valid ISO', () => {
  const result = formatDate('2026-06-07T08:00:00.000Z');
  expect(result).toMatch(/\d{1,2}.+\d{2}/);  // contiene cifre
  expect(result).not.toBe('—');
});

it('returns em-dash for null', () => {
  expect(formatDate(null)).toBe('—');
});
```

---

## 5. Acceptance criteria

- [ ] File creato: `src/utils/format.test.js`
- [ ] Tutte le 12 funzioni hanno almeno 1 describe block
- [ ] Ogni funzione ha minimo 2 test (happy + edge), idealmente 3-4
- [ ] Test totali: **30-40**
- [ ] `npm run test:run` → tutti i test verdi (smoke + format)
- [ ] No `console.warn` o errori nel output
- [ ] Test name in inglese, format: `"returns X when Y"` o `"handles X"`

---

## 6. Cose da NON fare

- ❌ NON modificare `src/utils/format.js` (production code immutabile in questo task)
- ❌ NON creare altri file di test (solo `format.test.js`)
- ❌ NON installare dipendenze
- ❌ NON usare snapshot test (`toMatchSnapshot`) — preferiamo assertion esplicite
- ❌ NON testare locale strings con assertion exact (vedi §4.5)
- ❌ NON modificare `vite.config.js`, `package.json`, `src/test/setup.js`
- ❌ NON usare `expect(...).toEqual(...)` per primitives (usa `toBe`)
- ❌ NON commentare codice in italiano dentro i test (commenti in inglese o assenti)

---

## 7. Domande architetturali in caso di dubbi

Se durante l'implementazione hai dubbi su:
- Comportamento atteso di una funzione (es. "cosa dovrebbe ritornare se `tracks` è undefined invece di array?")
- Pattern Vitest avanzati
- Convenzioni del progetto

Fermati e chiedi a Demetrio di girare la domanda a Claude. NON inventare.

---

## 8. Verifica finale

Demetrio runa:

```powershell
cd C:\Users\Demetrio\Dev\vsd-paddock
npm run test:run
```

Output atteso:

```
 ✓ src/__tests__/smoke.test.js (4 tests)
 ✓ src/utils/format.test.js (30-40 tests)
 Test Files  2 passed (2)
      Tests  34+ passed
```

Quando tutto verde:

```powershell
git add src/utils/format.test.js
git commit -m "test(utils): vitest coverage for format.js (12 functions)"
git push
```

---

## 9. Note finali da Claude

Ciao Gemini. Questo è il primo task che ti deleghiamo. Sii preciso e segui il brief.

Se hai dubbi sul comportamento esatto di una funzione, **non assumere**: chiedi via Demetrio. Meglio 10 min di chiarimento che 30 min di test sbagliati.

Bonus point se trovi bug nelle funzioni mentre scrivi test (es. casi non gestiti). Segnala a Demetrio, non patcharli da solo (production code frozen per il task).

Buon lavoro. — Claude
