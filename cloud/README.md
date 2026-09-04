# VSD-Paddock Cloud (Supabase) — progetto parallelo

Vedi `docs/ADR-multi-team-saas.md` (Opzione D) per il contesto completo della decisione.

## Cos'è

Un secondo backend, multi-tenant, su Supabase (Postgres + Auth + RLS + Realtime), pensato per rendere VSD-Paddock disponibile ad altri team come abbonamento web.

**Non è una migrazione**: `apps-script/` e il resto del repo restano invariati e continuano a servire VSD Virtual Sim Driver esattamente come oggi. Questo è un build nuovo, in una cartella separata, che non tocca né il foglio `VSD_HUB_DB` né i deployment Apps Script esistenti.

## Stato

In costruzione, fase fondamenta. Nessun team reale (nemmeno VSD) è ancora su questo stack.

## Perché i campi sono quelli che sono

Ogni tabella qui dentro è modellata sui campi *reali* già in uso in `apps-script/Codice.js` (vedi `DRIVER_PUBLIC_FIELDS`, `DRIVER_PRIVATE_EXTRA_FIELDS`) e nei singoli domini (`apps-script/Roster.js`, ecc.) — non è uno schema generico "SaaS" scritto a tavolino. Dove il nome cambia (es. `driver_id` → `driver_code`) è annotato nel commento SQL.

## Ordine di porting (vedi task tracker)

1. Fondamenta: `teams` + `drivers` + RLS — **in corso**
2. Auth: Supabase Auth + Discord OAuth
3. Roster (`roster.*`)
4. Calendario / Team Sessions (`races.*`, `teamSessions.*`, `sessionRsvp.*`)
5. Best Laps / Academy (`laps.*`, `academy.ranking`, `records.team`)
6. Pit Wall (`pitwall.*`) + relay Realtime per viewer remoti (risolve anche il limite `localhost` attuale)
7. Billing (Lemon Squeezy/Stripe) — solo a valle, quando i domini core funzionano

## Struttura

```
cloud/
  README.md          questo file
  schema/             migrazioni SQL, in ordine numerico
```
