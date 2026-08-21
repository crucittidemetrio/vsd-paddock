# Runbook — ottimizzazione bot Discord VSD (parte 2)

Segue l'audit (`audit_bot_discord_vsd.md`). Apollo e PollBot sono già risolti via API nativa Discord (Eventi pianificati per tutti i 15 round attivi + sondaggio prequalifiche ACI in `#bar-sport`). Qui c'è quello che resta: **Carl-bot** e **Statbot**, che vivono in dashboard di terze parti e richiedono il tuo login — non posso configurarli io direttamente. Sotto trovi i passi esatti e i testi già pronti da incollare.

---

## 1. Carl-bot — Reaction Roles

**Nota sulla scelta fatta:** le reazioni sono collegate direttamente ai ruoli `Pilota VSD LMU`, `Pilota VSD IRC`, `Pilota VSD ACE` già esistenti — non a ruoli-notifica separati. Questo significa che **chiunque nel server potrà autoassegnarsi lo status di Pilota VSD cliccando un'emoji**, senza passare dalla verifica manuale che lo staff fa oggi in `accesso-come-pilota-vsd`. Scelta tua, confermata due volte — la riporto qui solo perché chi altro dello staff legge questo runbook deve saperlo prima di attivarlo.

Per l'ACI LMGT3 Challenge non esisteva un ruolo roster equivalente (non è un roster VSD), quindi ho creato un ruolo dedicato **🔔 Notifiche ACI LMGT3** (mentionable, nessun permesso speciale) — quello sì è solo un opt-in alle notifiche, nessuna implicazione di status.

### Passi
1. Vai su **carl.gg** → accedi con l'account Discord che ha permessi admin su Virtual Sim Driver → **Manage Server**.
2. Dashboard → **Reaction Roles** → **New Message**.
3. Canale destinazione: `🤖comandi-bot` (è il canale già dedicato ai bot, oggi quasi vuoto — gli dà finalmente uno scopo).
4. Testo del messaggio, incolla così:

   ```
   🔔 **Scegli le tue notifiche**
   Reagisci per ricevere il ping quando iniziamo una sessione della categoria che segui. Puoi selezionarne quante vuoi, e togliere la reazione in qualsiasi momento per disattivare.

   🏎️ Le Mans Ultimate (UE144)
   🏁 iRacing
   🚗 Assetto Corsa Evo (ACE)
   📖 ACI LMGT3 Challenge
   ```

5. Collega le reazioni:

   | Emoji | Ruolo |
   |---|---|
   | 🏎️ | `Pilota VSD LMU` |
   | 🏁 | `Pilota VSD IRC` |
   | 🚗 | `Pilota VSD ACE` |
   | 📖 | `🔔 Notifiche ACI LMGT3` |

6. Salva e pubblica.

### Tag custom (comandi rapidi)
Dashboard → **Tags** → **New Tag**. Uno per volta:

| Comando | Risposta |
|---|---|
| `!ue144` | `📄 UE144 — info, regolamento, classifica: https://vsd-paddock.vercel.app/ue144` |
| `!clash` | `📄 Clash of Classes — info, regolamento, classifica: https://vsd-paddock.vercel.app/clash-of-classes` |
| `!aci` | `📄 ACI LMGT3 Challenge — info, calendario, Story Book: https://vsd-paddock.vercel.app/aci-lmgt3-challenge` |
| `!paddock` | `🏁 VSD Paddock — tutto il sito: https://vsd-paddock.vercel.app` |

Tempo stimato totale: 10-15 minuti.

---

## 2. Statbot — analytics automatiche (sostituisce l'inserimento a mano)

Oggi nel Social Manager i follower/membri Discord si inseriscono a mano in Metriche. Statbot lo fa gratis, con storico.

### Passi
1. Vai su **statbot.net** → **Login** → seleziona Virtual Sim Driver.
2. **Members** → attiva il tracking attività (se non già attivo di default) — questo è ciò che poi alimenta le classifiche.
3. **Channels → Stat Channels/Counters**: oltre al contatore membri già presente ("All Members: 113"), aggiungi un secondo contatore nella stessa categoria `📊 SERVER STATS` per i membri online in un dato momento — utile per capire quando il server è più vivo, comodo per decidere gli orari delle prossime gare.
4. **Leaderboard**: dalla dashboard puoi vedere i membri/canali più attivi. Non serve configurazione aggiuntiva, è già lì una volta attivato il tracking — controllalo periodicamente invece di inserire i numeri a mano.
5. (Opzionale, valuta con calma) **Statroles**: assegna automaticamente un ruolo tipo "Attivo del mese" a chi scrive di più — solo se vuoi gamificare la community generale, non è urgente.

Tempo stimato: 5-10 minuti per l'attivazione base.

---

## 3. Maki.gg — leveling community (bassa priorità)

Un solo switch: dashboard **maki.gg/dashboard** → **Leveling** → **Enable**. Premia chi scrive nei canali community (`bar-sport`, `chat-pubblica`), non le performance in pista (quelle restano su Punti Merito/Academy nel sito — sistemi distinti, non serve farli parlare tra loro). Nessuna configurazione ulteriore necessaria, i default vanno bene per iniziare.

---

## 4. ChronicleBot — non serve, per ora

Fa sync Google Calendar → Eventi Discord. Ora che i 15 round (UE144, Clash, ACI) hanno già un Evento Discord nativo con RSVP creato via API, configurarlo creerebbe eventi duplicati sullo stesso calendario. Ha senso solo se in futuro vuoi anche un Google Calendar "vetrina" che si aggiorna da solo — non prioritario, lo riprendiamo se emerge l'esigenza.

---

## Riepilogo stato

| Bot | Stato |
|---|---|
| Apollo → Eventi nativi | ✅ Fatto (15 round) |
| PollBot → sondaggio nativo | ✅ Fatto (`#bar-sport`) |
| Carl-bot | 🔲 Da fare tu (10-15 min, guida sopra) |
| Statbot | 🔲 Da fare tu (5-10 min, guida sopra) |
| Maki.gg | 🔲 Da fare tu (1 switch, facoltativo) |
| ChronicleBot | ⏸ Rimandato, ridondante per ora |
