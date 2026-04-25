# VSD Paddock

> Mission control per il team **Virtual Sim-Driver** — sim racing esports.

[![Live](https://img.shields.io/badge/live-vsd--paddock.vercel.app-00d4ff)](https://vsd-paddock.vercel.app)
![Stack](https://img.shields.io/badge/stack-React%20%2B%20Vite-3b8bff)
![Phase](https://img.shields.io/badge/phase-1%20vetrina-f5a623)

Hub centrale del team: roster piloti, calendario gare, database tempi, race report e moduli operativi futuri.

## 🏁 Cosa contiene

- **Mission Control** — landing personalizzata con prossima gara (countdown live), best laps personali, activity feed del team, staff desk per admin
- **Roster** — griglia piloti filtrabile per sim e stato, profili pubblici
- **Profilo Pilota** — hero, statistiche aggregate, best laps personali, storico gare
- **Best Laps Database** — modalità "Tutti i tempi" + "Leaderboard" per combo sim/track/car con podio evidenziato
- **Race Hub** — gare programmate con countdown e iscritti, storico gare
- **Race Report** — vista raggruppata per gara o cronologica, rating staff visibili solo a staff
- **Stub futuri** — Training Scheduler, VSD Academy (licenze), Endurance Planner

## 🛠 Stack

- **Frontend**: React 19 + Vite + React Router + TanStack Query
- **Backend**: Google Apps Script + Google Sheets *(in arrivo, Fase 2)*
- **Hosting**: Vercel — auto-deploy da `main` su ogni push
- **Auth**: codice pilota personale (mock in Fase 1, reale in Fase 2)

## 🎨 Design system

Tokens basati sui colori del logo VSD:

| Token | Valore |
|---|---|
| `--vsd-bg` | `#060d1f` (blu scuro) |
| `--vsd-cyan` | `#00d4ff` (primary) |
| `--vsd-blue` | `#3b8bff` (secondary) |
| `--vsd-orange` | `#f5a623` (highlight) |
| `--vsd-red` | `#ef3340` (danger) |

Font: **Rajdhani** (display), **Inter** (body), **JetBrains Mono** (numeri/code).

## 🚦 Sim supportate

- Le Mans Ultimate (LMU)
- iRacing (iRC)
- Assetto Corsa Evo (ACE)

## 🚀 Setup locale

```bash
git clone https://github.com/crucittidemetrio/vsd-paddock.git
cd vsd-paddock
npm install
npm run dev
```

Apri http://localhost:5173.

## 🔑 Login demo (Fase 1, mock)

| Codice | Effetto |
|---|---|
| `STAFF` o `ADMIN` | login come Lorenzo Ferraro (Staff) — vedi rating, note staff, staff desk |
| `VSD001`, `VSD002`... | login come pilota specifico del roster |
| qualsiasi altro codice | login come primo driver attivo |

In Fase 2 questi codici saranno verificati contro il foglio Google `Drivers`.

## 🗺️ Roadmap

- [x] **Fase 1** — Vetrina con mock data, design system, deploy Vercel
- [ ] **Fase 2** — Backend Apps Script, login reale, persistenza
- [ ] **Fase 3** — Modulo Training Scheduler
- [ ] **Fase 4** — Modulo VSD Academy
- [ ] **Fase 5** — Modulo Endurance Planner

## 📝 Licenza

Privato — uso interno team Virtual Sim-Driver.