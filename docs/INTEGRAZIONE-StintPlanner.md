# StintPlanner UI — Nota di integrazione

Preparato lontano dal PC principale. I due file (`StintPlanner.jsx`, `StintPlanner.module.css`)
sono una **bozza basata su assunzioni**: consumano l'hook `useStintPlanner` (già in repo) ma
fanno ipotesi sui nomi di altri hook/campi che vanno verificate. Sotto: dove mettere i file,
cosa controllare, e come collaudare.

---

## 1. Posizione file
- `StintPlanner.jsx`         → `src/pages/StintPlanner.jsx`  (o dove tieni le pagine admin)
- `StintPlanner.module.css`  → `src/pages/StintPlanner.module.css`  (stessa cartella del jsx)

Se i tuoi file admin (es. AdminRaceStints.jsx) stanno in `src/pages/` o `src/pages/admin/`,
mettili lì e allinea gli import relativi (`../hooks/...`, `../api/...`).

---

## 2. STATO AGGANCI (verificato contro AdminRaceStints.jsx + useRoster.js)

### 2.1 Nomi hook — ✓ CONFERMATO
`useRace` da '../hooks/useRaces' (singola gara, confermato), `useDrivers` da '../hooks/useRoster',
`useStints` da '../hooks/useEnduranceStints', `Avatar` da '../components/shared/Avatar'.
Tutti identici agli import reali di AdminRaceStints.jsx. Ritornano oggetti TanStack Query ({ data }).

### 2.2 Campi gara — ✓ CONFERMATO
`race.race_name`, `race.sim`, `race.date?.slice(0,10)`. Uso `useRace(raceId)` (carica la
singola gara, più efficiente del find su tutte). Tollero sia `{race}` che oggetto diretto.
`race.duration_minutes` e `race.format` sono solo default/display — se assenti, il form parte
coi default (1440 min) senza rompersi.

### 2.3 Campi pilota — ✓ CONFERMATO
`d.driver_id`, `d.display_name`, `d.status` ('active'/'trial'). Stesso filtro di AdminRaceStints.

### 2.4 Route di ritorno — ✓ CONFERMATO
Il bottone "← Gestione stint" punta a `/admin/race/${raceId}/stints`, che è ESATTAMENTE
la route reale di AdminRaceStints in App.jsx. Nessuna correzione necessaria.

### 2.5 Validazione: LIVE (scelta presa)
Ho scelto validazione live: `validate(...)` viene richiamato in un useMemo a ogni modifica
del piano (è client-side, sincrono, gratis — il valore del validatore puro).
NOTA TECNICA: chiamare validate() dentro useMemo funziona ma è un po' "sporco" perché
validate aggiorna anche lo state `validation` dell'hook (doppia fonte). Se in React 19 dà
warning, alternativa pulita: NON usare lo state validation dell'hook, e calcolare qui
direttamente con `validatePlanCoverage(plan, startTime, totalDuration)` importandola da
`../utils/stintValidation`. Valuta al collaudo. Se preferisci on-demand, sostituisci lo
useMemo con un bottone "Valida" che chiama validate().

---

## 3. Route da aggiungere (App.jsx) — VERIFICATO
Le pagine admin usano il wrapper `<AdminRoute>` (già staff-aware) e il pattern lazy.

(a) Import lazy, nel blocco "Lazy: pagine deep, secondarie, admin":
```js
const StintPlanner        = lazy(() => import('./pages/StintPlanner'));
```

(b) Route, SUBITO DOPO quella di AdminRaceStints (`/admin/race/:raceId/stints`):
```jsx
<Route
  path="/admin/race/:raceId/stint-planner"
  element={<AdminRoute><StintPlanner /></AdminRoute>}
/>
```
NB: usa AdminRoute (NON RequireTier) — è il pattern reale delle altre route admin.

---

## 4. Bottone di accesso (da AdminRaceStints.jsx) — VERIFICATO
In AdminRaceStints.jsx, accanto al bottone "+ Aggiungi stint" (dentro .sectionHeader),
aggiungi un Link al planner. `Link` è già importato in AdminRaceStints. Esempio:
```jsx
<Link to={`/admin/race/${raceId}/stint-planner`} className={styles.addBtn}>
  ⚡ Pianifica automaticamente
</Link>
```
Riusa la classe styles.addBtn esistente per coerenza visiva.

---

## 5. Collaudo (al ritorno)
1. `npm run build` — becca subito import rotti / nomi hook sbagliati. NON committare se rosso.
2. `npm run dev` → vai su /admin/race/<un-race-id-endurance>/stint-planner
3. Imposta: inizio gara, durata (es. 360 per 6h), target 90, seleziona 3-4 piloti.
4. "Genera piano" → deve apparire la tabella con gli stint + badge "Copertura valida".
5. Cambia un orario a mano per creare un buco → il badge deve diventare rosso e listare
   l'issue (gap/overlap), e la riga coinvolta evidenziarsi.
6. "Conferma e scrivi piano" → doppio confirm → verifica che gli stint compaiano in
   AdminRaceStints e nella StintTimeline pubblica.
7. NB: confirmPlan NON è mai stato testato dal vivo (era solo verificato per review).
   Questo è il primo collaudo reale della scrittura batch — controlla che gli stint scritti
   abbiano i campi giusti (status 'planned', orari, piloti) e che replace_existing funzioni
   (rigenera e riconferma: non devono accumularsi).

---

## 6. Rifiniture rimandabili (non bloccano il collaudo)
- Avviso "cambio ora" sugli stint che attraversano il DST (legato al bug DST noto, Opzione B).
- Limiti piloti nel validatore (ore max, riposo) — v2.
- Ordinamento/drag degli stint (ora l'ordine è fisso dal generatore).
- Persistenza dei parametri del form tra una sessione e l'altra.

---

## 7. Se qualcosa non torna
Il pezzo più fragile è l'aggancio agli hook esistenti (sez. 2.1). Se il build fallisce,
quasi certamente è un nome di hook o un campo. Apri AdminRaceStints.jsx come riferimento:
fa già esattamente le stesse cose (carica gare, carica piloti, scrive stint) — il planner
deve usare gli stessi identici hook e campi. Allinea a quello e il resto segue.
