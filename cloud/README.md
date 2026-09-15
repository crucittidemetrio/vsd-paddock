# VSD-Paddock Cloud (Supabase) — progetto parallelo

Vedi `docs/ADR-multi-team-saas.md` (Opzione D) per il contesto completo della decisione.

## Cos'è

Un secondo backend, multi-tenant, su Supabase (Postgres + Auth + RLS + Realtime), pensato per rendere VSD-Paddock disponibile ad altri team come abbonamento web.

**Non è una migrazione**: `apps-script/` e il resto del repo restano invariati e continuano a servire VSD Virtual Sim Driver esattamente come oggi. Questo è un build nuovo, in una cartella separata, che non tocca né il foglio `VSD_HUB_DB` né i deployment Apps Script esistenti.

## Stato

In costruzione. Fondamenta (teams/drivers/RLS) e dominio Roster (#177) validati end-to-end in produzione su `/admin/roster-preview`. Dominio Calendario/TeamSessions (#178/#242) portato — schema `008_team_sessions.sql` + 6 Edge Function (team-sessions-list/create/update/remove, session-rsvp-list/set) deployate, in validazione su `/admin/calendar-preview`. Le notifiche Discord (Fase 3 del sistema reale) non sono ancora portate. Nessun team reale (nemmeno VSD) è ancora su questo stack — Apps Script resta l'unico backend in produzione per il sito pubblico.

## Perché i campi sono quelli che sono

Ogni tabella qui dentro è modellata sui campi *reali* già in uso in `apps-script/Codice.js` (vedi `DRIVER_PUBLIC_FIELDS`, `DRIVER_PRIVATE_EXTRA_FIELDS`) e nei singoli domini (`apps-script/Roster.js`, ecc.) — non è uno schema generico "SaaS" scritto a tavolino. Dove il nome cambia (es. `driver_id` → `driver_code`) è annotato nel commento SQL.

## Ordine di porting (vedi task tracker)

1. Fondamenta: `teams` + `drivers` + RLS — **fatto**
2. Auth: Supabase Auth + Discord OAuth — app Discord dedicata separata dal sito reale (#244, evita che una rotazione di secret rompa l'altro); collegamento automatico Discord→driver via trigger (005)
3. Roster (`roster.*`) — **fatto**, validato end-to-end
4. Calendario / Team Sessions (`teamSessions.*`, `sessionRsvp.*`) — **fatto** (schema+Edge Function), in validazione. `races.*` deliberatamente escluso da questa fase: dipende da tabelle campionato/pista/auto non ancora portate
5. Best Laps / Academy (`laps.*`, `academy.ranking`, `records.team`)
6. Pit Wall (`pitwall.*`) + relay Realtime per viewer remoti (risolve anche il limite `localhost` attuale)
7. Billing (Lemon Squeezy/Stripe) — solo a valle, quando i domini core funzionano

## Struttura

```
cloud/
  README.md          questo file
  schema/             migrazioni SQL, in ordine numerico
```
